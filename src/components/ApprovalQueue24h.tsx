import React, { useEffect, useMemo, useState } from 'react';
import { CATEGORIAS_VEICULOS, PORTICO_MAP } from '../data/porticos';
import { PassageRecord } from '../types/passage';
import { formatCurrencyBRL } from '../utils/generator';
import { FreeFlowCameraTriplet } from './FreeFlowCameraTriplet';

export interface OperatorSessionStats {
  isActive: boolean;
  elapsedSeconds: number;
  recoveredCount: number;
  recoveredValue: number;
  lostCount: number;
  lostValue: number;
}

export interface ValidationAlertInfo {
  type: 'success' | 'error_validation' | 'expired_timeout';
  title: string;
  recibo: string;
  valor: string;
  details: string[];
  accumulatedLostCount: number;
  accumulatedLostValue: number;
  /** Se true, pausa todos os cronômetros em um modal na tela até a pessoa clicar em "Entendi" */
  blockingModal: boolean;
}

interface ApprovalQueue24hProps {
  records: PassageRecord[];
  nowMs: number;
  workstationMode: boolean;
  onChangeWorkstationMode: (active: boolean) => void;
  onStopValidatingPlates: () => void;
  onActiveLockedSeqChange?: (seq: number | null) => void;
  sessionStats: OperatorSessionStats;
  validationAlert: ValidationAlertInfo | null;
  onDismissAlert: () => void;
  onStartOrToggleSession: (active?: boolean) => void;
  onResetSession: () => void;
  onSubmitWorkstationValidation: (
    seq: number,
    typedPlate: string,
    selectedCat: string,
    selectedSubcat: string
  ) => void;
  onApproveRecord: (seq: number, updatedPlate?: string) => void;
  onApproveAllQueue: () => void;
  onMarkAsLost: (seq: number) => void;
  onSimulateExpireAllQueue: () => void;
  onGenerateCriticalQueueSample: () => void;
  onInspectRecordModal: (record: PassageRecord) => void;
}

export const ApprovalQueue24h: React.FC<ApprovalQueue24hProps> = ({
  records,
  nowMs,
  workstationMode,
  onChangeWorkstationMode,
  onStopValidatingPlates,
  onActiveLockedSeqChange,
  sessionStats,
  validationAlert,
  onDismissAlert,
  onStartOrToggleSession,
  onResetSession,
  onSubmitWorkstationValidation,
  onApproveRecord,
  onApproveAllQueue,
  onMarkAsLost,
  onSimulateExpireAllQueue,
  onGenerateCriticalQueueSample,
  onInspectRecordModal,
}) => {
  const [editingPlates, setEditingPlates] = useState<Record<number, string>>({});
  const [showCheatSheet, setShowCheatSheet] = useState<boolean>(false);

  // TRAVA DA PASSAGEM ATIVA: A Estação de Validação guarda o `seq` da passagem atual
  // e NUNCA troca de passagem sozinha quando entra uma passagem nova mais curta na fila!
  // Só troca quando a passagem atual é validada, marcada como ilegível ou expira!
  const [lockedSeq, setLockedSeq] = useState<number | null>(null);

  const [workstationPlate, setWorkstationPlate] = useState<string>('');
  const [workstationCat, setWorkstationCat] = useState<string>('');
  const [workstationSubcat, setWorkstationSubcat] = useState<string>('');
  const [formIncompleteWarning, setFormIncompleteWarning] = useState<string | null>(null);

  // Ordenar a fila do prazo mais curto para o mais longo
  const sortedQueueItems = useMemo(() => {
    return records
      .filter((r) => r.aguardandoAprovacao24h && r.estadoRd === 'Pendente')
      .slice()
      .sort((a, b) => {
        const expA = a.expiraAprovacaoMs ?? a.timestampMs + 24 * 3600 * 1000;
        const expB = b.expiraAprovacaoMs ?? b.timestampMs + 24 * 3600 * 1000;
        return expA - expB;
      });
  }, [records]);

  // REGRA DE 1 MINUTO MÍNIMO:
  // 1) Se já existe uma passagem travada (`lockedSeq`) que ainda está pendente na fila,
  //    mantém ELA na tela até o operador concluir ou ela expirar.
  // 2) Ao puxar uma NOVA passagem para validar, SÓ envia passagens que tenham no mínimo
  //    1 minuto (60.000 ms) restante para expirar, para que a pessoa tenha tempo de pensar!
  const activeWorkstationItem = useMemo(() => {
    if (lockedSeq !== null) {
      const stillInQueue = sortedQueueItems.find((r) => r.seq === lockedSeq);
      if (stillInQueue) return stillInQueue;
    }
    const eligibleWithAtLeastOneMinute = sortedQueueItems.filter((r) => {
      const expMs = r.expiraAprovacaoMs ?? r.timestampMs + 24 * 3600 * 1000;
      return expMs - nowMs >= 60 * 1000;
    });
    return eligibleWithAtLeastOneMinute[0] || null;
  }, [lockedSeq, sortedQueueItems, nowMs]);

  const underOneMinuteCount = useMemo(() => {
    return sortedQueueItems.filter((r) => {
      const expMs = r.expiraAprovacaoMs ?? r.timestampMs + 24 * 3600 * 1000;
      return expMs - nowMs < 60 * 1000 && r.seq !== lockedSeq;
    }).length;
  }, [sortedQueueItems, nowMs, lockedSeq]);

  // Atualizar `lockedSeq` apenas quando a passagem anterior saiu da fila (validada, ilegível ou expirada)
  useEffect(() => {
    if (!workstationMode) {
      if (lockedSeq !== null) {
        setLockedSeq(null);
        onActiveLockedSeqChange?.(null);
      }
      return;
    }
    if (!activeWorkstationItem) {
      if (lockedSeq !== null) {
        setLockedSeq(null);
        onActiveLockedSeqChange?.(null);
      }
      return;
    }
    if (lockedSeq !== activeWorkstationItem.seq) {
      setLockedSeq(activeWorkstationItem.seq);
      onActiveLockedSeqChange?.(activeWorkstationItem.seq);
      setWorkstationPlate(activeWorkstationItem.placa);
      setWorkstationCat('');
      setWorkstationSubcat('');
      setFormIncompleteWarning(null);
    }
  }, [activeWorkstationItem, lockedSeq, workstationMode, onActiveLockedSeqChange]);

  const lostItems = useMemo(() => {
    return records
      .filter((r) => r.estadoRd === 'Pago perdido')
      .slice()
      .reverse()
      .slice(0, 15);
  }, [records]);

  const totalLostRevenue = records
    .filter((r) => r.estadoRd === 'Pago perdido')
    .reduce((acc, r) => acc + r.valorNumerico, 0);

  const formatRemainingTime = (expiraMs?: number) => {
    if (!expiraMs) return '12h 00m 00s';
    const diff = expiraMs - nowMs;
    if (diff <= 0) return '00m 00s (Expirado)';
    const totalSeconds = Math.floor(diff / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
      return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(
        2,
        '0'
      )}m ${String(secs).padStart(2, '0')}s`;
    }
    return `${String(mins).padStart(2, '0')}m ${String(secs).padStart(2, '0')}s`;
  };

  const formatStopwatch = (totalSec: number) => {
    const hh = Math.floor(totalSec / 3600);
    const mm = Math.floor((totalSec % 3600) / 60);
    const ss = totalSec % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:${String(
      ss
    ).padStart(2, '0')}`;
  };

  const totalProcessed = sessionStats.recoveredCount + sessionStats.lostCount;
  const validationsPerMinute =
    sessionStats.elapsedSeconds > 0
      ? (sessionStats.recoveredCount / (sessionStats.elapsedSeconds / 60)).toFixed(1)
      : '0.0';
  const avgSecondsPerValidation =
    totalProcessed > 0
      ? Math.round(sessionStats.elapsedSeconds / totalProcessed)
      : 0;
  const financialRecoveryRate =
    sessionStats.recoveredValue + sessionStats.lostValue > 0
      ? (
          (sessionStats.recoveredValue /
            (sessionStats.recoveredValue + sessionStats.lostValue)) *
          100
        ).toFixed(1)
      : '100.0';

  const handleEnterWorkstation = () => {
    const firstEligible = sortedQueueItems.find((r) => {
      const expMs = r.expiraAprovacaoMs ?? r.timestampMs + 24 * 3600 * 1000;
      return expMs - nowMs >= 60 * 1000;
    });
    if (firstEligible) {
      setLockedSeq(firstEligible.seq);
      onActiveLockedSeqChange?.(firstEligible.seq);
      setWorkstationPlate(firstEligible.placa);
      setWorkstationCat('');
      setWorkstationSubcat('');
    }
    onChangeWorkstationMode(true);
    onStartOrToggleSession(true);
  };

  const handleStopValidating = () => {
    setLockedSeq(null);
    onActiveLockedSeqChange?.(null);
    onStopValidatingPlates();
  };

  const handleWorkstationSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeWorkstationItem) return;

    const cleanPlate = workstationPlate.trim().toUpperCase();
    if (!cleanPlate) {
      setFormIncompleteWarning(
        'Preencha a Placa Mercosul antes de validar (ou clique em Ilegível se não for possível ler).'
      );
      return;
    }
    if (workstationCat === '') {
      setFormIncompleteWarning(
        'Selecione a Categoria original do veículo antes de validar.'
      );
      return;
    }
    if (workstationSubcat === '') {
      setFormIncompleteWarning(
        'Selecione a Subcat (Eixos Erguidos na CAM-03) antes de validar.'
      );
      return;
    }

    setFormIncompleteWarning(null);
    onSubmitWorkstationValidation(
      activeWorkstationItem.seq,
      cleanPlate,
      workstationCat,
      workstationSubcat
    );
  };

  return (
    <div className="space-y-6">
      {/* Barra Superior de Alternância */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              {workstationMode
                ? 'Estação de Capacitação & Validação Sequencial (Ativa)'
                : 'Mesa de Auditoria e Aprovação de Passagens (Ordenada pelo Menor Prazo SLA 24h)'}
            </h2>
            <p className="text-xs text-slate-600 mt-1 max-w-3xl">
              Novas passagens só são enviadas para a estação se tiverem <strong>no mínimo 1 minuto restante</strong> para expirar. Informe a <strong>Categoria original do veículo</strong> (total de eixos) e na <strong>Subcat</strong> os eixos erguidos para o cálculo exato do valor na planilha.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!workstationMode ? (
              <button
                onClick={handleEnterWorkstation}
                className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-md transition-colors whitespace-nowrap shrink-0 shadow-xs"
              >
                Iniciar Estação de Validação (Próxima a Expirar)
              </button>
            ) : (
              <button
                onClick={handleStopValidating}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors whitespace-nowrap shrink-0 shadow-xs"
              >
                Parar de Validar Placas
              </button>
            )}

            <button
              onClick={() => setShowCheatSheet((v) => !v)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              {showCheatSheet
                ? 'Ocultar Macete CAT 1–9'
                : 'Ver Macete CAT 1–9 (Simples vs Dupla)'}
            </button>

            <button
              onClick={onGenerateCriticalQueueSample}
              className="px-3 py-2 text-xs font-medium text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              + Gerar 5 Passagens Críticas (Faltando 2 a 6 min)
            </button>
          </div>
        </div>

        {/* Cola / Macete Rápido de Treinamento (Expansível) */}
        {showCheatSheet && (
          <div className="mt-4 p-4 bg-slate-900 text-slate-100 rounded-lg grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div>
              <div className="font-bold text-sky-400 mb-1.5">
                Categoria Original (Total de Eixos + Rodagem)
              </div>
              <pre className="font-mono text-[11px] leading-relaxed text-slate-200">
{`CAT 1 → 2 eixos simples (Corolla, Hilux)
CAT 2 → 2 eixos dupla   (Atego, Ônibus)
CAT 3 → 3 eixos simples (Hilux + carretinha)
CAT 4 → 3 eixos dupla   (Caminhão trucado)
CAT 5 → 4 eixos simples (S10 + trailer 2 eixos)
CAT 6 → 4 eixos dupla   (Caminhão rígido 4 eixos)
CAT 7 → 5 eixos dupla   (Carreta simples)
CAT 8 → 6 eixos dupla   (Carreta LS)
CAT 9 → 7+ eixos dupla  (Bitrem, Rodotrem)`}
              </pre>
            </div>
            <div>
              <div className="font-bold text-amber-400 mb-1.5">
                Regra da Categoria Original e Subcat
              </div>
              <ul className="space-y-1.5 text-slate-300 leading-relaxed">
                <li>
                  • <strong>Categoria Original (Cat)</strong>: Conte <strong>todos os eixos físicos</strong> do veículo (verdes no solo + amarelos erguidos) e veja o aro (<strong>◯ Simples</strong> ou <strong>◎ Dupla</strong>).
                </li>
                <li>
                  • <strong>Subcat (Eixos Erguidos)</strong>: Informe quantos eixos estão suspensos (amarelos). O sistema desconta os eixos erguidos automaticamente no valor da planilha!
                </li>
              </ul>
            </div>
            <div>
              <div className="font-bold text-red-400 mb-1.5">
                Quando Clicar em &ldquo;Ilegível&rdquo;?
              </div>
              <ul className="space-y-1.5 text-slate-300 leading-relaxed">
                <li>
                  • Quando você perceber visualmente que a placa está encoberta por barro/dano e não permite ler os 7 caracteres mesmo ajustando os sliders.
                </li>
                <li>
                  • Quando a visão dos pneus na <strong>CAM-03 Lateral</strong> estiver obstruída impedindo contar os eixos.
                </li>
              </ul>
            </div>
          </div>
        )}

        {/* Painel de Produtividade e Telemetria do Operador */}
        {(workstationMode || sessionStats.elapsedSeconds > 0 || totalProcessed > 0) && (
          <div className="mt-5 pt-4 border-t border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span className="text-xs font-semibold text-slate-800">
                Telemetria de Produtividade do Analista (Sessão de Capacitação)
              </span>
              <div className="flex items-center gap-2">
                {workstationMode && (
                  <button
                    onClick={handleStopValidating}
                    className="px-3 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors"
                  >
                    Parar de Validar Placas
                  </button>
                )}
                <button
                  onClick={() => onStartOrToggleSession()}
                  className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded"
                >
                  {sessionStats.isActive ? 'Pausar Cronômetro' : 'Retomar Cronômetro'}
                </button>
                <button
                  onClick={onResetSession}
                  className="px-2.5 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 underline"
                >
                  Zerar Sessão
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="p-3 bg-slate-900 text-white rounded-md">
                <div className="text-[11px] text-slate-400">
                  Tempo Acumulado de Validação
                </div>
                <div className="text-xl font-bold font-mono tabular-nums mt-1 text-sky-400">
                  {formatStopwatch(sessionStats.elapsedSeconds)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {validationAlert?.blockingModal
                    ? 'PAUSADO PARA LEITURA DO ALERTA'
                    : sessionStats.isActive
                    ? 'Cronômetro em andamento'
                    : 'Validação pausada'}
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md">
                <div className="text-[11px] text-emerald-800 font-medium">
                  Passagens Recuperadas (Corretas)
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-800 mt-1">
                  {sessionStats.recoveredCount} passagens
                </div>
                <div className="text-xs font-mono font-semibold text-emerald-700 mt-1">
                  Recuperado: {formatCurrencyBRL(sessionStats.recoveredValue)}
                </div>
              </div>

              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <div className="text-[11px] text-red-800 font-medium">
                  Passagens Perdidas (Erro ou Expiradas)
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-red-800 mt-1">
                  {sessionStats.lostCount} passagens
                </div>
                <div className="text-xs font-mono font-semibold text-red-700 mt-1">
                  Perdido: {formatCurrencyBRL(sessionStats.lostValue)}
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <div className="text-[11px] text-slate-500 font-medium">
                  Média de Produtividade
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 mt-1">
                  {validationsPerMinute} val/min
                </div>
                <div className="text-xs font-mono text-slate-600 mt-1">
                  Média: {avgSecondsPerValidation}s por veículo
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md">
                <div className="text-[11px] text-slate-500 font-medium">
                  Taxa de Recuperação Financeira
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-sky-800 mt-1">
                  {financialRecoveryRate}%
                </div>
                <div className="text-xs font-mono text-slate-600 mt-1">
                  Restam {sortedQueueItems.length} na fila
                </div>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Banner leve apenas para acertos */}
      {validationAlert && !validationAlert.blockingModal && (
        <section className="bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-lg p-3.5 flex items-center justify-between">
          <div className="text-xs font-medium">
            <strong className="font-mono uppercase bg-emerald-200 text-emerald-900 px-2 py-0.5 rounded mr-2">
              ACERTO
            </strong>
            {validationAlert.title} ({validationAlert.recibo} · {validationAlert.valor}) —{' '}
            <span className="font-mono">{validationAlert.details[0]}</span>
          </div>
          <button
            type="button"
            onClick={onDismissAlert}
            className="text-xs font-semibold text-emerald-800 hover:underline ml-4"
          >
            Fechar
          </button>
        </section>
      )}

      {/* MODO 1: ESTAÇÃO DE VALIDAÇÃO SEQUENCIAL */}
      {workstationMode ? (
        <section className="space-y-5">
          {!activeWorkstationItem ? (
            <div className="bg-white border border-slate-200 rounded-lg p-10 text-center space-y-3">
              <h3 className="text-base font-semibold text-slate-900">
                Nenhuma passagem com tempo hábil (&ge; 1 minuto) disponível na fila!
              </h3>
              <p className="text-xs text-slate-600 max-w-xl mx-auto">
                {underOneMinuteCount > 0
                  ? `Existem ${underOneMinuteCount} passagem(ns) com menos de 1 minuto restante que expirarão normalmente sem serem enviadas para a estação (para garantir tempo de raciocínio).`
                  : 'Todas as passagens elegíveis da fila de 24h foram auditadas.'}
              </p>
              <div className="flex items-center justify-center gap-3 pt-2">
                <button
                  onClick={onGenerateCriticalQueueSample}
                  className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-md transition-colors"
                >
                  + Gerar 5 Novas Passagens Críticas (Faltando 2 a 6 min)
                </button>
                <button
                  onClick={handleStopValidating}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                >
                  Parar de Validar Placas
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
              {/* Barra da Passagem Travada Atual */}
              <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-sky-900 bg-sky-100 px-2.5 py-1 rounded font-mono">
                    PASSAGEM EM VALIDAÇÃO ({sortedQueueItems.length} na fila)
                  </span>
                  <span className="text-sm font-bold text-slate-900 font-mono">
                    Recibo {activeWorkstationItem.idRecibo}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="text-xs text-slate-600">
                    Passagem em{' '}
                    <strong className="font-mono">{activeWorkstationItem.dataHora}</strong>
                  </span>
                  {underOneMinuteCount > 0 && (
                    <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                      {underOneMinuteCount} na fila com &lt;1 min (expirando sem envio)
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-[11px] text-slate-500">
                      Tempo Restante para Expirar (SLA 24h)
                    </div>
                    <div
                      className={`text-lg font-bold font-mono tabular-nums ${
                        (activeWorkstationItem.expiraAprovacaoMs ?? 0) - nowMs <
                        10 * 60 * 1000
                          ? 'text-red-600'
                          : 'text-amber-700'
                      }`}
                    >
                      {formatRemainingTime(activeWorkstationItem.expiraAprovacaoMs)}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleStopValidating}
                    className="px-3 py-2 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors whitespace-nowrap shrink-0"
                  >
                    Parar de Validar Placas
                  </button>
                </div>
              </div>

              {/* As 3 Câmeras do Veículo + Sliders */}
              <FreeFlowCameraTriplet
                record={activeWorkstationItem}
                hideCategorySpoilers
              />

              {formIncompleteWarning && (
                <div className="p-3 bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold rounded-md">
                  {formIncompleteWarning}
                </div>
              )}

              {/* Formulário de Decisão e Auditoria do Operador */}
              <form
                onSubmit={handleWorkstationSubmit}
                className="p-4 bg-slate-50 border border-slate-200 rounded-lg grid grid-cols-1 md:grid-cols-12 gap-4 items-end"
              >
                <div className="md:col-span-3">
                  <label
                    htmlFor="ws-plate-input"
                    className="block text-xs font-semibold text-slate-800 mb-1"
                  >
                    Placa Mercosul Validada *
                  </label>
                  <input
                    id="ws-plate-input"
                    type="text"
                    maxLength={8}
                    value={workstationPlate}
                    onChange={(e) =>
                      setWorkstationPlate(e.target.value.toUpperCase())
                    }
                    placeholder="Digite a placa lida..."
                    className="w-full px-3 py-2 text-base font-mono font-bold uppercase bg-white border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-sky-600"
                  />
                  <div className="text-[11px] text-slate-500 mt-1 font-mono">
                    OCR sugeriu: {activeWorkstationItem.placaLidaOcr || activeWorkstationItem.placa} (
                    {activeWorkstationItem.confiancaOcr ?? 70}%)
                  </div>
                </div>

                <div className="md:col-span-4">
                  <label
                    htmlFor="ws-cat-select"
                    className="block text-xs font-semibold text-slate-800 mb-1"
                  >
                    Categoria (Eixos no Solo + Rodagem na CAM-03) *
                  </label>
                  <select
                    id="ws-cat-select"
                    value={workstationCat}
                    onChange={(e) => setWorkstationCat(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  >
                    <option value="">-- Em branco (Informe a Categoria Original) --</option>
                    {CATEGORIAS_VEICULOS.map((c) => (
                      <option key={c.cat} value={c.cat}>
                        {c.nomeCurto} (Cód. {c.cat}) —{' '}
                        {c.isento
                          ? 'Isento (Moto, Ambulância, Polícia, Oficial)'
                          : `${c.eixosTexto} eixos totais · Rodagem ${c.rodagem} (${c.exemploVeiculo})`}
                      </option>
                    ))}
                  </select>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Categoria original (total de eixos físicos) · ◯ Simples (CAT 1,3,5) · ◎ Dupla (CAT 2,4,6,7,8,9)
                  </div>
                </div>

                <div className="md:col-span-2">
                  <label
                    htmlFor="ws-subcat-select"
                    className="block text-xs font-semibold text-slate-800 mb-1"
                  >
                    Subcat (Eixos Erguidos) *
                  </label>
                  <select
                    id="ws-subcat-select"
                    value={workstationSubcat}
                    onChange={(e) => setWorkstationSubcat(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600"
                  >
                    <option value="">-- Em branco --</option>
                    <option value="00">Sub 00 — 0 erguidos</option>
                    <option value="01">Sub 01 — 1 erguido</option>
                    <option value="02">Sub 02 — 2 erguidos</option>
                    <option value="03">Sub 03 — 3 erguidos</option>
                  </select>
                  <div className="text-[11px] text-slate-500 mt-1">
                    Eixos erguidos (descontados no Valor)
                  </div>
                </div>

                <div className="md:col-span-3 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="submit"
                      className="flex-1 py-2.5 px-4 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap"
                    >
                      Validar Passagem (Enter)
                    </button>
                    <button
                      type="button"
                      onClick={() => onMarkAsLost(activeWorkstationItem.seq)}
                      className="py-2.5 px-3 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors whitespace-nowrap"
                    >
                      Ilegível
                    </button>
                  </div>
                  <div className="text-[10px] text-slate-500 text-right">
                    Só envia passagens com &ge; 1 min restante
                  </div>
                </div>
              </form>
            </div>
          )}
        </section>
      ) : (
        /* MODO 2: TABELA COMPLETA DA FILA 24H */
        <>
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  Fila Ativa de Validação de Placas — Ordenada por Menor Prazo SLA 24h ({sortedQueueItems.length})
                </h3>
                <p className="text-xs text-slate-500">
                  Clique em <strong>Iniciar Estação de Validação</strong> acima para realizar o treinamento com passagem travada (passagens com menos de 1 minuto não são enviadas para a estação e expiram normalmente).
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onApproveAllQueue}
                  disabled={sortedQueueItems.length === 0}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 rounded transition-colors whitespace-nowrap shrink-0"
                >
                  Aprovar Todas ({sortedQueueItems.length})
                </button>
                <button
                  onClick={onSimulateExpireAllQueue}
                  disabled={sortedQueueItems.length === 0}
                  className="px-3 py-1.5 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 disabled:opacity-40 rounded transition-colors whitespace-nowrap shrink-0"
                >
                  Simular Estouro 24h em Todas
                </button>
              </div>
            </div>

            {sortedQueueItems.length === 0 ? (
              <div className="py-10 text-center border border-dashed border-slate-200 rounded-lg">
                <p className="text-sm font-medium text-slate-800">
                  Nenhuma passagem aguardando aprovação manual no momento.
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Clique em &ldquo;+ Gerar 5 Passagens Críticas (Faltando 2 a 6 min)&rdquo; acima para treinar a equipe.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 pr-3">Prazo SLA 24h (Mais curto 1º)</th>
                      <th className="py-2.5 px-3">ID Recibo (3 Fotos)</th>
                      <th className="py-2.5 px-3">Data/Hora Passagem</th>
                      <th className="py-2.5 px-3">Praça / Pista</th>
                      <th className="py-2.5 px-3">Confiança OCR</th>
                      <th className="py-2.5 px-3">Placa Lida OCR</th>
                      <th className="py-2.5 px-3 text-right">Valor Tarifa</th>
                      <th className="py-2.5 pl-3 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                    {sortedQueueItems.map((item) => {
                      const portico = PORTICO_MAP[item.praca];
                      const currentPlate =
                        editingPlates[item.seq] !== undefined
                          ? editingPlates[item.seq]
                          : item.placa;
                      const remainingMs =
                        (item.expiraAprovacaoMs ?? item.timestampMs + 86400000) - nowMs;
                      const isCritical = remainingMs < 15 * 60 * 1000;
                      const isUnderOneMin = remainingMs < 60 * 1000;

                      return (
                        <tr
                          key={item.seq}
                          className={
                            isCritical
                              ? 'bg-red-50/40 hover:bg-red-50/80'
                              : 'hover:bg-slate-50'
                          }
                        >
                          <td
                            className={`py-2.5 pr-3 font-bold ${
                              isCritical ? 'text-red-700' : 'text-amber-800'
                            }`}
                          >
                            {formatRemainingTime(item.expiraAprovacaoMs)}
                            {isUnderOneMin ? (
                              <span className="ml-1.5 text-[10px] font-sans font-semibold text-red-700">
                                · &lt; 1 MIN (EXPIRANDO)
                              </span>
                            ) : (
                              isCritical && (
                                <span className="ml-1.5 text-[10px] font-sans font-semibold text-red-700">
                                  · CRÍTICO
                                </span>
                              )
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <button
                              type="button"
                              onClick={() => onInspectRecordModal(item)}
                              className="font-semibold text-sky-700 hover:underline text-left"
                            >
                              {item.idRecibo}
                            </button>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{item.dataHora}</td>
                          <td className="py-2.5 px-3 font-sans text-slate-700">
                            <span className="font-mono font-semibold">{item.pista}</span> ·{' '}
                            {portico?.municipio}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            <span className="font-mono font-semibold text-amber-700">
                              {item.confiancaOcr ?? 68}%
                            </span>{' '}
                            ·{' '}
                            <span className="text-slate-600">
                              Requer auditoria visual (3 câmeras)
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <input
                              type="text"
                              value={currentPlate}
                              maxLength={8}
                              onChange={(e) =>
                                setEditingPlates((prev) => ({
                                  ...prev,
                                  [item.seq]: e.target.value.toUpperCase(),
                                }))
                              }
                              className="w-28 px-2 py-1 text-xs font-mono font-semibold uppercase bg-white border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-sky-600"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                            {item.valor}
                          </td>
                          <td className="py-2.5 pl-3 text-right font-sans">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => onInspectRecordModal(item)}
                                className="px-2 py-1 text-xs font-medium text-sky-800 bg-sky-50 hover:bg-sky-100 border border-sky-200 rounded transition-colors whitespace-nowrap shrink-0"
                              >
                                Ver 3 Fotos
                              </button>
                              <button
                                type="button"
                                onClick={() => onApproveRecord(item.seq, currentPlate)}
                                className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded transition-colors whitespace-nowrap shrink-0"
                              >
                                Validar
                              </button>
                              <button
                                type="button"
                                onClick={() => onMarkAsLost(item.seq)}
                                className="px-2 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded transition-colors whitespace-nowrap shrink-0"
                              >
                                Ilegível
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Resumo de Passagens Perdidas */}
          <section className="bg-white border border-slate-200 rounded-lg p-5">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Últimas Passagens Perdidas Registradas na Planilha (Estado RD = Pago perdido · Total: {formatCurrencyBRL(totalLostRevenue)})
              </h3>
              <span className="text-xs text-slate-500">
                Clique no ID Recibo para inspecionar as 3 fotos do veículo
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                    <th className="py-2 pr-3">ID Recibo</th>
                    <th className="py-2 px-3">Mensagem ID</th>
                    <th className="py-2 px-3">Data/Hora</th>
                    <th className="py-2 px-3">Praça / Pista</th>
                    <th className="py-2 px-3">Cat / Subcat</th>
                    <th className="py-2 px-3">Placa</th>
                    <th className="py-2 px-3">Estado RD</th>
                    <th className="py-2 pl-3 text-right">Receita Perdida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
                  {lostItems.map((item) => (
                    <tr key={item.seq} className="hover:bg-slate-50">
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() => onInspectRecordModal(item)}
                          className="font-semibold text-sky-700 hover:underline"
                        >
                          {item.idRecibo}
                        </button>
                      </td>
                      <td className="py-2 px-3 text-slate-600">{item.mensagemId}</td>
                      <td className="py-2 px-3 text-slate-700">{item.dataHora}</td>
                      <td className="py-2 px-3 text-slate-700">
                        Praça {item.praca} · {item.pista}
                      </td>
                      <td className="py-2 px-3 text-slate-700">
                        Cat {item.cat} / Sub {item.subcat}
                      </td>
                      <td className="py-2 px-3 text-slate-800">{item.placa}</td>
                      <td className="py-2 px-3 font-sans font-semibold text-red-700">
                        {item.estadoRd}
                      </td>
                      <td className="py-2 pl-3 text-right font-semibold text-red-700">
                        {item.valor}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
};
