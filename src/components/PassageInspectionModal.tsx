import React from 'react';
import { CATEGORIAS_VEICULOS, PORTICO_MAP } from '../data/porticos';
import { PassageRecord } from '../types/passage';
import { FreeFlowCameraTriplet } from './FreeFlowCameraTriplet';

interface PassageInspectionModalProps {
  record: PassageRecord | null;
  onClose: () => void;
}

export const PassageInspectionModal: React.FC<PassageInspectionModalProps> = ({
  record,
  onClose,
}) => {
  if (!record) return null;

  const portico = PORTICO_MAP[record.praca];
  const catInfo =
    CATEGORIAS_VEICULOS.find((c) => c.cat === record.cat) || CATEGORIAS_VEICULOS[0];

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 flex items-center justify-center p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-recibo-title"
    >
      <div className="bg-white border border-slate-200 rounded-lg max-w-5xl w-full p-5 shadow-xl space-y-5 my-8">
        {/* Cabeçalho do Modal */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-200">
          <div>
            <h2
              id="modal-recibo-title"
              className="text-base font-bold text-slate-900 font-mono"
            >
              Inspeção de Passagem Free Flow · Recibo {record.idRecibo}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-sans">
              Mensagem ID: <span className="font-mono">{record.mensagemId}</span> ·{' '}
              {portico?.nome} ({portico?.rodovia} {portico?.km} — {portico?.municipio})
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
          >
            Fechar Janela (Esc)
          </button>
        </div>

        {/* Visor das 3 Câmeras + Sliders de Contraste/Brilho/IR */}
        <FreeFlowCameraTriplet record={record} />

        {/* Resumo Estruturado dos 18 Campos da Planilha */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-md text-xs">
          <div>
            <div className="text-slate-500">Data/Hora</div>
            <div className="font-mono font-semibold text-slate-900 mt-0.5">
              {record.dataHora}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Praça / Pista</div>
            <div className="font-mono font-semibold text-slate-900 mt-0.5">
              Praça {record.praca} · {record.pista}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Placa Registrada</div>
            <div className="font-mono font-bold text-slate-900 mt-0.5">
              {record.placa}
              {!record.aguardandoAprovacao24h &&
                record.placaReal &&
                record.placaReal !== record.placa && (
                  <span className="text-amber-700 ml-1">
                    (Real: {record.placaReal})
                  </span>
                )}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Cat / Subcat (Eixos)</div>
            <div className="font-mono font-semibold text-slate-900 mt-0.5">
              {record.aguardandoAprovacao24h
                ? 'Em auditoria visual'
                : `Cat ${record.cat} (${catInfo.eixosTexto} eixos) / Sub ${record.subcat}`}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Estado RD</div>
            <div className="font-semibold text-slate-900 mt-0.5">
              {record.estadoRd}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Valor Tarifa</div>
            <div className="font-mono font-bold text-emerald-700 mt-0.5">
              {record.valor}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
