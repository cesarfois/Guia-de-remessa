import { FaBoxes, FaSyncAlt, FaArrowLeft } from 'react-icons/fa';

const Header = () => {

    return (
        <header className="bg-white shadow-sm border-b border-gray-100 px-8 py-5 flex items-center justify-between">
            {/* Left: Title & Subtitle */}
            <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 text-[#4f46e5] rounded-xl shrink-0">
                    <FaBoxes className="text-2xl" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 leading-tight">
                        Painel Pedido de Pagamento
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        Visão consolidada dos pedidos de pagamento
                    </p>
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-3">
                <a
                    href="https://wp.processcloud.app/"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 hover:text-slate-800 transition-colors"
                    title="Voltar ao Portal"
                >
                    <FaArrowLeft className="text-xs" />
                    <span>Voltar ao Portal</span>
                </a>
                <button
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 hover:text-indigo-700 transition-colors"
                    title="Atualizar Página"
                >
                    <FaSyncAlt className="text-xs" />
                    <span>Atualizar</span>
                </button>
            </div>
        </header>
    );
};

export default Header;
