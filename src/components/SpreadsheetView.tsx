import React, { useMemo, useState } from 'react';
import { PORTICOS_CCA } from '../data/porticos';
import { EstadoRD, PassageRecord } from '../types/passage';
import { SPREADSHEET_HEADERS } from '../utils/exportSpreadsheet';

interface SpreadsheetViewProps {
  records: PassageRecord[];
  onChangeRecordStatus: (seq: number, newStatus: EstadoRD) => void;
  onInspectRecordModal: (record: PassageRecord) => void;
}

const STATUS_OPTIONS: EstadoRD[] = [
  'Pago',
  'Pendente',
  'Evasao',
  'Pago perdido',
  'Isento',
];

export const SpreadsheetView: React.FC<SpreadsheetViewProps> = ({
  records,
  onChangeRecordStatus,
  onInspectRecordModal,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('TODOS');
  const [pracaFilter, setPracaFilter] = useState<string>('TODAS');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [showSupplierReference, setShowSupplierReference] = useState(false);

  const pageSize = 25;

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = records.filter((r) => {
      if (statusFilter !== 'TODOS' && r.estadoRd !== statusFilter) return false;
      if (pracaFilter !== 'TODAS' && r.praca !== pracaFilter) return false;
      if (q) {
        const matchRecibo = r.idRecibo.toLowerCase().includes(q);
        const matchPlaca = r.placa.toLowerCase().includes(q);
        const matchMsg = r.mensagemId.toLowerCase().includes(q);
        const matchPista = r.pista.toLowerCase().includes(q);
        if (!matchRecibo && !matchPlaca && !matchMsg && !matchPista) return false;
      }
      return true;
    });

    return sortOrder === 'desc' ? list.slice().reverse() : list;
  }, [records, searchQuery, statusFilter, pracaFilter, sortOrder]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedRows = filteredRows.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize
  );

  const getStatusTextColor = (status: EstadoRD) => {
    switch (status) {
      case 'Pago':
        return 'text-emerald-700 font-semibold';
      case 'Pendente':
        return 'text-amber-700 font-semibold';
      case 'Evasao':
        return 'text-sky-700 font-semibold';
      case 'Pago perdido':
        return 'text-red-700 font-semibold';
      case 'Isento':
        return 'text-slate-600 font-medium';
    }
  };

  return (
    <div className="space-y-5">
      {/* Cabeçalho e Filtros da Planilha de 18 Colunas */}
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Planilha Base Acumulada — 18 Colunas (Clique no ID Recibo para Ver as 3 Fotos no Pórtico)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Clique em qualquer código da coluna{' '}
              <span className="font-mono font-semibold text-sky-700">ID Recibo</span> (ex:{' '}
              <span className="font-mono font-semibold">FAKEFF000001</span>) para abrir a janela de inspeção com as 3 câmeras do veículo (Frontal, Traseira e Lateral com Eixos).
            </p>
          </div>

          <button
            onClick={() => setShowSupplierReference((v) => !v)}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {showSupplierReference
              ? 'Ocultar Modelo do Fornecedor'
              : 'Ver Imagem do Modelo Original'}
          </button>
        </div>

        {showSupplierReference && (
          <div className="mt-4 p-3 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-xs font-medium text-slate-700 mb-2">
              Referência enviada pelo fornecedor (Linha 1: FAKEFF000001 · Mensagem 2609230800016290101 · Praça 01 · Cat 07 · Pago perdido · R$ 105,00):
            </div>
            <div className="overflow-x-auto bg-white p-2 border border-slate-200 rounded">
              <img
                src="assets/aistudio/image_2033a004.png"
                alt="Modelo original de planilha Free Flow do fornecedor"
                referrerPolicy="no-referrer"
                className="max-w-full h-auto"
              />
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar ID Recibo, Placa ou Mensagem ID..."
              className="w-64 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-600"
            />

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs font-medium bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800"
            >
              <option value="TODOS">Todos os Estado RD</option>
              {STATUS_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  Estado RD: {st}
                </option>
              ))}
            </select>

            <select
              value={pracaFilter}
              onChange={(e) => {
                setPracaFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="text-xs font-medium bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800"
            >
              <option value="TODAS">Todas as Praças (01–12)</option>
              {PORTICOS_CCA.map((p) => (
                <option key={p.praca} value={p.praca}>
                  Praça {p.praca} ({p.codigo})
                </option>
              ))}
            </select>

            <button
              onClick={() => setSortOrder((s) => (s === 'desc' ? 'asc' : 'desc'))}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Ordem: {sortOrder === 'desc' ? 'Mais recentes primeiro' : 'FAKEFF000001 primeiro'}
            </button>
          </div>

          <div className="text-xs text-slate-600 font-mono tabular-nums">
            Exibindo <strong>{paginatedRows.length}</strong> de{' '}
            <strong>{filteredRows.length}</strong> linhas filtradas (Total acumulado:{' '}
            <strong>{records.length}</strong>)
          </div>
        </div>
      </section>

      {/* Grade de 18 Colunas com rolagem horizontal */}
      <section className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse whitespace-nowrap">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-300 text-xs font-semibold text-slate-800">
                {SPREADSHEET_HEADERS.map((header) => (
                  <th
                    key={header}
                    className="py-2.5 px-3 border-r border-slate-200 last:border-r-0"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 text-xs font-mono tabular-nums">
              {paginatedRows.map((row) => (
                <tr key={row.seq} className="hover:bg-slate-50">
                  <td className="py-2 px-3 border-r border-slate-100">
                    <button
                      type="button"
                      onClick={() => onInspectRecordModal(row)}
                      title="Clique para abrir as 3 fotos do veículo no Free Flow"
                      className="font-semibold text-sky-700 hover:text-sky-900 hover:underline text-left"
                    >
                      {row.idRecibo}
                    </button>
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 text-slate-600">
                    {row.mensagemId}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 text-slate-700">
                    {row.dataHora}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 text-center text-slate-800">
                    {row.praca}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 text-center font-semibold text-slate-800">
                    {row.pista}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 font-sans text-slate-700">
                    {row.tipo}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 text-center text-slate-800">
                    {row.cat}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 text-center text-slate-600">
                    {row.subcat}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 font-semibold text-slate-900">
                    {row.placa}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 text-slate-400">
                    {row.cpf}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 font-sans">
                    <select
                      value={row.estadoRd}
                      onChange={(e) =>
                        onChangeRecordStatus(row.seq, e.target.value as EstadoRD)
                      }
                      aria-label={`Alterar Estado RD do recibo ${row.idRecibo}`}
                      className={`text-xs bg-transparent border border-transparent hover:border-slate-300 rounded px-1 py-0.5 focus:outline-none focus:border-sky-600 ${getStatusTextColor(
                        row.estadoRd
                      )}`}
                    >
                      {STATUS_OPTIONS.map((st) => (
                        <option key={st} value={st} className="text-slate-900 font-normal">
                          {st}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 text-right font-semibold text-slate-900">
                    {row.valor}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 font-sans text-slate-700">
                    {row.formaPagamento}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 font-sans text-slate-700">
                    {row.emissorGruposIsentos}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 text-right font-semibold text-emerald-700">
                    {row.pago}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 font-sans text-slate-700">
                    {row.localPagamento}
                  </td>
                  <td className="py-2 px-3 border-r border-slate-100 text-slate-700">
                    {row.dataPagamento}
                  </td>
                  <td className="py-2 px-3 font-sans text-slate-700">
                    {row.arrecadador}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
          <div className="font-mono tabular-nums">
            Página {safePage} de {totalPages}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safePage <= 1}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-100"
            >
              Primeira
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-100"
            >
              Anterior
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-100"
            >
              Próxima
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safePage >= totalPages}
              className="px-2.5 py-1 bg-white border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-100"
            >
              Última
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};
