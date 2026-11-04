import React, { useMemo, useState } from 'react';
import { CATEGORIAS_VEICULOS, PORTICOS_CCA, PORTICO_MAP } from '../data/porticos';
import { PassageRecord } from '../types/passage';
import { formatCurrencyBRL } from '../utils/generator';

interface ExecutiveDashboardProps {
  records: PassageRecord[];
  onNavigateToQueue: () => void;
  onNavigateToSpreadsheet: () => void;
}

type TagFilterMode = 'TODOS' | 'COM_TAG' | 'SEM_TAG';

export const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({
  records,
  onNavigateToQueue,
  onNavigateToSpreadsheet,
}) => {
  const [selectedRodovia, setSelectedRodovia] = useState<string>('TODAS');
  const [selectedPraca, setSelectedPraca] = useState<string>('TODAS');
  const [selectedCat, setSelectedCat] = useState<string>('TODAS');
  const [selectedTagMode, setSelectedTagMode] = useState<TagFilterMode>('TODOS');

  const rodovias = ['TODAS', 'BR-262', 'BR-267', 'MS-040', 'MS-338'];

  // Determina se um registro pertence a cliente com TAG ou sem TAG
  const isRecordWithTag = (r: PassageRecord): boolean => {
    if (r.formaPagamento === 'TAG Automatico') return true;
    const emissor = (r.emissorGruposIsentos || '').toLowerCase();
    if (
      emissor.includes('sem parar') ||
      emissor.includes('conectcar') ||
      emissor.includes('veloe') ||
      emissor.includes('move mais') ||
      emissor.includes('taggy')
    ) {
      return true;
    }
    return false;
  };

  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const portico = PORTICO_MAP[r.praca];
      if (selectedRodovia !== 'TODAS' && portico?.rodovia !== selectedRodovia) {
        return false;
      }
      if (selectedPraca !== 'TODAS' && r.praca !== selectedPraca) {
        return false;
      }
      if (selectedCat !== 'TODAS' && r.cat !== selectedCat) {
        return false;
      }
      if (selectedTagMode === 'COM_TAG' && !isRecordWithTag(r)) {
        return false;
      }
      if (selectedTagMode === 'SEM_TAG' && isRecordWithTag(r)) {
        return false;
      }
      return true;
    });
  }, [records, selectedRodovia, selectedPraca, selectedCat, selectedTagMode]);

  const metrics = useMemo(() => {
    const totalPassagens = filteredRecords.length;
    let qtdPago = 0;
    let valorPago = 0;

    let qtdPendente = 0;
    let valorPendente = 0;

    let qtdEvasao = 0;
    let valorBrutoEvasao = 0;

    let qtdPagoPerdido = 0;
    let valorPagoPerdido = 0;

    let qtdIsento = 0;
    let qtdFila24h = 0;
    let valorEmRiscoFila24h = 0;

    for (const r of filteredRecords) {
      if (r.aguardandoAprovacao24h && r.estadoRd === 'Pendente') {
        qtdFila24h++;
        valorEmRiscoFila24h += r.valorNumerico;
      }

      switch (r.estadoRd) {
        case 'Pago':
          qtdPago++;
          valorPago += r.valorNumerico;
          break;
        case 'Pendente':
          qtdPendente++;
          valorPendente += r.valorNumerico;
          break;
        case 'Evasao':
          qtdEvasao++;
          valorBrutoEvasao += r.valorNumerico;
          break;
        case 'Pago perdido':
          qtdPagoPerdido++;
          valorPagoPerdido += r.valorNumerico;
          break;
        case 'Isento':
          qtdIsento++;
          break;
      }
    }

    // Regra de negócio CCA: nas multas por evasão, o órgão autuador repassa 95% do valor da passagem
    // para a concessionária e 5% fica como prejuízo.
    const repasseEvasao95 = Number((valorBrutoEvasao * 0.95).toFixed(2));
    const prejuizoEvasao5 = Number((valorBrutoEvasao * 0.05).toFixed(2));

    const faturamentoPotencialBruto =
      valorPago + valorPendente + valorBrutoEvasao + valorPagoPerdido;

    const faturamentoTotalRealizado = Number((valorPago + repasseEvasao95).toFixed(2));
    const prejuizoTotalConsolidado = Number((valorPagoPerdido + prejuizoEvasao5).toFixed(2));

    const denomTotal = totalPassagens || 1;
    const denomValor = faturamentoPotencialBruto || 1;

    const pctPerdidas = (qtdPagoPerdido / denomTotal) * 100;
    const pctMultasEvasao = (qtdEvasao / denomTotal) * 100;
    const pctPagas = (qtdPago / denomTotal) * 100;
    const pctPendentes = (qtdPendente / denomTotal) * 100;

    const pctFaturamentoTotal = (faturamentoTotalRealizado / denomValor) * 100;
    const pctPrejuizoTotal = (prejuizoTotalConsolidado / denomValor) * 100;

    return {
      totalPassagens,
      qtdPago,
      valorPago,
      qtdPendente,
      valorPendente,
      qtdEvasao,
      valorBrutoEvasao,
      repasseEvasao95,
      prejuizoEvasao5,
      qtdPagoPerdido,
      valorPagoPerdido,
      qtdIsento,
      qtdFila24h,
      valorEmRiscoFila24h,
      faturamentoPotencialBruto,
      faturamentoTotalRealizado,
      prejuizoTotalConsolidado,
      pctPerdidas,
      pctMultasEvasao,
      pctPagas,
      pctPendentes,
      pctFaturamentoTotal,
      pctPrejuizoTotal,
    };
  }, [filteredRecords]);

  // Agrupamento por Pórtico (1 a 12) somando todas as categorias (Cat 01 a Cat 09)
  const porticoStats = useMemo(() => {
    return PORTICOS_CCA.map((p) => {
      const rows = filteredRecords.filter((r) => r.praca === p.praca);
      const total = rows.length;
      const valorPago = rows
        .filter((r) => r.estadoRd === 'Pago')
        .reduce((acc, r) => acc + r.valorNumerico, 0);
      const valorPendente = rows
        .filter((r) => r.estadoRd === 'Pendente')
        .reduce((acc, r) => acc + r.valorNumerico, 0);
      const valorEvasao = rows
        .filter((r) => r.estadoRd === 'Evasao')
        .reduce((acc, r) => acc + r.valorNumerico, 0);
      const valorPerdido = rows
        .filter((r) => r.estadoRd === 'Pago perdido')
        .reduce((acc, r) => acc + r.valorNumerico, 0);
      const qtdPerdido = rows.filter((r) => r.estadoRd === 'Pago perdido').length;
      const qtdEvasao = rows.filter((r) => r.estadoRd === 'Evasao').length;

      const faturamentoPortico = valorPago + valorEvasao * 0.95;
      const prejuizoPortico = valorPerdido + valorEvasao * 0.05;

      return {
        ...p,
        total,
        valorPago,
        valorPendente,
        valorEvasao,
        repasse95: valorEvasao * 0.95,
        perda5: valorEvasao * 0.05,
        valorPerdido,
        qtdPerdido,
        qtdEvasao,
        faturamentoPortico,
        prejuizoPortico,
        pctPerdido: total > 0 ? (qtdPerdido / total) * 100 : 0,
      };
    });
  }, [filteredRecords]);

  // Agrupamento por Forma de Pagamento (apenas Pagos)
  const paymentBreakdown = useMemo(() => {
    const mapForma: Record<string, { count: number; value: number }> = {};

    for (const r of filteredRecords) {
      if (r.estadoRd === 'Pago') {
        if (!mapForma[r.formaPagamento]) {
          mapForma[r.formaPagamento] = { count: 0, value: 0 };
        }
        mapForma[r.formaPagamento].count++;
        mapForma[r.formaPagamento].value += r.valorNumerico;
      }
    }

    const formas = Object.entries(mapForma)
      .map(([name, d]) => ({ name, ...d }))
      .sort((a, b) => b.value - a.value);

    return { formas };
  }, [filteredRecords]);

  const hasActiveFilters =
    selectedRodovia !== 'TODAS' ||
    selectedPraca !== 'TODAS' ||
    selectedCat !== 'TODAS' ||
    selectedTagMode !== 'TODOS';

  return (
    <div className="space-y-6">
      {/* Barra de Segmentação Estilo Slicer do Power BI (Com Filtro Com TAG / Sem TAG / Todos) */}
      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Segmentação de Dados (Slicers Power BI)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Filtre por Clientes Com TAG / Sem TAG, Rodovia, Pórtico ou Categoria de Veículo
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Novo Filtro: Clientes Com TAG | Sem TAG | Todos */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md">
              <button
                type="button"
                onClick={() => setSelectedTagMode('TODOS')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  selectedTagMode === 'TODOS'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos Clientes
              </button>
              <button
                type="button"
                onClick={() => setSelectedTagMode('COM_TAG')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  selectedTagMode === 'COM_TAG'
                    ? 'bg-sky-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Com TAG
              </button>
              <button
                type="button"
                onClick={() => setSelectedTagMode('SEM_TAG')}
                className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                  selectedTagMode === 'SEM_TAG'
                    ? 'bg-amber-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sem TAG
              </button>
            </div>

            {/* Filtro Rodovia */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-md">
              {rodovias.map((rod) => (
                <button
                  key={rod}
                  type="button"
                  onClick={() => {
                    setSelectedRodovia(rod);
                    setSelectedPraca('TODAS');
                  }}
                  className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    selectedRodovia === rod
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {rod === 'TODAS' ? 'Todas Rodovias' : rod}
                </button>
              ))}
            </div>

            {/* Select Pórtico */}
            <select
              value={selectedPraca}
              onChange={(e) => setSelectedPraca(e.target.value)}
              className="text-xs font-medium bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600"
            >
              <option value="TODAS">Todos os 12 Pórticos (PFF 01–12)</option>
              {PORTICOS_CCA.filter(
                (p) => selectedRodovia === 'TODAS' || p.rodovia === selectedRodovia
              ).map((p) => (
                <option key={p.praca} value={p.praca}>
                  Praça {p.praca} · {p.codigo} ({p.municipio})
                </option>
              ))}
            </select>

            {/* Select Categoria */}
            <select
              value={selectedCat}
              onChange={(e) => setSelectedCat(e.target.value)}
              className="text-xs font-medium bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-600"
            >
              <option value="TODAS">Todas Categorias (Cat 01–09 + Isentos)</option>
              {CATEGORIAS_VEICULOS.map((c) => (
                <option key={c.cat} value={c.cat}>
                  Cat {c.cat} —{' '}
                  {c.isento
                    ? 'Isento (Moto/Oficial)'
                    : `${c.eixosCobrados} Eixos (${c.multiplicador}x)`}
                </option>
              ))}
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSelectedRodovia('TODAS');
                  setSelectedPraca('TODAS');
                  setSelectedCat('TODAS');
                  setSelectedTagMode('TODOS');
                }}
                className="text-xs font-medium text-sky-700 hover:text-sky-900 underline px-2 py-1 whitespace-nowrap shrink-0"
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Linha 1: 6 Cartões Executivos (Incluindo Faturamento Total e Prejuízo Total + Percentuais) */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* NOVO CARD 1: Faturamento Total Consolidado */}
        <div className="bg-white border border-slate-300 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-800">
              Faturamento Total (Pago + 95% Evasão)
            </div>
            <div className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
              {formatCurrencyBRL(metrics.faturamentoTotalRealizado)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
            <span>{metrics.qtdPago + metrics.qtdEvasao} cobradas</span>
            <span>·</span>
            <span className="font-semibold text-emerald-700">
              {metrics.pctFaturamentoTotal.toFixed(1)}% da receita
            </span>
          </div>
        </div>

        {/* NOVO CARD 2: Prejuízo Total Consolidado */}
        <div className="bg-white border border-slate-300 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-800">
              Prejuízo Total (Perdido 24h + 5% Evasão)
            </div>
            <div className="text-2xl font-bold text-red-700 font-mono tabular-nums mt-2">
              {formatCurrencyBRL(metrics.prejuizoTotalConsolidado)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
            <span>{metrics.qtdPagoPerdido + metrics.qtdEvasao} ocorr.</span>
            <span>·</span>
            <span className="font-semibold text-red-700">
              {metrics.pctPrejuizoTotal.toFixed(1)}% de prejuízo
            </span>
          </div>
        </div>

        {/* Card 3: Valores Já Pagos pelos Clientes */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">
              Valores Pagos pelos Clientes (Pago)
            </div>
            <div className="text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-2">
              {formatCurrencyBRL(metrics.valorPago)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
            <span>{metrics.qtdPago} passagens</span>
            <span>·</span>
            <span className="font-semibold text-emerald-700">
              {metrics.pctPagas.toFixed(1)}% do volume
            </span>
          </div>
        </div>

        {/* Card 4: Dentro do Prazo de 30 Dias (Pendente) */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">
              No Prazo de 30 Dias (Pendente)
            </div>
            <div className="text-2xl font-bold text-amber-700 font-mono tabular-nums mt-2">
              {formatCurrencyBRL(metrics.valorPendente)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
            <span>{metrics.qtdPendente} em aberto</span>
            <span>·</span>
            <span className="font-semibold text-amber-700">
              {metrics.pctPendentes.toFixed(1)}% do volume
            </span>
          </div>
        </div>

        {/* Card 5: Receita Perdida em Passagens Não Aprovadas 24h */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">
              Receita Perdida (Pago perdido &gt;24h)
            </div>
            <div className="text-2xl font-bold text-rose-700 font-mono tabular-nums mt-2">
              {formatCurrencyBRL(metrics.valorPagoPerdido)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
            <span>{metrics.qtdPagoPerdido} perdidas</span>
            <span>·</span>
            <span className="font-semibold text-rose-700">
              {metrics.pctPerdidas.toFixed(1)}% perdidas
            </span>
          </div>
        </div>

        {/* Card 6: Multas por Evasão (> 30 Dias) — Repasse 95% e Perda 5% */}
        <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between">
          <div>
            <div className="text-xs font-medium text-slate-500">
              Multas Evasão (95% Repasse / 5% Perda)
            </div>
            <div className="text-2xl font-bold text-sky-700 font-mono tabular-nums mt-2">
              {formatCurrencyBRL(metrics.repasseEvasao95)}
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600 font-mono tabular-nums">
            <span>{metrics.qtdEvasao} multas ({metrics.pctMultasEvasao.toFixed(1)}%)</span>
            <span>·</span>
            <span className="font-semibold text-red-700">
              -5%: {formatCurrencyBRL(metrics.prejuizoEvasao5)}
            </span>
          </div>
        </div>
      </section>

      {/* Linha 2: Funil Financeiro do Ciclo de Cobrança & Monitor SLA 24h */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-slate-200">
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Ciclo de Faturamento, Prazo de 30 Dias e Decomposição de Evasão (95% / 5%)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Visão executiva consolidando todas as categorias de veículos (Cat 01 a Cat 09 e Isentos)
              </p>
            </div>
            <div className="text-xs text-slate-600 font-mono tabular-nums">
              Total Filtrado: <strong className="text-slate-900">{metrics.totalPassagens}</strong> passagens ·{' '}
              <strong className="text-slate-900">{formatCurrencyBRL(metrics.faturamentoPotencialBruto)}</strong> potencial bruto
            </div>
          </div>

          <div className="mt-5">
            <div className="flex items-center justify-between text-xs text-slate-600 mb-2 font-mono tabular-nums">
              <span>Pago ({metrics.pctPagas.toFixed(1)}%)</span>
              <span>Pendente 30d ({metrics.pctPendentes.toFixed(1)}%)</span>
              <span>Evasão &gt;30d ({metrics.pctMultasEvasao.toFixed(1)}%)</span>
              <span>Pago perdido &gt;24h ({metrics.pctPerdidas.toFixed(1)}%)</span>
            </div>
            <div className="w-full h-3.5 bg-slate-100 rounded-md overflow-hidden flex">
              <div
                style={{ width: `${metrics.pctPagas}%` }}
                className="bg-emerald-600 h-full transition-all duration-200"
              />
              <div
                style={{ width: `${metrics.pctPendentes}%` }}
                className="bg-amber-500 h-full transition-all duration-200"
              />
              <div
                style={{ width: `${metrics.pctMultasEvasao}%` }}
                className="bg-sky-600 h-full transition-all duration-200"
              />
              <div
                style={{ width: `${metrics.pctPerdidas}%` }}
                className="bg-red-600 h-full transition-all duration-200"
              />
            </div>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-2.5 pr-4">Estado RD (Padronizado)</th>
                  <th className="py-2.5 px-3 text-right">Passagens</th>
                  <th className="py-2.5 px-3 text-right">% Volume</th>
                  <th className="py-2.5 px-3 text-right">Valor Bruto Tarifa</th>
                  <th className="py-2.5 px-3 text-right">Faturamento Realizado</th>
                  <th className="py-2.5 pl-3 text-right">Prejuízo / Perda</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                <tr className="hover:bg-slate-50">
                  <td className="py-2.5 pr-4 font-sans font-medium text-emerald-800">
                    Pago (Clientes Com TAG e Avulsos)
                  </td>
                  <td className="py-2.5 px-3 text-right">{metrics.qtdPago}</td>
                  <td className="py-2.5 px-3 text-right">{metrics.pctPagas.toFixed(2)}%</td>
                  <td className="py-2.5 px-3 text-right">{formatCurrencyBRL(metrics.valorPago)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-emerald-700">
                    {formatCurrencyBRL(metrics.valorPago)} (100%)
                  </td>
                  <td className="py-2.5 pl-3 text-right text-slate-400">R$ 0,00</td>
                </tr>

                <tr className="hover:bg-slate-50">
                  <td className="py-2.5 pr-4 font-sans font-medium text-amber-800">
                    Pendente (Dentro do prazo de 30 dias)
                  </td>
                  <td className="py-2.5 px-3 text-right">{metrics.qtdPendente}</td>
                  <td className="py-2.5 px-3 text-right">{metrics.pctPendentes.toFixed(2)}%</td>
                  <td className="py-2.5 px-3 text-right">{formatCurrencyBRL(metrics.valorPendente)}</td>
                  <td className="py-2.5 px-3 text-right text-amber-700">
                    No prazo ({formatCurrencyBRL(metrics.valorPendente)})
                  </td>
                  <td className="py-2.5 pl-3 text-right text-slate-400">R$ 0,00</td>
                </tr>

                <tr className="hover:bg-slate-50">
                  <td className="py-2.5 pr-4 font-sans font-medium text-sky-800">
                    Evasao (&gt;30 dias · Repasse 95% / Prejuízo 5%)
                  </td>
                  <td className="py-2.5 px-3 text-right">{metrics.qtdEvasao}</td>
                  <td className="py-2.5 px-3 text-right">{metrics.pctMultasEvasao.toFixed(2)}%</td>
                  <td className="py-2.5 px-3 text-right">{formatCurrencyBRL(metrics.valorBrutoEvasao)}</td>
                  <td className="py-2.5 px-3 text-right font-semibold text-sky-700">
                    {formatCurrencyBRL(metrics.repasseEvasao95)} (95%)
                  </td>
                  <td className="py-2.5 pl-3 text-right font-semibold text-red-700">
                    {formatCurrencyBRL(metrics.prejuizoEvasao5)} (5%)
                  </td>
                </tr>

                <tr className="hover:bg-slate-50">
                  <td className="py-2.5 pr-4 font-sans font-medium text-red-800">
                    Pago perdido (Não aprovado em 24h / Erro validação)
                  </td>
                  <td className="py-2.5 px-3 text-right">{metrics.qtdPagoPerdido}</td>
                  <td className="py-2.5 px-3 text-right">{metrics.pctPerdidas.toFixed(2)}%</td>
                  <td className="py-2.5 px-3 text-right">{formatCurrencyBRL(metrics.valorPagoPerdido)}</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">R$ 0,00 (0%)</td>
                  <td className="py-2.5 pl-3 text-right font-semibold text-red-700">
                    {formatCurrencyBRL(metrics.valorPagoPerdido)} (100%)
                  </td>
                </tr>

                <tr className="hover:bg-slate-50">
                  <td className="py-2.5 pr-4 font-sans font-medium text-slate-600">
                    Isento (Motos / Veículos Oficiais)
                  </td>
                  <td className="py-2.5 px-3 text-right">{metrics.qtdIsento}</td>
                  <td className="py-2.5 px-3 text-right">
                    {((metrics.qtdIsento / (metrics.totalPassagens || 1)) * 100).toFixed(2)}%
                  </td>
                  <td className="py-2.5 px-3 text-right">R$ 0,00</td>
                  <td className="py-2.5 px-3 text-right text-slate-400">R$ 0,00</td>
                  <td className="py-2.5 pl-3 text-right text-slate-400">R$ 0,00</td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 font-semibold text-xs font-mono tabular-nums bg-slate-50">
                  <td className="py-2.5 pr-4 font-sans text-slate-900">Total Consolidado</td>
                  <td className="py-2.5 px-3 text-right text-slate-900">{metrics.totalPassagens}</td>
                  <td className="py-2.5 px-3 text-right text-slate-900">100,00%</td>
                  <td className="py-2.5 px-3 text-right text-slate-900">
                    {formatCurrencyBRL(metrics.faturamentoPotencialBruto)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-emerald-800">
                    {formatCurrencyBRL(metrics.faturamentoTotalRealizado)} ({metrics.pctFaturamentoTotal.toFixed(1)}%)
                  </td>
                  <td className="py-2.5 pl-3 text-right text-red-700">
                    {formatCurrencyBRL(metrics.prejuizoTotalConsolidado)} ({metrics.pctPrejuizoTotal.toFixed(1)}%)
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Bloco Direito: Monitor de Risco SLA 24h & Canais de Arrecadação */}
        <div className="bg-white border border-slate-200 rounded-lg p-5 flex flex-col justify-between space-y-5">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <h3 className="text-base font-semibold text-slate-900">
                Fila de Validação e Treinamento SLA 24h
              </h3>
              <span className="text-xs font-mono tabular-nums text-amber-800 font-semibold">
                {metrics.qtdFila24h} na fila
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-3 leading-relaxed">
              Passagens sem leitura automática exigem validação de Placa, Categoria e Subcat em até{' '}
              <strong>24 horas</strong>. Acertando, convertem-se em <span className="font-mono font-semibold text-emerald-700">Pago</span> ou <span className="font-mono font-semibold text-sky-700">Evasao</span>.
            </p>

            <div className="mt-4 p-3.5 bg-slate-50 border border-slate-200 rounded-md flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">Valor em Risco na Fila (&lt;24h)</div>
                <div className="text-lg font-bold text-amber-700 font-mono tabular-nums mt-0.5">
                  {formatCurrencyBRL(metrics.valorEmRiscoFila24h)}
                </div>
              </div>
              <button
                onClick={onNavigateToQueue}
                className="px-3 py-2 text-xs font-medium text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                Treinar / Auditar Fila ({metrics.qtdFila24h})
              </button>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200">
            <h4 className="text-xs font-semibold text-slate-800 mb-3">
              Arrecadação por Forma de Pagamento (Passagens Quitadas)
            </h4>
            <div className="space-y-2.5">
              {paymentBreakdown.formas.length === 0 ? (
                <p className="text-xs text-slate-500">Nenhuma passagem paga no filtro atual.</p>
              ) : (
                paymentBreakdown.formas.map((item) => {
                  const pct =
                    metrics.valorPago > 0 ? (item.value / metrics.valorPago) * 100 : 0;
                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-700 font-medium">{item.name}</span>
                        <span className="font-mono tabular-nums text-slate-600">
                          {formatCurrencyBRL(item.value)} · {pct.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className="h-full bg-emerald-600 rounded-full"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Linha 3: Desempenho Financeiro por Pórtico Free Flow (Consolidado de Todas as Categorias Cat 01 a Cat 09) */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Monitoramento de Faturamento e Perdas nos 12 Pórticos Free Flow (PFF-01 a PFF-12)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Os valores financeiros abaixo somam as passagens de <strong>todas as categorias de veículos (Cat 01 a Cat 09)</strong> em cada pórtico. A coluna &ldquo;Tarifa Base Unitária (1x)&rdquo; indica apenas o valor base de contrato do pórtico usado como multiplicador por eixo.
            </p>
          </div>
          <button
            onClick={onNavigateToSpreadsheet}
            className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            Inspecionar Linhas na Planilha
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2.5 pr-3">Praça / Pórtico</th>
                <th className="py-2.5 px-3">Rodovia &amp; Município</th>
                <th className="py-2.5 px-3 text-right" title="Valor base contratual de 1 eixo (Cat 01) usado para multiplicar as demais categorias">
                  Tarifa Base Unitária (1x)
                </th>
                <th className="py-2.5 px-3 text-right">
                  Passagens (Todas Cat.)
                </th>
                <th className="py-2.5 px-3 text-right">
                  Total Pago (Todas Cat.)
                </th>
                <th className="py-2.5 px-3 text-right">
                  Pendente 30d (Todas Cat.)
                </th>
                <th className="py-2.5 px-3 text-right">
                  Evasão 95% (Todas Cat.)
                </th>
                <th className="py-2.5 px-3 text-right">
                  Prejuízo 5% Evasão
                </th>
                <th className="py-2.5 px-3 text-right">
                  Pago Perdido (&gt;24h)
                </th>
                <th className="py-2.5 pl-3 text-right">
                  Faturamento Total Pórtico
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {porticoStats.map((p) => (
                <tr key={p.praca} className="hover:bg-slate-50">
                  <td className="py-2.5 pr-3 font-sans">
                    <span className="font-semibold text-slate-900">Praça {p.praca}</span>
                    <span className="text-slate-400 mx-1.5">·</span>
                    <span className="text-sky-700 font-medium">{p.codigo}</span>
                  </td>
                  <td className="py-2.5 px-3 font-sans text-slate-600">
                    {p.rodovia} ({p.km}) · {p.municipio}
                  </td>
                  <td className="py-2.5 px-3 text-right text-slate-500">
                    {formatCurrencyBRL(p.tarifaCat1)}
                  </td>
                  <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                    {p.total}
                  </td>
                  <td className="py-2.5 px-3 text-right text-emerald-700 font-medium">
                    {formatCurrencyBRL(p.valorPago)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-amber-700">
                    {formatCurrencyBRL(p.valorPendente)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-sky-700">
                    {formatCurrencyBRL(p.repasse95)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-rose-700">
                    {formatCurrencyBRL(p.perda5)}
                  </td>
                  <td className="py-2.5 px-3 text-right text-red-700 font-semibold">
                    {formatCurrencyBRL(p.valorPerdido)}{' '}
                    <span className="text-slate-400 font-normal">
                      ({p.pctPerdido.toFixed(1)}%)
                    </span>
                  </td>
                  <td className="py-2.5 pl-3 text-right font-bold text-slate-900">
                    {formatCurrencyBRL(p.faturamentoPortico)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
