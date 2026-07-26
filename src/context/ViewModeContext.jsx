import React, { createContext, useContext, useState } from 'react';

const ViewModeContext = createContext();

export const ViewModeProvider = ({ children }) => {
    const [viewMode, setViewMode] = useState('operacional'); // 'operacional' | 'analise'
    const [analiseTab, setAnaliseTab] = useState('controle'); // 'controle' | 'armazem' | 'faturacao' | 'sequencia'

    return (
        <ViewModeContext.Provider value={{ viewMode, setViewMode, analiseTab, setAnaliseTab }}>
            {children}
        </ViewModeContext.Provider>
    );
};

export const useViewMode = () => {
    const context = useContext(ViewModeContext);
    if (!context) {
        throw new Error('useViewMode must be used within a ViewModeProvider');
    }
    return context;
};
