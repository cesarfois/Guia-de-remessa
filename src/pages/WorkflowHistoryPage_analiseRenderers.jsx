import React, { useState, useMemo } from 'react';
import { 
    FaFileCsv, 
    FaExternalLinkAlt, 
    FaHistory, 
    FaList, 
    FaCheckCircle, 
    FaClock, 
    FaExclamationTriangle,
    FaArrowRight
} from 'react-icons/fa';
import { docuwareService } from '../services/docuwareService';

// Format duration helper (copied for independence)
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
        }
    };

    // --- CONTROLE DE GRs SUB-VIEW ---
    const renderControleGRs = () => {
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
        const assinadas = filtered.filter(r => r.isAssinada).length;
        const aguardandoAssinatura = filtered.filter(r => !r.isAssinada).length;
        const faturadas = filtered.filter(r => r.billingDecision === 'Faturada').length;
        const naoFaturadas = filtered.filter(r => r.billingDecision === 'Não faturada').length;
        const aguardandoDecisao = filtered.filter(r => r.billingDecision === 'Aguardando decisão').length;
        const inconsistências = filtered.filter(r => r.billingDecision === 'Inconsistente').length;

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
                                <button className="btn btn-xs rounded-lg animate-hover-shift" disabled={analisePage === 1} onClick={() => setAnalisePage(prev => prev - 1)}>Anterior</button>
                                <span className="btn btn-xs btn-active rounded-lg font-mono">{analisePage} / {totalPages}</span>
                                <button className="btn btn-xs rounded-lg animate-hover-shift" disabled={analisePage === totalPages} onClick={() => setAnalisePage(prev => prev + 1)}>Próxima</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // --- ARMAZÉM E ENTREGAS SUB-VIEW ---
    const renderArmazemEntregas = () => {
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
        const aguardandoAssinatura = filtered.filter(r => !r.isAssinada).length;
        const assinadas = filtered.filter(r => r.isAssinada).length;
        const entregaTotal = filtered.filter(r => r.entregaType === 'Total').length;
        const entregaParcial = filtered.filter(r => r.entregaType === 'Parcial').length;
        const naoEntregues = filtered.filter(r => r.entregaType === 'Não Entregue').length;
        const devolvidoArmazém = filtered.filter(r => r.workflowStatus === 'Devolvido ao Armazém' || r.workflowStatus.toLowerCase().includes('devolvido')).length;
        const parados24h = filtered.filter(r => r.workflowStatus !== 'Concluido' && r.tempoParado > 24 * 3600 * 1000).length;
        const parados3d = filtered.filter(r => r.workflowStatus !== 'Concluido' && r.tempoParado > 3 * 24 * 3600 * 1000).length;

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

    // --- FATURAÇÃO SUB-VIEW ---
    const renderFaturacao = () => {
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

        const totalVg = filtered.length;
        const faturadas = filtered.filter(r => r.billingDecision === 'Faturada').length;
        const naoFaturadas = filtered.filter(r => r.billingDecision === 'Não faturada').length;
        const aguardandoDecisao = filtered.filter(r => r.billingDecision === 'Aguardando decisão').length;
        const comFatura = filtered.filter(r => r.invoiceNum).length;
        const semFatura = filtered.filter(r => !r.invoiceNum).length;
        const inconsistências = filtered.filter(r => r.billingDecision === 'Inconsistente').length;
        const faturadasNaoContabilizadas = filtered.filter(r => r.billingDecision === 'Faturada' && !r.isContabilizada).length;

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
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Faturadas Sem Nº</div>
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

    // --- SEQUÊNCIA DE GRs SUB-VIEW ---
    const renderSequenciaGRs = () => {
        const activeSerie = analiseFilters.serie === 'all' || (analiseFilters.serie !== 'V' && analiseFilters.serie !== 'G') ? 'G' : analiseFilters.serie;
        const activePeriod = analiseFilters.period === 'all' ? (uniquePeriodsList[0] || '') : analiseFilters.period;

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

        const searchedSequenceRows = sequenceRows.filter(row => {
            if (analiseFilters.docNum && !String(row.numeroEsperado).includes(analiseFilters.docNum) && !row.numeroCompleto.toLowerCase().includes(analiseFilters.docNum.toLowerCase())) return false;
            return true;
        });

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

    if (analiseTab === 'armazem') return renderArmazemEntregas();
    if (analiseTab === 'faturacao') return renderFaturacao();
    if (analiseTab === 'sequencia') return renderSequenciaGRs();
    return renderControleGRs();
};
