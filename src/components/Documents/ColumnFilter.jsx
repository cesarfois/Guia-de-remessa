import { useState, useRef, useEffect } from 'react';

const ColumnFilter = ({ column, uniqueValues, selectedValues, onToggleValue, onSelectAll, onClear, align = 'right' }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef(null);

    const handleToggle = (value) => {
        onToggleValue(column.name, value);
    };

    const handleClear = () => {
        onClear(column.name);
        setSearchTerm('');
    };

    const hasFilter = selectedValues && selectedValues.length > 0;

    // Filter values based on search term
    const filteredValues = uniqueValues.filter(value =>
        String(value || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    return (
        <div className="relative inline-block text-left" ref={dropdownRef}>
            <button
                className={`btn btn-xs btn-ghost ${hasFilter ? 'text-primary font-bold bg-primary/10' : 'text-base-content/50'} hover:text-primary p-1 rounded-md`}
                onClick={() => setIsOpen(!isOpen)}
                title={`Filter ${column.label}`}
            >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
            </button>

            {isOpen && (
                <div className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden text-left animate-in fade-in slide-in-from-top-1 duration-100`}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-4 py-3 bg-gray-50/50">
                        <span className="font-semibold text-gray-700 text-sm">
                            Filtrar {column.label}
                        </span>
                        {hasFilter && (
                            <button
                                onClick={handleClear}
                                className="text-xs text-primary hover:text-primary-focus font-medium transition-colors"
                            >
                                Limpar
                            </button>
                        )}
                    </div>

                    <div className="border-b border-gray-100" />

                    {/* Search box */}
                    <div className="p-3">
                        <div className="relative">
                            <input
                                type="text"
                                placeholder="Buscar..."
                                className="input input-sm w-full bg-gray-50 border border-gray-200 rounded-lg pl-3 pr-8 text-sm focus:outline-none focus:border-primary focus:bg-white transition-all text-gray-800"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Options list */}
                    <div className="px-2 pb-3 max-h-60 overflow-y-auto custom-scrollbar">
                        {filteredValues.length === 0 ? (
                            <div className="text-center text-gray-400 text-xs py-6">
                                Nenhum valor encontrado
                            </div>
                        ) : (
                            <div className="space-y-0.5">
                                {filteredValues.map(value => {
                                    const isChecked = selectedValues.includes(String(value));
                                    return (
                                        <button
                                            key={value}
                                            onClick={() => handleToggle(String(value))}
                                            className="w-full flex items-center px-2.5 py-2 rounded-lg hover:bg-gray-50 text-left transition-colors group"
                                        >
                                            {/* Custom circle checkbox */}
                                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center mr-3 shrink-0 transition-all ${
                                                isChecked 
                                                    ? 'border-primary bg-primary text-white scale-105' 
                                                    : 'border-primary/50 group-hover:border-primary'
                                            }`}>
                                                {isChecked && (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                )}
                                            </div>
                                            <span className={`text-xs text-gray-700 truncate ${isChecked ? 'font-semibold text-gray-900' : ''}`}>
                                                {value || '(Vazio)'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default ColumnFilter;
