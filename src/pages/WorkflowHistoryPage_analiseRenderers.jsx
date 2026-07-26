import React, { useState, useMemo } from 'react';
import { 
    FaFileCsv, 
    FaExternalLinkAlt, 
    FaHistory, 
    FaList
} from 'react-icons/fa';
import ColumnFilter from '../components/Documents/ColumnFilter';

// Format duration helper
const formatDuration = (ms) => {
    if (!ms || isNaN(ms)) return '—';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
};

export const AnaliseModule = ({
    analyticalRows,
    analiseTab,
    selectedCabinet,
    orgId,
    gapClassifications,
    handleSetGapClassification,
    handleSelectDocument,
    getDocFieldValue
}) => {
    // KPI filter states
    const [kpiFilters, setKpiFilters] = useState({
        assinada: 'all',
        faturada: 'all',
        entrega: 'all'
    });

    const [globalSearch, setGlobalSearch] = useState('');
    const [activeSerie, setActiveSerie] = useState('G'); // for sequence tab
    const [activePeriod, setActivePeriod] = useState('all'); // for sequence tab

    // Column Filters State
    const [colFilters, setColFilters] = useState({});

    const [analiseSortField, setAnaliseSortField] = useState('docNum');
    const [analiseSortDirection, setAnaliseSortDirection] = useState('asc');
    const [analisePage, setAnalisePage] = useState(1);
    const analisePageSize = 25;

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

    // Handle sort toggle
    const handleAnaliseSort = (field) => {
        if (analiseSortField === field) {
            setAnaliseSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setAnaliseSortField(field);
            setAnaliseSortDirection('asc');
        }
        setAnalisePage(1);
    };

    // Column Filters handlers
    const toggleFilterValue = (columnName, value) => {
        setColFilters(prev => {
            const currentSelected = prev[columnName] || [];
            const nextSelected = currentSelected.includes(value)
                ? currentSelected.filter(v => v !== value)
                : [...currentSelected, value];
            return {
                ...prev,
                [columnName]: nextSelected
            };
        });
        setAnalisePage(1);
    };

    const clearColumnFilter = (columnName) => {
        setColFilters(prev => {
            const copy = { ...prev };
            delete copy[columnName];
            return copy;
        });
        setAnalisePage(1);
    };

    // Get unique values for a column dynamically from analyticalRows
    const getUniqueValues = (field, castFn) => {
        const vals = new Set();
        analyticalRows.forEach(row => {
            let val = row[field];
            if (castFn) {
                val = castFn(row);
            }
            if (val !== undefined && val !== null && val !== '') {
                vals.add(String(val));
            }
        });
        return Array.from(vals).sort();
    };

    // CSV Exporter
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
        }
    };

    // Helper to check if a row passes all column-level filters
    const passesColumnFilters = (row, fieldCasts = {}) => {
        for (const [colName, selectedVals] of Object.entries(colFilters)) {
            if (selectedVals && selectedVals.length > 0) {
                let cellVal = String(row[colName] || '');
                if (fieldCasts[colName]) {
                    cellVal = String(fieldCasts[colName](row));
                }
                if (!selectedVals.includes(cellVal)) {
                    return false;
                }
            }
        }
        return true;
    };

    // --- CONTROLE DE GRs SUB-VIEW ---
    const renderControleGRs = () => {
        const casts = {
            isAssinada: (r) => r.isAssinada ? 'Sim' : 'Não'
        };

        let filtered = analyticalRows.filter(row => {
            // Apply KPI Selection Filters
            if (kpiFilters.assinada !== 'all') {
                const expectAssinada = kpiFilters.assinada === 'Assinada';
                if (row.isAssinada !== expectAssinada) return false;
            }
            if (kpiFilters.faturada !== 'all') {
                if (kpiFilters.faturada === 'Faturada' && row.billingDecision !== 'Faturada') return false;
                if (kpiFilters.faturada === 'Não faturada' && row.billingDecision !== 'Não faturada') return false;
                if (kpiFilters.faturada === 'Aguardando' && row.billingDecision !== 'Aguardando decisão') return false;
                if (kpiFilters.faturada === 'Inconsistente' && row.billingDecision !== 'Inconsistente') return false;
            }

            // Apply Global Search Input
            if (globalSearch) {
                const search = globalSearch.toLowerCase();
                const numMatch = row.docNum.toLowerCase().includes(search);
                const clientMatch = row.cliente.toLowerCase().includes(search);
                const projectMatch = row.projecto.toLowerCase().includes(search);
                const faturaMatch = row.invoiceNum.toLowerCase().includes(search);
                const workflowMatch = row.workflowType.toLowerCase().includes(search);
                if (!numMatch && !clientMatch && !projectMatch && !faturaMatch && !workflowMatch) return false;
            }

            // Apply Column-level Filters
            if (!passesColumnFilters(row, casts)) return false;

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

        // Calculate KPIs from original list
        const total = analyticalRows.length;
        const assinadas = analyticalRows.filter(r => r.isAssinada).length;
        const aguardandoAssinatura = analyticalRows.filter(r => !r.isAssinada).length;
        const faturadas = analyticalRows.filter(r => r.billingDecision === 'Faturada').length;
        const naoFaturadas = analyticalRows.filter(r => r.billingDecision === 'Não faturada').length;
        const aguardandoDecisao = analyticalRows.filter(r => r.billingDecision === 'Aguardando decisão').length;
        const inconsistências = analyticalRows.filter(r => r.billingDecision === 'Inconsistente').length;

        const totalPages = Math.ceil(filtered.length / analisePageSize) || 1;
        const startIdx = (analisePage - 1) * analisePageSize;
        const paginatedData = filtered.slice(startIdx, startIdx + analisePageSize);

        const toggleKpiFilter = (field, value) => {
            setKpiFilters(prev => ({
                ...prev,
                [field]: prev[field] === value ? 'all' : value
            }));
            setAnalisePage(1);
        };

        return (
            <div className="space-y-6">
                {/* KPIs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
                    <div onClick={() => { setKpiFilters({ assinada: 'all', faturada: 'all', entrega: 'all' }); setGlobalSearch(''); setColFilters({}); setAnalisePage(1); }} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.assinada === 'all' && kpiFilters.faturada === 'all' ? 'border-[#4f46e5] bg-indigo-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total de GRs</div>
                        <div className="text-2xl font-black text-slate-800 mt-1 font-mono">{total}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('assinada', 'Assinada')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.assinada === 'Assinada' ? 'border-emerald-500 bg-emerald-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GRs Assinadas</div>
                        <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">{assinadas}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('assinada', 'Não Assinada')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.assinada === 'Não Assinada' ? 'border-amber-500 bg-amber-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aguardando Assinatura</div>
                        <div className="text-2xl font-black text-amber-600 mt-1 font-mono">{aguardandoAssinatura}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('faturada', 'Faturada')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.faturada === 'Faturada' ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GRs Faturadas</div>
                        <div className="text-2xl font-black text-indigo-600 mt-1 font-mono">{faturadas}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('faturada', 'Não faturada')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.faturada === 'Não faturada' ? 'border-rose-500 bg-rose-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GRs Não Faturadas</div>
                        <div className="text-2xl font-black text-rose-600 mt-1 font-mono">{naoFaturadas}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('faturada', 'Aguardando')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.faturada === 'Aguardando' ? 'border-slate-400 bg-slate-50' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aguardando Decisão</div>
                        <div className="text-2xl font-black text-slate-600 mt-1 font-mono">{aguardandoDecisao}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('faturada', 'Inconsistente')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.faturada === 'Inconsistente' ? 'border-red-500 bg-red-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Faturadas Sem Nº</div>
                        <div className="text-2xl font-black text-red-600 mt-1 font-mono">{inconsistências}</div>
                    </div>
                </div>

                {/* Unified Import Style Header */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-t-xl border-b-0 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <input 
                            type="text" 
                            placeholder="Buscar por GR, Cliente, Projecto..." 
                            className="input input-bordered input-sm bg-white text-slate-700 text-xs border-slate-300 rounded-full w-full md:w-72 px-4 h-9" 
                            value={globalSearch} 
                            onChange={e => { setGlobalSearch(e.target.value); setAnalisePage(1); }} 
                        />
                        <button 
                            onClick={() => exportAnaliseTableToCsv('Controle_GRs', ['GR', 'Série', 'Data da GR', 'Cliente', 'Assinada', 'Entrega', 'Tipo de fluxo', 'Situação do workflow', 'Decisão de faturação', 'Nº da fatura'], ['docNum', 'serie', 'dataGR', 'cliente', 'isAssinada', 'entregaType', 'workflowType', 'workflowStatus', 'billingDecision', 'invoiceNum'], filtered)} 
                            className="btn btn-sm border-emerald-600 text-emerald-600 bg-white hover:bg-emerald-50 hover:border-emerald-700 border-2 gap-2 rounded-full font-bold h-9 px-4 text-xs shrink-0"
                            disabled={filtered.length === 0}
                        >
                            <FaFileCsv className="text-emerald-600 text-sm" />
                            <span>Exportar Excel</span>
                        </button>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-4 text-xs text-slate-500 font-semibold w-full md:w-auto shrink-0 select-none">
                        <span>Exibindo {filtered.length} de {analyticalRows.length} processos</span>
                        <div className="flex gap-1">
                            <button 
                                className="btn btn-xs btn-outline border-slate-300 text-slate-600 rounded-full w-7 h-7 flex items-center justify-center p-0" 
                                disabled={analisePage === 1} 
                                onClick={() => setAnalisePage(prev => prev - 1)}
                            >
                                &lt;
                            </button>
                            <button 
                                className="btn btn-xs btn-outline border-slate-300 text-slate-600 rounded-full w-7 h-7 flex items-center justify-center p-0" 
                                disabled={analisePage === totalPages} 
                                onClick={() => setAnalisePage(prev => prev + 1)}
                            >
                                &gt;
                            </button>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white border border-slate-200 rounded-b-xl shadow-sm overflow-hidden border-t-0">
                    <table className="table table-compact w-full">
                        <thead>
                            <tr className="bg-[#e0f2fe] text-slate-700 border-b border-blue-100 text-[10px] uppercase font-bold">
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('docNum')} className="cursor-pointer hover:text-indigo-600">GR {analiseSortField === 'docNum' ? (analiseSortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        <ColumnFilter column={{ name: 'docNum', label: 'GR' }} uniqueValues={getUniqueValues('docNum')} selectedValues={colFilters['docNum'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('serie')} className="cursor-pointer hover:text-indigo-600">Série</span>
                                        <ColumnFilter column={{ name: 'serie', label: 'Série' }} uniqueValues={getUniqueValues('serie')} selectedValues={colFilters['serie'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('dataGR')} className="cursor-pointer hover:text-indigo-600">Data da GR</span>
                                        <ColumnFilter column={{ name: 'dataGR', label: 'Data GR' }} uniqueValues={getUniqueValues('dataGR')} selectedValues={colFilters['dataGR'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('cliente')} className="cursor-pointer hover:text-indigo-600">Cliente</span>
                                        <ColumnFilter column={{ name: 'cliente', label: 'Cliente' }} uniqueValues={getUniqueValues('cliente')} selectedValues={colFilters['cliente'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('isAssinada')} className="cursor-pointer hover:text-indigo-600">Assinada</span>
                                        <ColumnFilter column={{ name: 'isAssinada', label: 'Assinada' }} uniqueValues={['Sim', 'Não']} selectedValues={colFilters['isAssinada'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('entregaType')} className="cursor-pointer hover:text-indigo-600">Entrega</span>
                                        <ColumnFilter column={{ name: 'entregaType', label: 'Entrega' }} uniqueValues={getUniqueValues('entregaType')} selectedValues={colFilters['entregaType'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('workflowType')} className="cursor-pointer hover:text-indigo-600">Tipo de fluxo</span>
                                        <ColumnFilter column={{ name: 'workflowType', label: 'Tipo fluxo' }} uniqueValues={getUniqueValues('workflowType')} selectedValues={colFilters['workflowType'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('workflowStatus')} className="cursor-pointer hover:text-indigo-600">Situação workflow</span>
                                        <ColumnFilter column={{ name: 'workflowStatus', label: 'Status workflow' }} uniqueValues={getUniqueValues('workflowStatus')} selectedValues={colFilters['workflowStatus'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('billingDecision')} className="cursor-pointer hover:text-indigo-600">Decisão faturação</span>
                                        <ColumnFilter column={{ name: 'billingDecision', label: 'Decisão faturação' }} uniqueValues={getUniqueValues('billingDecision')} selectedValues={colFilters['billingDecision'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('invoiceNum')} className="cursor-pointer hover:text-indigo-600">Nº Fatura</span>
                                        <ColumnFilter column={{ name: 'invoiceNum', label: 'Nº Fatura' }} uniqueValues={getUniqueValues('invoiceNum')} selectedValues={colFilters['invoiceNum'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="text-center py-3 select-none">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan="11" className="text-center py-12 text-slate-400 italic">Nenhum processo encontrado.</td>
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
                </div>
            </div>
        );
    };

    // --- ARMAZÉM E ENTREGAS SUB-VIEW ---
    const renderArmazemEntregas = () => {
        const casts = {
            isAssinada: (r) => r.isAssinada ? 'Sim' : 'Não',
            tecnico: (r) => getDocFieldValue(r.doc, 'TECNICO') || getDocFieldValue(r.doc, 'Técnico') || ''
        };

        let filtered = analyticalRows.filter(row => {
            // Apply KPI selection
            if (kpiFilters.assinada !== 'all') {
                const expectAssinada = kpiFilters.assinada === 'Assinada';
                if (row.isAssinada !== expectAssinada) return false;
            }
            if (kpiFilters.entrega !== 'all' && row.entregaType !== kpiFilters.entrega) return false;

            // Apply Global Search
            if (globalSearch) {
                const search = globalSearch.toLowerCase();
                const numMatch = row.docNum.toLowerCase().includes(search);
                const clientMatch = row.cliente.toLowerCase().includes(search);
                const tecnico = casts.tecnico(row);
                const tecnicoMatch = tecnico.toLowerCase().includes(search);
                const stageMatch = row.etapaAtual.toLowerCase().includes(search);
                if (!numMatch && !clientMatch && !tecnicoMatch && !stageMatch) return false;
            }

            // Apply Column filters
            if (!passesColumnFilters(row, casts)) return false;

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

        const total = filtered.length;
        const aguardandoAssinatura = analyticalRows.filter(r => !r.isAssinada).length;
        const borderAguardando = kpiFilters.assinada === 'Não Assinada' ? 'border-amber-500 bg-amber-50/10' : 'border-slate-200';
        const borderAssinadas = kpiFilters.assinada === 'Assinada' ? 'border-emerald-500 bg-emerald-50/10' : 'border-slate-200';
        const borderTotal = kpiFilters.entrega === 'Total' ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-200';
        const borderParcial = kpiFilters.entrega === 'Parcial' ? 'border-amber-500 bg-amber-50/10' : 'border-slate-200';
        const borderNaoEntregues = kpiFilters.entrega === 'Não Entregue' ? 'border-rose-500 bg-rose-50/10' : 'border-slate-200';
        const borderDevolvidas = kpiFilters.entrega === 'Devolvido ao Armazém' ? 'border-purple-500 bg-purple-50/10' : 'border-slate-200';

        const assinadas = analyticalRows.filter(r => r.isAssinada).length;
        const entregaTotal = analyticalRows.filter(r => r.entregaType === 'Total').length;
        const entregaParcial = analyticalRows.filter(r => r.entregaType === 'Parcial').length;
        const naoEntregues = analyticalRows.filter(r => r.entregaType === 'Não Entregue').length;
        const devolvidoArmazém = analyticalRows.filter(r => r.workflowStatus === 'Devolvido ao Armazém' || r.workflowStatus.toLowerCase().includes('devolvido')).length;
        const parados24h = analyticalRows.filter(r => r.workflowStatus !== 'Concluido' && r.tempoParado > 24 * 3600 * 1000).length;
        const parados3d = analyticalRows.filter(r => r.workflowStatus !== 'Concluido' && r.tempoParado > 3 * 24 * 3600 * 1000).length;

        const totalPages = Math.ceil(total / analisePageSize) || 1;
        const startIdx = (analisePage - 1) * analisePageSize;
        const paginatedData = filtered.slice(startIdx, startIdx + analisePageSize);

        const toggleKpiFilter = (field, value) => {
            setKpiFilters(prev => ({
                ...prev,
                [field]: prev[field] === value ? 'all' : value
            }));
            setAnalisePage(1);
        };

        return (
            <div className="space-y-6">
                {/* KPIs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4">
                    <div onClick={() => toggleKpiFilter('assinada', 'Não Assinada')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${borderAguardando}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aguardando Assinatura</div>
                        <div className="text-2xl font-black text-amber-600 mt-1 font-mono">{aguardandoAssinatura}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('assinada', 'Assinada')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${borderAssinadas}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GRs Assinadas</div>
                        <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">{assinadas}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('entrega', 'Total')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${borderTotal}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entrega Total</div>
                        <div className="text-2xl font-black text-indigo-600 mt-1 font-mono">{entregaTotal}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('entrega', 'Parcial')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${borderParcial}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entrega Parcial</div>
                        <div className="text-2xl font-black text-amber-500 mt-1 font-mono">{entregaParcial}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('entrega', 'Não Entregue')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${borderNaoEntregues}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Não Entregue</div>
                        <div className="text-2xl font-black text-rose-600 mt-1 font-mono">{naoEntregues}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('entrega', 'Devolvido ao Armazém')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${borderDevolvidas}`}>
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

                {/* Unified Import Style Header */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-t-xl border-b-0 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <input 
                            type="text" 
                            placeholder="Buscar por GR, Cliente, Técnico..." 
                            className="input input-bordered input-sm bg-white text-slate-700 text-xs border-slate-300 rounded-full w-full md:w-72 px-4 h-9" 
                            value={globalSearch} 
                            onChange={e => { setGlobalSearch(e.target.value); setAnalisePage(1); }} 
                        />
                        <button 
                            onClick={() => exportAnaliseTableToCsv('Armazem_Entregas', ['GR', 'Série', 'Data da GR', 'Cliente', 'Técnico', 'Armazenada em', 'Assinada', 'Tipo de entrega', 'Etapa atual', 'Tempo aguardando'], ['docNum', 'serie', 'dataGR', 'cliente', 'tecnico', 'dataArmazenamento', 'isAssinada', 'entregaType', 'etapaAtual', 'tempoParado'], filtered.map(f => ({ ...f, tecnico: casts.tecnico(f) })))} 
                            className="btn btn-sm border-emerald-600 text-emerald-600 bg-white hover:bg-emerald-50 hover:border-emerald-700 border-2 gap-2 rounded-full font-bold h-9 px-4 text-xs shrink-0"
                            disabled={filtered.length === 0}
                        >
                            <FaFileCsv className="text-emerald-600 text-sm" />
                            <span>Exportar Excel</span>
                        </button>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-4 text-xs text-slate-500 font-semibold w-full md:w-auto shrink-0 select-none">
                        <span>Exibindo {filtered.length} de {analyticalRows.length} processos</span>
                        <div className="flex gap-1">
                            <button 
                                className="btn btn-xs btn-outline border-slate-300 text-slate-600 rounded-full w-7 h-7 flex items-center justify-center p-0" 
                                disabled={analisePage === 1} 
                                onClick={() => setAnalisePage(prev => prev - 1)}
                            >
                                &lt;
                            </button>
                            <button 
                                className="btn btn-xs btn-outline border-slate-300 text-slate-600 rounded-full w-7 h-7 flex items-center justify-center p-0" 
                                disabled={analisePage === totalPages} 
                                onClick={() => setAnalisePage(prev => prev + 1)}
                            >
                                &gt;
                            </button>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white border border-slate-200 rounded-b-xl shadow-sm overflow-hidden border-t-0">
                    <table className="table table-compact w-full">
                        <thead>
                            <tr className="bg-[#e0f2fe] text-slate-700 border-b border-blue-100 text-[10px] uppercase font-bold">
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('docNum')} className="cursor-pointer hover:text-indigo-600">GR {analiseSortField === 'docNum' ? (analiseSortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        <ColumnFilter column={{ name: 'docNum', label: 'GR' }} uniqueValues={getUniqueValues('docNum')} selectedValues={colFilters['docNum'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('serie')} className="cursor-pointer hover:text-indigo-600">Série</span>
                                        <ColumnFilter column={{ name: 'serie', label: 'Série' }} uniqueValues={getUniqueValues('serie')} selectedValues={colFilters['serie'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('dataGR')} className="cursor-pointer hover:text-indigo-600">Data da GR</span>
                                        <ColumnFilter column={{ name: 'dataGR', label: 'Data GR' }} uniqueValues={getUniqueValues('dataGR')} selectedValues={colFilters['dataGR'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('cliente')} className="cursor-pointer hover:text-indigo-600">Cliente</span>
                                        <ColumnFilter column={{ name: 'cliente', label: 'Cliente' }} uniqueValues={getUniqueValues('cliente')} selectedValues={colFilters['cliente'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span>Técnico</span>
                                        <ColumnFilter column={{ name: 'tecnico', label: 'Técnico' }} uniqueValues={getUniqueValues('tecnico', casts.tecnico)} selectedValues={colFilters['tecnico'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('dataArmazenamento')} className="cursor-pointer hover:text-indigo-600">Armazenada Em</span>
                                        <ColumnFilter column={{ name: 'dataArmazenamento', label: 'Armazenada Em' }} uniqueValues={getUniqueValues('dataArmazenamento')} selectedValues={colFilters['dataArmazenamento'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('isAssinada')} className="cursor-pointer hover:text-indigo-600">Assinada</span>
                                        <ColumnFilter column={{ name: 'isAssinada', label: 'Assinada' }} uniqueValues={['Sim', 'Não']} selectedValues={colFilters['isAssinada'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('entregaType')} className="cursor-pointer hover:text-indigo-600">Tipo de Entrega</span>
                                        <ColumnFilter column={{ name: 'entregaType', label: 'Entrega' }} uniqueValues={getUniqueValues('entregaType')} selectedValues={colFilters['entregaType'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('etapaAtual')} className="cursor-pointer hover:text-indigo-600">Etapa Atual</span>
                                        <ColumnFilter column={{ name: 'etapaAtual', label: 'Etapa' }} uniqueValues={getUniqueValues('etapaAtual')} selectedValues={colFilters['etapaAtual'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th onClick={() => handleAnaliseSort('tempoParado')} className="cursor-pointer py-3 hover:text-indigo-600 select-none">Tempo Aguardando</th>
                                <th className="text-center py-3 select-none">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan="11" className="text-center py-12 text-slate-400 italic">Nenhum processo operacional encontrado.</td>
                                </tr>
                            ) : paginatedData.map(row => {
                                const tecnico = casts.tecnico(row);
                                return (
                                    <tr key={row.id} className="hover:bg-slate-50/50">
                                        <td className="font-bold text-slate-800 text-[10px]">{row.docNum}</td>
                                        <td className="text-xs font-semibold text-slate-500">{row.serie || '-'}</td>
                                        <td className="text-xs text-slate-500 font-mono">{row.dataGR || '-'}</td>
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
                                        <td className="text-xs text-slate-500 font-mono font-medium">{row.tempoParado > 0 ? formatDuration(row.tempoParado) : '—'}</td>
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
                </div>
            </div>
        );
    };

    // --- FATURAÇÃO SUB-VIEW ---
    const renderFaturacao = () => {
        const casts = {
            isAssinada: (r) => r.isAssinada ? 'Sim' : 'Não'
        };

        let filtered = analyticalRows.filter(row => {
            if (row.serie !== 'V' && row.serie !== 'G') return false;

            // Apply KPI Filter
            if (kpiFilters.faturada !== 'all') {
                if (kpiFilters.faturada === 'Faturada' && row.billingDecision !== 'Faturada') return false;
                if (kpiFilters.faturada === 'Não faturada' && row.billingDecision !== 'Não faturada') return false;
                if (kpiFilters.faturada === 'Aguardando' && row.billingDecision !== 'Aguardando decisão') return false;
                if (kpiFilters.faturada === 'Inconsistente' && row.billingDecision !== 'Inconsistente') return false;
            }

            // Apply Global Search
            if (globalSearch) {
                const search = globalSearch.toLowerCase();
                const numMatch = row.docNum.toLowerCase().includes(search);
                const clientMatch = row.cliente.toLowerCase().includes(search);
                const projectMatch = row.projecto.toLowerCase().includes(search);
                const faturaMatch = row.invoiceNum.toLowerCase().includes(search);
                if (!numMatch && !clientMatch && !projectMatch && !faturaMatch) return false;
            }

            // Apply Column filters
            if (!passesColumnFilters(row, casts)) return false;

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

        const totalVg = analyticalRows.filter(row => row.serie === 'V' || row.serie === 'G').length;
        const faturadas = analyticalRows.filter(row => (row.serie === 'V' || row.serie === 'G') && row.billingDecision === 'Faturada').length;
        const naoFaturadas = analyticalRows.filter(row => (row.serie === 'V' || row.serie === 'G') && row.billingDecision === 'Não faturada').length;
        const aguardandoDecisao = analyticalRows.filter(row => (row.serie === 'V' || row.serie === 'G') && row.billingDecision === 'Aguardando decisão').length;
        const comFatura = analyticalRows.filter(row => (row.serie === 'V' || row.serie === 'G') && row.invoiceNum !== '').length;
        const semFatura = analyticalRows.filter(row => (row.serie === 'V' || row.serie === 'G') && row.invoiceNum === '').length;
        const inconsistências = analyticalRows.filter(row => (row.serie === 'V' || row.serie === 'G') && row.billingDecision === 'Inconsistente').length;
        const faturadasNaoContabilizadas = analyticalRows.filter(row => (row.serie === 'V' || row.serie === 'G') && row.billingDecision === 'Faturada' && !row.isContabilizada).length;

        const totalPages = Math.ceil(filtered.length / analisePageSize) || 1;
        const startIdx = (analisePage - 1) * analisePageSize;
        const paginatedData = filtered.slice(startIdx, startIdx + analisePageSize);

        const toggleKpiFilter = (field, value) => {
            setKpiFilters(prev => ({
                ...prev,
                [field]: prev[field] === value ? 'all' : value
            }));
            setAnalisePage(1);
        };

        return (
            <div className="space-y-6">
                {/* KPIs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4">
                    <div onClick={() => { setKpiFilters({ assinada: 'all', faturada: 'all', entrega: 'all' }); setGlobalSearch(''); setColFilters({}); setAnalisePage(1); }} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.faturada === 'all' ? 'border-[#4f46e5] bg-indigo-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total V & G</div>
                        <div className="text-2xl font-black text-slate-800 mt-1 font-mono">{totalVg}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('faturada', 'Faturada')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.faturada === 'Faturada' ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Faturadas</div>
                        <div className="text-2xl font-black text-indigo-600 mt-1 font-mono">{faturadas}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('faturada', 'Não faturada')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.faturada === 'Não faturada' ? 'border-rose-500 bg-rose-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Não Faturadas</div>
                        <div className="text-2xl font-black text-rose-600 mt-1 font-mono">{naoFaturadas}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('faturada', 'Aguardando')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.faturada === 'Aguardando' ? 'border-slate-400 bg-slate-50' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aguardando Decisão</div>
                        <div className="text-2xl font-black text-slate-600 mt-1 font-mono">{aguardandoDecisao}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('faturada', 'ComFatura')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.faturada === 'ComFatura' ? 'border-emerald-500 bg-emerald-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Com Nº Fatura</div>
                        <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">{comFatura}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('faturada', 'SemFatura')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.faturada === 'SemFatura' ? 'border-amber-500 bg-amber-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sem Nº Fatura</div>
                        <div className="text-2xl font-black text-amber-600 mt-1 font-mono">{semFatura}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('faturada', 'Inconsistente')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.faturada === 'Inconsistente' ? 'border-red-500 bg-red-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Faturadas Sem Nº</div>
                        <div className="text-2xl font-black text-red-600 mt-1 font-mono">{inconsistências}</div>
                    </div>
                    <div onClick={() => toggleKpiFilter('faturada', 'NaoContabilizadas')} className={`bg-white border rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-all duration-200 border-l-[6px] ${kpiFilters.faturada === 'NaoContabilizadas' ? 'border-purple-500 bg-purple-50/10' : 'border-slate-200'}`}>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Faturadas Não Contab.</div>
                        <div className="text-2xl font-black text-purple-600 mt-1 font-mono">{faturadasNaoContabilizadas}</div>
                    </div>
                </div>

                {/* Unified Import Style Header */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-t-xl border-b-0 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <input 
                            type="text" 
                            placeholder="Buscar por GR, Cliente, Fatura..." 
                            className="input input-bordered input-sm bg-white text-slate-700 text-xs border-slate-300 rounded-full w-full md:w-72 px-4 h-9" 
                            value={globalSearch} 
                            onChange={e => { setGlobalSearch(e.target.value); setAnalisePage(1); }} 
                        />
                        <button 
                            onClick={() => exportAnaliseTableToCsv('Faturacao_GRs_V_G', ['GR', 'Série', 'Data da GR', 'Cliente', 'Nº Pedido/Referência', 'Assinada', 'Entrega', 'Decisão da faturação', 'Nº da fatura', 'Workflow', 'Etapa atual'], ['docNum', 'serie', 'dataGR', 'cliente', 'projecto', 'isAssinada', 'entregaType', 'billingDecision', 'invoiceNum', 'workflowType', 'etapaAtual'], filtered)} 
                            className="btn btn-sm border-emerald-600 text-emerald-600 bg-white hover:bg-emerald-50 hover:border-emerald-700 border-2 gap-2 rounded-full font-bold h-9 px-4 text-xs shrink-0"
                            disabled={filtered.length === 0}
                        >
                            <FaFileCsv className="text-emerald-600 text-sm" />
                            <span>Exportar Excel</span>
                        </button>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-4 text-xs text-slate-500 font-semibold w-full md:w-auto shrink-0 select-none">
                        <span>Exibindo {filtered.length} de {totalVg} processos</span>
                        <div className="flex gap-1">
                            <button 
                                className="btn btn-xs btn-outline border-slate-300 text-slate-600 rounded-full w-7 h-7 flex items-center justify-center p-0" 
                                disabled={analisePage === 1} 
                                onClick={() => setAnalisePage(prev => prev - 1)}
                            >
                                &lt;
                            </button>
                            <button 
                                className="btn btn-xs btn-outline border-slate-300 text-slate-600 rounded-full w-7 h-7 flex items-center justify-center p-0" 
                                disabled={analisePage === totalPages} 
                                onClick={() => setAnalisePage(prev => prev + 1)}
                            >
                                &gt;
                            </button>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white border border-slate-200 rounded-b-xl shadow-sm overflow-hidden border-t-0">
                    <table className="table table-compact w-full">
                        <thead>
                            <tr className="bg-[#e0f2fe] text-slate-700 border-b border-blue-100 text-[10px] uppercase font-bold">
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('docNum')} className="cursor-pointer hover:text-indigo-600">GR {analiseSortField === 'docNum' ? (analiseSortDirection === 'asc' ? '↑' : '↓') : '↕'}</span>
                                        <ColumnFilter column={{ name: 'docNum', label: 'GR' }} uniqueValues={getUniqueValues('docNum')} selectedValues={colFilters['docNum'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('serie')} className="cursor-pointer hover:text-indigo-600">Série</span>
                                        <ColumnFilter column={{ name: 'serie', label: 'Série' }} uniqueValues={getUniqueValues('serie')} selectedValues={colFilters['serie'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('dataGR')} className="cursor-pointer hover:text-indigo-600">Data da GR</span>
                                        <ColumnFilter column={{ name: 'dataGR', label: 'Data GR' }} uniqueValues={getUniqueValues('dataGR')} selectedValues={colFilters['dataGR'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('cliente')} className="cursor-pointer hover:text-indigo-600">Cliente</span>
                                        <ColumnFilter column={{ name: 'cliente', label: 'Cliente' }} uniqueValues={getUniqueValues('cliente')} selectedValues={colFilters['cliente'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('projecto')} className="cursor-pointer hover:text-indigo-600">Nº Pedido/Referência</span>
                                        <ColumnFilter column={{ name: 'projecto', label: 'Pedido' }} uniqueValues={getUniqueValues('projecto')} selectedValues={colFilters['projecto'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('isAssinada')} className="cursor-pointer hover:text-indigo-600">Assinada</span>
                                        <ColumnFilter column={{ name: 'isAssinada', label: 'Assinada' }} uniqueValues={['Sim', 'Não']} selectedValues={colFilters['isAssinada'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('entregaType')} className="cursor-pointer hover:text-indigo-600">Entrega</span>
                                        <ColumnFilter column={{ name: 'entregaType', label: 'Entrega' }} uniqueValues={getUniqueValues('entregaType')} selectedValues={colFilters['entregaType'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('billingDecision')} className="cursor-pointer hover:text-indigo-600">Decisão Faturação</span>
                                        <ColumnFilter column={{ name: 'billingDecision', label: 'Faturação' }} uniqueValues={getUniqueValues('billingDecision')} selectedValues={colFilters['billingDecision'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('invoiceNum')} className="cursor-pointer hover:text-indigo-600">Nº Fatura</span>
                                        <ColumnFilter column={{ name: 'invoiceNum', label: 'Nº Fatura' }} uniqueValues={getUniqueValues('invoiceNum')} selectedValues={colFilters['invoiceNum'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('workflowType')} className="cursor-pointer hover:text-indigo-600">Workflow</span>
                                        <ColumnFilter column={{ name: 'workflowType', label: 'Workflow' }} uniqueValues={getUniqueValues('workflowType')} selectedValues={colFilters['workflowType'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span onClick={() => handleAnaliseSort('etapaAtual')} className="cursor-pointer hover:text-indigo-600">Etapa Atual</span>
                                        <ColumnFilter column={{ name: 'etapaAtual', label: 'Etapa' }} uniqueValues={getUniqueValues('etapaAtual')} selectedValues={colFilters['etapaAtual'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="text-center py-3 select-none">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan="12" className="text-center py-12 text-slate-400 italic">Nenhum processo de faturação encontrado.</td>
                                </tr>
                            ) : paginatedData.map(row => {
                                const utilizadorFat = getDocFieldValue(row.doc, 'UTILIZADOR_FATURACAO') || getDocFieldValue(row.doc, 'Utilizador Faturação') || '';
                                return (
                                    <tr key={row.id} className="hover:bg-slate-50/50">
                                        <td className="font-bold text-slate-800 text-[10px]">{row.docNum}</td>
                                        <td className="text-xs font-semibold text-slate-500">{row.serie || '-'}</td>
                                        <td className="text-xs text-slate-500 font-mono">{row.dataGR || '-'}</td>
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
                </div>
            </div>
        );
    };

    // --- SEQUÊNCIA DE GRs SUB-VIEW ---
    const renderSequenciaGRs = () => {
        const activePeriodVal = activePeriod === 'all' ? (uniquePeriodsList[0] || '') : activePeriod;

        const matchingDocs = analyticalRows.filter(row => {
            if (!row.parsedNum || row.parsedNum.serie !== activeSerie) return false;
            if (row.dataGR) {
                const pts = row.dataGR.split('/');
                if (pts.length === 3) {
                    const docPeriod = `${pts[2]}-${pts[1]}`;
                    if (docPeriod !== activePeriodVal) return false;
                } else {
                    return false;
                }
            } else {
                return false;
            }
            return true;
        });

        const numbers = matchingDocs.map(row => row.parsedNum.numero);
        const minNum = numbers.length > 0 ? Math.min(...numbers) : 0;
        const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;

        const sequenceRows = [];
        let gapCount = 0;
        let duplicateCount = 0;
        let foundCount = 0;

        if (minNum > 0 && maxNum > 0) {
            for (let i = minNum; i <= maxNum; i++) {
                const matches = matchingDocs.filter(r => r.parsedNum.numero === i);
                const gapKey = `${activeSerie}_${activePeriodVal}_${i}`;
                const savedClassification = gapClassifications[gapKey] || 'não localizada';

                if (matches.length === 0) {
                    gapCount++;
                    sequenceRows.push({
                        id: `gap_${i}`,
                        serie: activeSerie,
                        ano: activePeriodVal.split('-')[0],
                        numeroEsperado: i,
                        numeroCompleto: `GR.${activePeriodVal.split('-')[0]}${activeSerie}/${i}`,
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
                            ano: activePeriodVal.split('-')[0],
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

        const searchedSequenceRows = sequenceRows.filter(row => {
            if (globalSearch) {
                const search = globalSearch.toLowerCase();
                if (!String(row.numeroEsperado).includes(search) && !row.numeroCompleto.toLowerCase().includes(search)) return false;
            }

            // Apply column filters on sequence calculation row values
            for (const [colName, selectedVals] of Object.entries(colFilters)) {
                if (selectedVals && selectedVals.length > 0) {
                    const cellVal = String(row[colName] || '');
                    if (!selectedVals.includes(cellVal)) {
                        return false;
                    }
                }
            }

            return true;
        });

        const getUniqueSequenceValues = (field) => {
            const vals = new Set();
            sequenceRows.forEach(r => {
                if (r[field] !== undefined && r[field] !== null && r[field] !== '') {
                    vals.add(String(r[field]));
                }
            });
            return Array.from(vals).sort();
        };

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

                {/* Unified Import Style Header */}
                <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 border border-slate-200 rounded-t-xl border-b-0 shadow-sm">
                    <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                        <input 
                            type="text" 
                            placeholder="Buscar por GR..." 
                            className="input input-bordered input-sm bg-white text-slate-700 text-xs border-slate-300 rounded-full w-full md:w-48 px-4 h-9" 
                            value={globalSearch} 
                            onChange={e => { setGlobalSearch(e.target.value); setAnalisePage(1); }} 
                        />
                        <select 
                            className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-full h-9 px-3 shrink-0"
                            value={activeSerie} 
                            onChange={e => { setActiveSerie(e.target.value); setAnalisePage(1); }}
                        >
                            <option value="G">Série G</option>
                            <option value="V">Série V</option>
                        </select>
                        <select 
                            className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-full h-9 px-3 shrink-0"
                            value={activePeriodVal} 
                            onChange={e => { setActivePeriod(e.target.value); setAnalisePage(1); }}
                        >
                            {uniquePeriodsList.length === 0 ? (
                                <option value="all">Nenhum período</option>
                            ) : uniquePeriodsList.map(p => (
                                <option key={p} value={p}>{p.split('-')[1]}/{p.split('-')[0]}</option>
                            ))}
                        </select>
                        <button 
                            onClick={() => exportAnaliseTableToCsv(`Sequencia_GRs_${activeSerie}_${activePeriodVal}`, ['Série', 'Ano/Mês', 'Número Esperado', 'Número completo da GR', 'Encontrado no DocuWare', 'Assinada', 'Faturada', 'Número da fatura', 'Situação', 'Classificação/Observação'], ['serie', 'ano', 'numeroEsperado', 'numeroCompleto', 'encontrada', 'assinada', 'faturada', 'invoiceNum', 'situacao', 'observacao'], sequenceRows)} 
                            className="btn btn-sm border-emerald-600 text-emerald-600 bg-white hover:bg-emerald-50 hover:border-emerald-700 border-2 gap-2 rounded-full font-bold h-9 px-4 text-xs shrink-0"
                            disabled={sequenceRows.length === 0}
                        >
                            <FaFileCsv className="text-emerald-600 text-sm" />
                            <span>Exportar Excel</span>
                        </button>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-4 text-xs text-slate-500 font-semibold w-full md:w-auto shrink-0 select-none">
                        <span>Exibindo {filtered.length} de {sequenceRows.length} processos</span>
                        <div className="flex gap-1">
                            <button 
                                className="btn btn-xs btn-outline border-slate-300 text-slate-600 rounded-full w-7 h-7 flex items-center justify-center p-0" 
                                disabled={analisePage === 1} 
                                onClick={() => setAnalisePage(prev => prev - 1)}
                            >
                                &lt;
                            </button>
                            <button 
                                className="btn btn-xs btn-outline border-slate-300 text-slate-600 rounded-full w-7 h-7 flex items-center justify-center p-0" 
                                disabled={analisePage === totalPages} 
                                onClick={() => setAnalisePage(prev => prev + 1)}
                            >
                                &gt;
                            </button>
                        </div>
                    </div>
                </div>

                {/* Table */}
                <div className="bg-white border border-slate-200 rounded-b-xl shadow-sm overflow-hidden border-t-0">
                    <table className="table table-compact w-full">
                        <thead>
                            <tr className="bg-[#e0f2fe] text-slate-700 border-b border-blue-100 text-[10px] uppercase font-bold">
                                <th className="py-3 select-none">Série</th>
                                <th className="py-3 select-none">Período</th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span>Número esperado</span>
                                        <ColumnFilter column={{ name: 'numeroEsperado', label: 'Esperado' }} uniqueValues={getUniqueSequenceValues('numeroEsperado')} selectedValues={colFilters['numeroEsperado'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span>Número completo</span>
                                        <ColumnFilter column={{ name: 'numeroCompleto', label: 'GR' }} uniqueValues={getUniqueSequenceValues('numeroCompleto')} selectedValues={colFilters['numeroCompleto'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span>Encontrado</span>
                                        <ColumnFilter column={{ name: 'encontrada', label: 'Encontrada' }} uniqueValues={['Sim', 'Não']} selectedValues={colFilters['encontrada'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} align="left" />
                                    </div>
                                </th>
                                <th className="py-3 select-none">Assinada</th>
                                <th className="py-3 select-none">Faturada</th>
                                <th className="py-3 select-none">Número da fatura</th>
                                <th className="py-3">
                                    <div className="flex items-center justify-between gap-1 select-none">
                                        <span>Situação</span>
                                        <ColumnFilter column={{ name: 'situacao', label: 'Situação' }} uniqueValues={getUniqueSequenceValues('situacao')} selectedValues={colFilters['situacao'] || []} onToggleValue={toggleFilterValue} onClear={clearColumnFilter} />
                                    </div>
                                </th>
                                <th className="py-3 select-none">Classificação do Utilizador</th>
                                <th className="text-center py-3 select-none">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan="11" className="text-center py-12 text-slate-400 italic">Nenhuma sequência calculada para o período.</td>
                                </tr>
                            ) : paginatedData.map(row => (
                                <tr key={row.id} className={`hover:bg-slate-50/50 ${row.situacao === 'Lacuna' ? 'bg-red-50/10 hover:bg-red-50/20' : ''}`}>
                                    <td className="text-xs font-semibold text-slate-500">{row.serie}</td>
                                    <td className="text-xs text-slate-500 font-mono">{activePeriodVal.split('-')[1]}/{activePeriodVal.split('-')[0]}</td>
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
                </div>
            </div>
        );
    };

    if (analiseTab === 'armazem') return renderArmazemEntregas();
    if (analiseTab === 'faturacao') return renderFaturacao();
    if (analiseTab === 'sequencia') return renderSequenciaGRs();
    return renderControleGRs();
};
