import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ApprovalQueue24h,
  OperatorSessionStats,
  ValidationAlertInfo,
} from './components/ApprovalQueue24h';
import { ExecutiveDashboard } from './components/ExecutiveDashboard';
import { PassageInspectionModal } from './components/PassageInspectionModal';
import { PorticosReferenceView } from './components/PorticosReferenceView';
import { PowerBiDaxGuide } from './components/PowerBiDaxGuide';
import { SpreadsheetView } from './components/SpreadsheetView';
import { CATEGORIAS_VEICULOS, PORTICO_MAP } from './data/porticos';
import { EstadoRD, GeneratorConfig, PassageRecord } from './types/passage';
import {
  generateCsvContent,
  generateWorkbookBuffer,
  triggerBrowserDownload,
} from './utils/exportSpreadsheet';
import {
  calculateTariffValue,
  createInitialSeedRecords,
  formatCurrencyBRL,
  formatDateTimeBR,
  generateSinglePassage,
} from './utils/generator';

type ActiveTab = 'dashboard' | 'fila24h' | 'planilha' | 'porticos' | 'dax';

const STORAGE_KEY_RECORDS = 'cca_freeflow_records_v4';
const STORAGE_KEY_CONFIG = 'cca_freeflow_config_v4';

const DEFAULT_CONFIG: GeneratorConfig = {
  isRunning: false,
  intervalSeconds: 3,
  batchSizePerTick: 2,
  plateMaskMode: 'mercosul7',
  weights: {
    pago: 50,
    pendente: 18,
    evasao: 12,
    pagoPerdido: 6,
    isento: 4,
    fila24h: 10,
  },
};

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [workstationMode, setWorkstationMode] = useState<boolean>(false);
  const activeLockedSeqRef = useRef<number | null>(null);

  const [config, setConfig] = useState<GeneratorConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (saved) return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
    } catch {
      // ignore storage error
    }
    return DEFAULT_CONFIG;
  });

  const [records, setRecords] = useState<PassageRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RECORDS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore storage error
    }
    return createInitialSeedRecords(50, DEFAULT_CONFIG);
  });

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [inspectedRecord, setInspectedRecord] = useState<PassageRecord | null>(
    null
  );

  // Telemetria da sessão de validação do operador
  const [sessionStats, setSessionStats] = useState<OperatorSessionStats>({
    isActive: false,
    elapsedSeconds: 0,
    recoveredCount: 0,
    recoveredValue: 0,
    lostCount: 0,
    lostValue: 0,
  });

  const [validationAlert, setValidationAlert] =
    useState<ValidationAlertInfo | null>(null);

  // Se há um modal de erro/expiração aberto na tela, TODO O TEMPO FICA PAUSADO até clicar em "Entendi"
  const isTimePausedForLearning = Boolean(validationAlert?.blockingModal);
  const isTimePausedRef = useRef<boolean>(false);
  useEffect(() => {
    isTimePausedRef.current = isTimePausedForLearning;
  }, [isTimePausedForLearning]);

  // Ref indicando se o operador está ativamente validando na Estação de Validação
  const isUserActivelyValidatingRef = useRef<boolean>(false);
  useEffect(() => {
    isUserActivelyValidatingRef.current =
      activeTab === 'fila24h' && workstationMode;
  }, [activeTab, workstationMode]);

  const [exportFormat, setExportFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [linkedFileName, setLinkedFileName] = useState<string | null>(null);
  const fileHandleRef = useRef<any>(null);
  const [statusToast, setStatusToast] = useState<string | null>(null);
  const [showGeneratorSettings, setShowGeneratorSettings] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [lastSavedCount, setLastSavedCount] = useState<number>(records.length);

  // Salvar histórico acumulado no localStorage
  useEffect(() => {
    try {
      const sliceToSave =
        records.length > 5000 ? records.slice(-5000) : records;
      localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(sliceToSave));
    } catch {
      // ignore quota error
    }
  }, [records]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(config));
    } catch {
      // ignore
    }
  }, [config]);

  const showToast = useCallback((msg: string) => {
    setStatusToast(msg);
    setTimeout(() => {
      setStatusToast((prev) => (prev === msg ? null : prev));
    }, 4500);
  }, []);

  // Função para parar de validar placas (pausa o cronômetro do operador, sai da estação e bloqueia alertas fora da estação)
  const handleStopValidatingPlates = useCallback(() => {
    setWorkstationMode(false);
    activeLockedSeqRef.current = null;
    setSessionStats((prev) => ({ ...prev, isActive: false }));
    setValidationAlert(null);
  }, []);

  // Se o usuário trocar para outra aba (Painel PBI, Planilha, Pórticos, DAX),
  // pausa o cronômetro de validação do operador e encerra a estação ativa para não disparar alertas em outra tela
  const handleSwitchTab = useCallback((nextTab: ActiveTab) => {
    if (nextTab !== 'fila24h') {
      setWorkstationMode(false);
      activeLockedSeqRef.current = null;
      setSessionStats((prev) => ({ ...prev, isActive: false }));
      setValidationAlert(null);
    }
    setActiveTab(nextTab);
  }, []);

  // Relógio de 1 segundo:
  // - Os prazos SLA 24h continuam expirando normalmente em segundo plano.
  // - Porém, o Alerta Modal de Expiração SÓ é exibido se o usuário estiver ativamente na Estação de Validação
  //   E a passagem que expirou for a passagem travada na tela dele!
  useEffect(() => {
    const interval = setInterval(() => {
      const currentNow = Date.now();
      setNowMs(currentNow);

      if (isTimePausedRef.current) {
        // Congelar os prazos SLA de todas as passagens da fila enquanto a pessoa lê o alerta!
        setRecords((prev) =>
          prev.map((r) =>
            r.aguardandoAprovacao24h && r.expiraAprovacaoMs
              ? { ...r, expiraAprovacaoMs: r.expiraAprovacaoMs + 1000 }
              : r
          )
        );
        return;
      }

      setSessionStats((prev) =>
        prev.isActive && isUserActivelyValidatingRef.current
          ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 }
          : prev
      );

      setRecords((prevRecords) => {
        let expiredAny = false;
        let activeWorkstationExpiredRec: PassageRecord | null = null;

        const updated = prevRecords.map((r) => {
          if (
            r.aguardandoAprovacao24h &&
            r.estadoRd === 'Pendente' &&
            r.expiraAprovacaoMs &&
            currentNow >= r.expiraAprovacaoMs
          ) {
            expiredAny = true;
            // Verifica se a passagem que expirou era exatamente a que o operador estava validando na Estação
            if (
              isUserActivelyValidatingRef.current &&
              activeLockedSeqRef.current !== null &&
              r.seq === activeLockedSeqRef.current
            ) {
              activeWorkstationExpiredRec = r;
            }
            return {
              ...r,
              aguardandoAprovacao24h: false,
              estadoRd: 'Pago perdido' as EstadoRD,
              formaPagamento: '-',
              emissorGruposIsentos: '-',
              pago: '-',
              pagoNumerico: 0,
              localPagamento: '-',
              dataPagamento: '-',
              arrecadador: '-',
            };
          }
          return r;
        });

        // Só exibe alerta na tela se a passagem que o usuário estava validando na estação expirou!
        if (expiredAny && activeWorkstationExpiredRec) {
          const recObj = activeWorkstationExpiredRec as PassageRecord;
          const catObj = CATEGORIAS_VEICULOS.find((c) => c.cat === recObj.cat);
          setSessionStats((st) => {
            const newLostCount = st.lostCount + 1;
            const newLostValue = Number(
              (st.lostValue + recObj.valorNumerico).toFixed(2)
            );
            setValidationAlert({
              type: 'expired_timeout',
              title: 'Prazo SLA de 24 horas Expirado!',
              recibo: recObj.idRecibo,
              valor: recObj.valor,
              details: [
                `A passagem ${recObj.idRecibo} não foi validada dentro do prazo de 24h e virou "Pago perdido".`,
                recObj.ehIlegivelReal
                  ? `Condição da passagem: Esta passagem estava fisicamente ILEGÍVEL (${recObj.detalheAnomalia}) e deveria ter sido marcada no botão "Ilegível" antes do prazo acabar.`
                  : `Gabarito correto da passagem perdida: Placa "${
                      recObj.placaReal || recObj.placa
                    }" · ${catObj?.nomeCurto || `Cat ${recObj.cat}`} (${
                      recObj.eixosSoloReais || catObj?.eixosTexto
                    } eixos totais · Rodagem ${catObj?.rodagem}) · Subcat ${
                      recObj.subcat
                    } (${Number(recObj.subcat)} erguidos)`,
              ],
              accumulatedLostCount: newLostCount,
              accumulatedLostValue: newLostValue,
              blockingModal: true,
            });
            return {
              ...st,
              lostCount: newLostCount,
              lostValue: newLostValue,
            };
          });
        }

        return expiredAny ? updated : prevRecords;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setInspectedRecord(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const appendNewPassages = useCallback(
    (count: number, forceCriticalQueue24h = false) => {
      setRecords((prev) => {
        const lastSeq = prev.length > 0 ? prev[prev.length - 1].seq : 0;
        const newItems: PassageRecord[] = [];
        const now = new Date();

        for (let i = 1; i <= count; i++) {
          const nextSeq = lastSeq + i;
          if (forceCriticalQueue24h) {
            const customConfig: GeneratorConfig = {
              ...config,
              weights: {
                pago: 0,
                pendente: 0,
                evasao: 0,
                pagoPerdido: 0,
                isento: 0,
                fila24h: 100,
              },
            };
            // Sempre gera com >= 1.8 a 6.2 minutos restantes para garantir >= 1 minuto de tempo para pensar!
            const minsRemaining = Number(
              (1.8 + Math.random() * 4.4).toFixed(2)
            );
            newItems.push(
              generateSinglePassage(nextSeq, customConfig, {
                forceNearExpirationMinutes: minsRemaining,
              })
            );
          } else {
            const useRealtimeDate =
              count <= 5 ? new Date(now.getTime() - i * 1000) : undefined;
            newItems.push(
              generateSinglePassage(nextSeq, config, {
                customDate: useRealtimeDate,
              })
            );
          }
        }
        return [...prev, ...newItems];
      });
    },
    [config]
  );

  // Timer automático a cada X segundos (pausado enquanto o modal de aprendizado estiver aberto!)
  useEffect(() => {
    if (!config.isRunning || isTimePausedForLearning) return;
    const ms = Math.max(1, config.intervalSeconds) * 1000;
    const timer = setInterval(() => {
      appendNewPassages(config.batchSizePerTick);
    }, ms);
    return () => clearInterval(timer);
  }, [
    config.isRunning,
    config.intervalSeconds,
    config.batchSizePerTick,
    isTimePausedForLearning,
    appendNewPassages,
  ]);

  const handleLinkLocalFile = async () => {
    const win = window as any;
    if (typeof win.showSaveFilePicker !== 'function') {
      showToast(
        'Navegador em modo visualização: o botão principal fará o download direto na sua pasta do PBI.'
      );
      return;
    }

    try {
      const suggestedName =
        exportFormat === 'xlsx'
          ? 'Base_FreeFlow_CCA.xlsx'
          : 'Base_FreeFlow_CCA.csv';
      const handle = await win.showSaveFilePicker({
        suggestedName,
        types:
          exportFormat === 'xlsx'
            ? [
                {
                  description: 'Planilha Excel Power BI (.xlsx)',
                  accept: {
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
                      ['.xlsx'],
                  },
                },
              ]
            : [
                {
                  description: 'Arquivo CSV Power BI (.csv)',
                  accept: { 'text/csv': ['.csv'] },
                },
              ],
      });
      fileHandleRef.current = handle;
      setLinkedFileName(handle.name || suggestedName);
      showToast(
        `Arquivo local "${
          handle.name || suggestedName
        }" vinculado! Clique em Exportar Planilha para gravar.`
      );
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        showToast(
          'No modo preview integrado, utilize o botão Exportar Planilha para salvar o arquivo acumulado.'
        );
      }
    }
  };

  const handleExportSpreadsheet = async (formatOverride?: 'xlsx' | 'csv') => {
    const targetFormat = formatOverride || exportFormat;
    const filename =
      targetFormat === 'xlsx'
        ? 'Base_FreeFlow_Caminhos_da_Celulose_CCA.xlsx'
        : 'Base_FreeFlow_Caminhos_da_Celulose_CCA.csv';

    let blob: Blob;
    if (targetFormat === 'xlsx') {
      const buffer = generateWorkbookBuffer(records, true);
      blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
    } else {
      const csvText = generateCsvContent(records, ';');
      blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    }

    if (fileHandleRef.current && !formatOverride) {
      try {
        const writable = await fileHandleRef.current.createWritable();
        await writable.write(blob);
        await writable.close();
        setLastSavedCount(records.length);
        showToast(
          `Planilha "${linkedFileName}" atualizada na pasta local com ${records.length} linhas acumuladas!`
        );
        return;
      } catch {
        // Fallback para download
      }
    }

    triggerBrowserDownload(blob, filename);
    setLastSavedCount(records.length);
    showToast(
      `Planilha ${targetFormat.toUpperCase()} gerada com todas as ${
        records.length
      } linhas acumuladas (FAKEFF000001 até FAKEFF${String(
        records[records.length - 1]?.seq || 1
      ).padStart(6, '0')}).`
    );
  };

  /**
   * Validação rigorosa na Estação de Capacitação:
   * - Se a passagem era genuinamente ilegível (`ehIlegivelReal === true`) e a pessoa tentou validar: ERRO! Deveria ter clicado em Ilegível.
   * - Se acertar Placa + Cat (Categoria Original) + Subcat (Eixos Erguidos):
   *   recalcula o Valor exato descontando os eixos erguidos, grava na planilha e altera para "Pago" ou "Evasao".
   * - Se errar qualquer um dos 3: envia com erro, altera para "Pago perdido", soma como Perda e abre o Modal Pausado até clicar em "Entendi".
   */
  const handleSubmitWorkstationValidation = (
    seq: number,
    typedPlate: string,
    selectedCat: string,
    selectedSubcat: string
  ) => {
    const targetRecord = records.find((r) => r.seq === seq);
    if (!targetRecord) return;

    // Caso 1: A passagem era fisicamente ILEGÍVEL e a pessoa tentou aprovar!
    if (targetRecord.ehIlegivelReal) {
      setRecords((prev) =>
        prev.map((r) =>
          r.seq === seq
            ? {
                ...r,
                aguardandoAprovacao24h: false,
                estadoRd: 'Pago perdido',
                formaPagamento: '-',
                emissorGruposIsentos: '-',
                pago: '-',
                pagoNumerico: 0,
                localPagamento: '-',
                dataPagamento: '-',
                arrecadador: '-',
              }
            : r
        )
      );

      setSessionStats((prev) => {
        const nextLostCount = prev.lostCount + 1;
        const nextLostVal = Number(
          (prev.lostValue + targetRecord.valorNumerico).toFixed(2)
        );
        setValidationAlert({
          type: 'error_validation',
          title:
            'Erro Operacional: Esta passagem era fisicamente ILEGÍVEL!',
          recibo: targetRecord.idRecibo,
          valor: targetRecord.valor,
          details: [
            `Motivo da ilegibilidade: ${targetRecord.detalheAnomalia}`,
            `O que você fez: Tentou validar a placa "${typedPlate}" e Categoria "Cat ${selectedCat}".`,
            `Procedimento correto: Quando não é possível ler os caracteres da placa ou ver os eixos na CAM-03 Lateral, você DEVE clicar no botão "Ilegível" para evitar cobrança/autuação indevida.`,
          ],
          accumulatedLostCount: nextLostCount,
          accumulatedLostValue: nextLostVal,
          blockingModal: true,
        });
        return {
          ...prev,
          isActive: true,
          lostCount: nextLostCount,
          lostValue: nextLostVal,
        };
      });
      return;
    }

    const truePlate = (
      targetRecord.placaReal || targetRecord.placa
    ).toUpperCase();
    const trueCat = targetRecord.cat;
    const trueSubcat = targetRecord.subcat;

    const cleanTypedPlate = typedPlate.trim().toUpperCase();
    const plateCorrect = cleanTypedPlate === truePlate;
    const catCorrect = selectedCat === trueCat;
    const subcatCorrect = selectedSubcat === trueSubcat;

    const isAllCorrect = plateCorrect && catCorrect && subcatCorrect;

    if (isAllCorrect) {
      const portico = PORTICO_MAP[targetRecord.praca];
      const baseTariff = portico ? portico.tarifaCat1 : 13.7;
      const recalculatedValNum =
        selectedCat === '00'
          ? 0
          : calculateTariffValue(
              baseTariff,
              selectedCat,
              selectedSubcat,
              targetRecord.eixosSoloReais
            );
      const recalculatedValStr = formatCurrencyBRL(recalculatedValNum);

      const finalStatus: EstadoRD =
        selectedCat === '00'
          ? 'Isento'
          : Math.random() < 0.75
          ? 'Pago'
          : 'Evasao';
      const useTag = Math.random() < 0.5;

      setRecords((prev) =>
        prev.map((r) => {
          if (r.seq !== seq) return r;
          if (finalStatus === 'Isento') {
            return {
              ...r,
              placa: truePlate,
              placaReal: truePlate,
              cat: selectedCat,
              subcat: selectedSubcat,
              valor: 'R$ 0,00',
              valorNumerico: 0,
              aguardandoAprovacao24h: false,
              confiancaOcr: 100,
              estadoRd: 'Isento',
            };
          }
          if (finalStatus === 'Pago') {
            return {
              ...r,
              placa: truePlate,
              placaReal: truePlate,
              cat: selectedCat,
              subcat: selectedSubcat,
              valor: recalculatedValStr,
              valorNumerico: recalculatedValNum,
              aguardandoAprovacao24h: false,
              confiancaOcr: 100,
              estadoRd: 'Pago',
              formaPagamento: useTag ? 'TAG Automatico' : 'PIX App CCA',
              emissorGruposIsentos: useTag
                ? 'Sem Parar'
                : 'Pagamento Avulso Digital',
              pago: recalculatedValStr,
              pagoNumerico: recalculatedValNum,
              localPagamento: useTag
                ? 'Automatico via Operadora (OSA)'
                : 'App Caminhos da Celulose',
              dataPagamento: formatDateTimeBR(new Date()),
              arrecadador: 'Itau Unibanco',
            };
          }
          return {
            ...r,
            placa: truePlate,
            placaReal: truePlate,
            cat: selectedCat,
            subcat: selectedSubcat,
            valor: recalculatedValStr,
            valorNumerico: recalculatedValNum,
            aguardandoAprovacao24h: false,
            confiancaOcr: 100,
            estadoRd: 'Evasao',
            formaPagamento: '-',
            emissorGruposIsentos: '-',
            pago: '-',
            pagoNumerico: 0,
            localPagamento: '-',
            dataPagamento: '-',
            arrecadador: '-',
          };
        })
      );

      setSessionStats((prev) => {
        const nextRecCount = prev.recoveredCount + 1;
        const nextRecVal = Number(
          (prev.recoveredValue + recalculatedValNum).toFixed(2)
        );
        setValidationAlert({
          type: 'success',
          title: `Passagem validada com sucesso e convertida para "${finalStatus}"!`,
          recibo: targetRecord.idRecibo,
          valor: recalculatedValStr,
          details: [
            `Placa: ${truePlate} · Cat Original: ${selectedCat} · Subcat (Erguidos): ${selectedSubcat} → Valor na Planilha: ${recalculatedValStr} (${finalStatus})`,
          ],
          accumulatedLostCount: prev.lostCount,
          accumulatedLostValue: prev.lostValue,
          blockingModal: false,
        });
        return {
          ...prev,
          isActive: true,
          recoveredCount: nextRecCount,
          recoveredValue: nextRecVal,
        };
      });
    } else {
      // Errou Placa, Cat ou Subcat -> abre Modal que pausa todo o tempo até clicar em "Entendi"
      const errorDetails: string[] = [];
      const trueCatObj = CATEGORIAS_VEICULOS.find((c) => c.cat === trueCat);
      const selectedCatObj = CATEGORIAS_VEICULOS.find(
        (c) => c.cat === selectedCat
      );
      const totalAxles =
        targetRecord.eixosSoloReais || trueCatObj?.eixosCobrados || 2;
      const liftedAxles = Number(trueSubcat) || 0;
      const groundAxles = Math.max(2, totalAxles - liftedAxles);

      if (!plateCorrect) {
        errorDetails.push(
          `PLACA INCORRETA: Você digitou "${cleanTypedPlate}", mas a placa correta era "${truePlate}". (${targetRecord.detalheAnomalia})`
        );
      } else {
        errorDetails.push(`Placa: Você acertou (${truePlate}).`);
      }

      if (!catCorrect) {
        errorDetails.push(
          `CATEGORIA ORIGINAL INCORRETA: Você selecionou "${
            selectedCatObj?.nomeCurto || `Cat ${selectedCat}`
          }", mas a categoria original do veículo era "${
            trueCatObj?.nomeCurto || `Cat ${trueCat}`
          }" (${totalAxles} eixos físicos totais · Rodagem ${
            trueCatObj?.rodagem
          } — ${trueCatObj?.exemploVeiculo}).`
        );
      } else {
        errorDetails.push(
          `Categoria Original: Você acertou (${trueCatObj?.nomeCurto} · ${totalAxles} eixos totais ${trueCatObj?.rodagem}).`
        );
      }

      if (!subcatCorrect) {
        errorDetails.push(
          `SUBCATEGORIA INCORRETA (Eixos Erguidos): Você selecionou "Sub ${selectedSubcat}", mas o correto na CAM-03 era "Sub ${trueSubcat}" (${liftedAxles} eixo(s) erguido(s) e ${groundAxles} no solo).`
        );
      } else {
        errorDetails.push(
          `Subcategoria: Você acertou (Sub ${trueSubcat} — ${liftedAxles} eixo(s) erguido(s) e ${groundAxles} no solo).`
        );
      }

      setRecords((prev) =>
        prev.map((r) => {
          if (r.seq !== seq) return r;
          return {
            ...r,
            placa: cleanTypedPlate,
            aguardandoAprovacao24h: false,
            estadoRd: 'Pago perdido',
            formaPagamento: '-',
            emissorGruposIsentos: '-',
            pago: '-',
            pagoNumerico: 0,
            localPagamento: '-',
            dataPagamento: '-',
            arrecadador: '-',
          };
        })
      );

      setSessionStats((prev) => {
        const nextLostCount = prev.lostCount + 1;
        const nextLostVal = Number(
          (prev.lostValue + targetRecord.valorNumerico).toFixed(2)
        );
        setValidationAlert({
          type: 'error_validation',
          title:
            'Você errou na validação — Passagem computada como Perda ("Pago perdido")!',
          recibo: targetRecord.idRecibo,
          valor: targetRecord.valor,
          details: errorDetails,
          accumulatedLostCount: nextLostCount,
          accumulatedLostValue: nextLostVal,
          blockingModal: true,
        });
        return {
          ...prev,
          isActive: true,
          lostCount: nextLostCount,
          lostValue: nextLostVal,
        };
      });
    }
  };

  const handleApproveRecordFromTable = (seq: number, updatedPlate?: string) => {
    const targetRecord = records.find((r) => r.seq === seq);
    if (!targetRecord) return;
    const plateToSubmit =
      updatedPlate && updatedPlate.trim()
        ? updatedPlate.trim()
        : targetRecord.placa;
    handleSubmitWorkstationValidation(
      seq,
      plateToSubmit,
      targetRecord.cat,
      targetRecord.subcat
    );
  };

  const handleApproveAllQueue = () => {
    let count = 0;
    let sumVal = 0;
    setRecords((prev) =>
      prev.map((r) => {
        if (r.aguardandoAprovacao24h && r.estadoRd === 'Pendente') {
          if (r.ehIlegivelReal) {
            return {
              ...r,
              aguardandoAprovacao24h: false,
              estadoRd: 'Pago perdido',
            };
          }
          count++;
          sumVal += r.valorNumerico;
          const finalStatus: EstadoRD =
            Math.random() < 0.75 ? 'Pago' : 'Evasao';
          const truePlate = r.placaReal || r.placa;
          if (finalStatus === 'Pago') {
            return {
              ...r,
              placa: truePlate,
              placaReal: truePlate,
              aguardandoAprovacao24h: false,
              confiancaOcr: 100,
              estadoRd: 'Pago',
              formaPagamento: 'PIX App CCA',
              emissorGruposIsentos: 'Pagamento Avulso Digital',
              pago: formatCurrencyBRL(r.valorNumerico),
              pagoNumerico: r.valorNumerico,
              localPagamento: 'App Caminhos da Celulose',
              dataPagamento: formatDateTimeBR(new Date()),
              arrecadador: 'Itau Unibanco',
            };
          }
          return {
            ...r,
            placa: truePlate,
            placaReal: truePlate,
            aguardandoAprovacao24h: false,
            confiancaOcr: 100,
            estadoRd: 'Evasao',
          };
        }
        return r;
      })
    );
    if (count > 0) {
      setSessionStats((prev) => ({
        ...prev,
        recoveredCount: prev.recoveredCount + count,
        recoveredValue: Number((prev.recoveredValue + sumVal).toFixed(2)),
      }));
    }
    showToast(
      `${count} passagens legíveis validadas para Pago / Evasao (${formatCurrencyBRL(
        sumVal
      )} recuperados)!`
    );
  };

  /**
   * Quando o operador clica no botão "Ilegível":
   * - Se a passagem era REALMENTE ilegível (`ehIlegivelReal === true`): Ele ACERTOU a decisão operacional!
   * - Se a passagem ERA legível (`ehIlegivelReal === false`): Ele ERROU (descartou receita que podia ser cobrada!) -> abre Modal Pausado mostrando o gabarito!
   */
  const handleMarkAsLost = (seq: number) => {
    const targetRec = records.find((r) => r.seq === seq);
    if (!targetRec) return;

    setRecords((prev) =>
      prev.map((r) => {
        if (r.seq !== seq) return r;
        return {
          ...r,
          aguardandoAprovacao24h: false,
          estadoRd: 'Pago perdido',
          formaPagamento: '-',
          emissorGruposIsentos: '-',
          pago: '-',
          pagoNumerico: 0,
          localPagamento: '-',
          dataPagamento: '-',
          arrecadador: '-',
        };
      })
    );

    if (targetRec.ehIlegivelReal) {
      setSessionStats((prev) => ({
        ...prev,
        isActive: true,
        recoveredCount: prev.recoveredCount + 1,
      }));
      setValidationAlert({
        type: 'success',
        title:
          'Decisão Correta! Você identificou uma passagem fisicamente Ilegível.',
        recibo: targetRec.idRecibo,
        valor: targetRec.valor,
        details: [`Condição confirmada: ${targetRec.detalheAnomalia}`],
        accumulatedLostCount: sessionStats.lostCount,
        accumulatedLostValue: sessionStats.lostValue,
        blockingModal: false,
      });
    } else {
      const trueCatObj = CATEGORIAS_VEICULOS.find(
        (c) => c.cat === targetRec.cat
      );
      const totalAxles =
        targetRec.eixosSoloReais || trueCatObj?.eixosCobrados || 2;
      const liftedAxles = Number(targetRec.subcat) || 0;
      const groundAxles = Math.max(2, totalAxles - liftedAxles);

      setSessionStats((prev) => {
        const nextLostCount = prev.lostCount + 1;
        const nextLostValue = Number(
          (prev.lostValue + targetRec.valorNumerico).toFixed(2)
        );
        setValidationAlert({
          type: 'error_validation',
          title:
            'Erro: Você marcou como Ilegível uma passagem que ERA POSSÍVEL LER!',
          recibo: targetRec.idRecibo,
          valor: targetRec.valor,
          details: [
            `Esta passagem possuía condição óptica recuperável: ${targetRecordDetail(
              targetRec
            )}`,
            `PLACA CORRETA: "${targetRec.placaReal || targetRec.placa}"`,
            `CATEGORIA ORIGINAL CORRETA: "${
              trueCatObj?.nomeCurto || `Cat ${targetRec.cat}`
            }" (${totalAxles} eixos físicos totais · Rodagem ${
              trueCatObj?.rodagem
            } — ${trueCatObj?.exemploVeiculo})`,
            `SUBCAT CORRETA: "Sub ${targetRec.subcat}" (${liftedAxles} eixo(s) erguido(s) e ${groundAxles} no solo)`,
          ],
          accumulatedLostCount: nextLostCount,
          accumulatedLostValue: nextLostValue,
          blockingModal: true,
        });
        return {
          ...prev,
          isActive: true,
          lostCount: nextLostCount,
          lostValue: nextLostValue,
        };
      });
    }
  };

  const targetRecordDetail = (r: PassageRecord) =>
    r.detalheAnomalia ||
    'Use os sliders de Brilho, Contraste, Nitidez e Infravermelho.';

  const handleSimulateExpireAllQueue = () => {
    let count = 0;
    let sumLost = 0;
    setRecords((prev) =>
      prev.map((r) => {
        if (r.aguardandoAprovacao24h && r.estadoRd === 'Pendente') {
          count++;
          sumLost += r.valorNumerico;
          return {
            ...r,
            aguardandoAprovacao24h: false,
            estadoRd: 'Pago perdido',
            formaPagamento: '-',
            emissorGruposIsentos: '-',
            pago: '-',
            pagoNumerico: 0,
            localPagamento: '-',
            dataPagamento: '-',
            arrecadador: '-',
          };
        }
        return r;
      })
    );
    if (count > 0) {
      setSessionStats((prev) => {
        const nextLostCount = prev.lostCount + count;
        const nextLostVal = Number((prev.lostValue + sumLost).toFixed(2));
        setValidationAlert({
          type: 'expired_timeout',
          title: `Estouro de prazo SLA 24h em ${count} passagem(ns)!`,
          recibo: `${count} recibos`,
          valor: formatCurrencyBRL(sumLost),
          details: [
            `Todas as ${count} passagens que aguardavam aprovação ultrapassaram 24h e viraram "Pago perdido".`,
          ],
          accumulatedLostCount: nextLostCount,
          accumulatedLostValue: nextLostVal,
          blockingModal: true,
        });
        return {
          ...prev,
          lostCount: nextLostCount,
          lostValue: nextLostVal,
        };
      });
    }
  };

  const handleChangeRecordStatus = (seq: number, newStatus: EstadoRD) => {
    setRecords((prev) =>
      prev.map((r) => {
        if (r.seq !== seq) return r;
        if (newStatus === 'Pago') {
          return {
            ...r,
            estadoRd: 'Pago',
            aguardandoAprovacao24h: false,
            formaPagamento:
              r.formaPagamento === '-' ? 'PIX App CCA' : r.formaPagamento,
            emissorGruposIsentos:
              r.emissorGruposIsentos === '-'
                ? 'Pagamento Avulso Digital'
                : r.emissorGruposIsentos,
            pago: formatCurrencyBRL(r.valorNumerico),
            pagoNumerico: r.valorNumerico,
            localPagamento:
              r.localPagamento === '-'
                ? 'App Caminhos da Celulose'
                : r.localPagamento,
            dataPagamento:
              r.dataPagamento === '-'
                ? formatDateTimeBR(new Date())
                : r.dataPagamento,
            arrecadador:
              r.arrecadador === '-' ? 'Itau Unibanco' : r.arrecadador,
          };
        }
        if (newStatus === 'Isento') {
          return {
            ...r,
            estadoRd: 'Isento',
            aguardandoAprovacao24h: false,
            valor: 'R$ 0,00',
            valorNumerico: 0,
            formaPagamento: '-',
            emissorGruposIsentos: 'Motocicleta (Isento Free Flow)',
            pago: '-',
            pagoNumerico: 0,
            localPagamento: '-',
            dataPagamento: '-',
            arrecadador: '-',
          };
        }
        return {
          ...r,
          estadoRd: newStatus,
          aguardandoAprovacao24h: false,
          formaPagamento: '-',
          emissorGruposIsentos: '-',
          pago: '-',
          pagoNumerico: 0,
          localPagamento: '-',
          dataPagamento: '-',
          arrecadador: '-',
        };
      })
    );
  };

  const handleResetDatabase = () => {
    const initial = createInitialSeedRecords(50, config);
    setRecords(initial);
    setLastSavedCount(initial.length);
    setConfirmReset(false);
    showToast(
      'Base reiniciada com as 50 linhas iniciais (a partir de FAKEFF000001).'
    );
  };

  const queueCount = records.filter(
    (r) => r.aguardandoAprovacao24h && r.estadoRd === 'Pendente'
  ).length;
  const unsavedNewRows = Math.max(0, records.length - lastSavedCount);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 Zonas separadas por gap-8 */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 flex items-center justify-between gap-8 sticky top-0 z-30">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            handleSwitchTab('dashboard');
          }}
          className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          Caminhos da Celulose · CCA Free Flow
        </a>

        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
          <button
            onClick={() => handleSwitchTab('dashboard')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'dashboard'
                ? 'border-sky-600 text-slate-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            Painel Executivo PBI
          </button>
          <button
            onClick={() => handleSwitchTab('fila24h')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'fila24h'
                ? 'border-sky-600 text-slate-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            Fila &amp; Treinamento 24h ({queueCount})
          </button>
          <button
            onClick={() => handleSwitchTab('planilha')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'planilha'
                ? 'border-sky-600 text-slate-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            Planilha Base ({records.length})
          </button>
          <button
            onClick={() => handleSwitchTab('porticos')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'porticos'
                ? 'border-sky-600 text-slate-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            Categorias &amp; 12 Pórticos
          </button>
          <button
            onClick={() => handleSwitchTab('dax')}
            className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
              activeTab === 'dax'
                ? 'border-sky-600 text-slate-900 font-semibold'
                : 'border-transparent'
            }`}
          >
            Medidas DAX PBI
          </button>
        </nav>

        <div className="flex items-center shrink-0">
          <button
            onClick={() => handleExportSpreadsheet()}
            className="px-4 py-2 text-xs font-semibold text-white bg-sky-700 hover:bg-sky-800 rounded-md transition-colors whitespace-nowrap shrink-0"
          >
            {linkedFileName
              ? `Salvar em ${linkedFileName} (${records.length})`
              : `Baixar Planilha PBI .${exportFormat.toUpperCase()} (${
                  records.length
                } linhas)`}
          </button>
        </div>
      </header>

      {/* Navegação responsiva para telas menores */}
      <div className="lg:hidden bg-white border-b border-slate-200 px-4 py-2 flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => handleSwitchTab('dashboard')}
          className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
            activeTab === 'dashboard'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600'
          }`}
        >
          Painel PBI
        </button>
        <button
          onClick={() => handleSwitchTab('fila24h')}
          className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
            activeTab === 'fila24h'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600'
          }`}
        >
          Fila &amp; Treino 24h ({queueCount})
        </button>
        <button
          onClick={() => handleSwitchTab('planilha')}
          className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
            activeTab === 'planilha'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600'
          }`}
        >
          Planilha ({records.length})
        </button>
        <button
          onClick={() => handleSwitchTab('porticos')}
          className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
            activeTab === 'porticos'
              ? 'bg-slate-900 text-white'
              : 'text-slate-600'
          }`}
        >
          Categorias &amp; Pórticos
        </button>
        <button
          onClick={() => handleSwitchTab('dax')}
          className={`px-3 py-1.5 text-xs font-medium rounded whitespace-nowrap shrink-0 ${
            activeTab === 'dax' ? 'bg-slate-900 text-white' : 'text-slate-600'
          }`}
        >
          Guia DAX
        </button>
      </div>

      {/* Barra Operacional do Motor Gerador Automático */}
      <div className="bg-slate-900 text-slate-100 border-b border-slate-800 px-6 py-3">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() =>
                setConfig((prev) => ({ ...prev, isRunning: !prev.isRunning }))
              }
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 ${
                config.isRunning
                  ? 'bg-amber-500 text-slate-950 hover:bg-amber-400'
                  : 'bg-emerald-600 text-white hover:bg-emerald-500'
              }`}
            >
              {config.isRunning
                ? `Pausar Alimentação Automática (${config.intervalSeconds}s)`
                : 'Iniciar Alimentação Automática'}
            </button>

            <div className="flex items-center gap-2 text-xs text-slate-300 font-mono tabular-nums">
              <label
                htmlFor="interval-select"
                className="font-sans text-slate-400"
              >
                A cada:
              </label>
              <select
                id="interval-select"
                value={config.intervalSeconds}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    intervalSeconds: Number(e.target.value),
                  }))
                }
                className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs"
              >
                <option value={1}>1 seg</option>
                <option value={2}>2 seg</option>
                <option value={3}>3 seg</option>
                <option value={5}>5 seg</option>
                <option value={10}>10 seg</option>
                <option value={15}>15 seg</option>
                <option value={30}>30 seg</option>
              </select>

              <label
                htmlFor="batch-select"
                className="font-sans text-slate-400 ml-1"
              >
                Linhas/ciclo:
              </label>
              <select
                id="batch-select"
                value={config.batchSizePerTick}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    batchSizePerTick: Number(e.target.value),
                  }))
                }
                className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs"
              >
                <option value={1}>+1 linha</option>
                <option value={2}>+2 linhas</option>
                <option value={5}>+5 linhas</option>
                <option value={10}>+10 linhas</option>
              </select>
            </div>

            <div className="h-4 w-px bg-slate-700 hidden sm:block" />

            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400 mr-1">
                Adicionar lote:
              </span>
              <button
                onClick={() => {
                  appendNewPassages(10);
                  showToast(
                    '+10 novas passagens adicionadas ao histórico acumulado.'
                  );
                }}
                className="px-2.5 py-1 text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0"
              >
                +10
              </button>
              <button
                onClick={() => {
                  appendNewPassages(100);
                  showToast(
                    '+100 novas passagens adicionadas ao histórico acumulado.'
                  );
                }}
                className="px-2.5 py-1 text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0"
              >
                +100
              </button>
              <button
                onClick={() => {
                  appendNewPassages(500);
                  showToast(
                    '+500 novas passagens adicionadas ao histórico acumulado.'
                  );
                }}
                className="px-2.5 py-1 text-xs font-mono font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0"
              >
                +500
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-xs text-slate-300 font-mono tabular-nums">
              Acumulado: <strong className="text-white">{records.length}</strong>{' '}
              linhas
              {unsavedNewRows > 0 && (
                <span className="text-amber-400 ml-1.5">
                  (+{unsavedNewRows} novas desde último download)
                </span>
              )}
            </div>

            <select
              value={exportFormat}
              onChange={(e) =>
                setExportFormat(e.target.value as 'xlsx' | 'csv')
              }
              aria-label="Formato do arquivo para Power BI"
              className="bg-slate-800 border border-slate-700 text-xs text-white rounded px-2.5 py-1.5 font-medium"
            >
              <option value="xlsx">Formato: Excel (.xlsx)</option>
              <option value="csv">Formato: CSV (; para PBI)</option>
            </select>

            <button
              onClick={handleLinkLocalFile}
              className="px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded transition-colors whitespace-nowrap shrink-0"
            >
              {linkedFileName
                ? `Pasta: ${linkedFileName}`
                : 'Vincular Arquivo PBI na Pasta'}
            </button>

            <button
              onClick={() => setShowGeneratorSettings((v) => !v)}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0"
            >
              {showGeneratorSettings ? 'Ocultar Pesos' : 'Configurar Pesos'}
            </button>
          </div>
        </div>

        {/* Painel Expansível de Configuração de Pesos de Sorteio */}
        {showGeneratorSettings && (
          <div className="max-w-[1440px] mx-auto mt-3 pt-3 border-t border-slate-800 grid grid-cols-1 md:grid-cols-8 gap-3 text-xs">
            <div>
              <label className="block text-slate-400 mb-1">
                Peso Pago ({config.weights.pago}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={config.weights.pago}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    weights: {
                      ...prev.weights,
                      pago: Number(e.target.value),
                    },
                  }))
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Peso Pendente 30d ({config.weights.pendente}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={config.weights.pendente}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    weights: {
                      ...prev.weights,
                      pendente: Number(e.target.value),
                    },
                  }))
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Peso Evasão ({config.weights.evasao}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={config.weights.evasao}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    weights: {
                      ...prev.weights,
                      evasao: Number(e.target.value),
                    },
                  }))
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Peso Pago perdido ({config.weights.pagoPerdido}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={config.weights.pagoPerdido}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    weights: {
                      ...prev.weights,
                      pagoPerdido: Number(e.target.value),
                    },
                  }))
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Peso Isento ({config.weights.isento}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={config.weights.isento}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    weights: {
                      ...prev.weights,
                      isento: Number(e.target.value),
                    },
                  }))
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Fila Aprovação 24h ({config.weights.fila24h}%)
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={config.weights.fila24h}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    weights: {
                      ...prev.weights,
                      fila24h: Number(e.target.value),
                    },
                  }))
                }
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-slate-400 mb-1">
                Máscara da Placa
              </label>
              <select
                value={config.plateMaskMode}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    plateMaskMode: e.target.value as 'mercosul7' | 'mercosul8',
                  }))
                }
                className="w-full bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs font-mono"
              >
                <option value="mercosul7">AAA1A11 (Mercosul 7)</option>
                <option value="mercosul8">AAA1A111 (Modelo 8)</option>
              </select>
            </div>

            <div className="flex items-end justify-end">
              {!confirmReset ? (
                <button
                  onClick={() => setConfirmReset(true)}
                  className="px-3 py-1.5 text-xs font-medium text-red-300 bg-red-950/60 hover:bg-red-900/70 border border-red-800 rounded transition-colors whitespace-nowrap shrink-0"
                >
                  Reiniciar Histórico
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={handleResetDatabase}
                    className="px-2.5 py-1 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded"
                  >
                    Confirmar
                  </button>
                  <button
                    onClick={() => setConfirmReset(false)}
                    className="px-2 py-1 text-xs text-slate-300 bg-slate-800 rounded"
                  >
                    Cancelar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Notificação Toast */}
      {statusToast && (
        <div className="bg-sky-900 text-white px-6 py-2 text-xs font-medium text-center border-b border-sky-800">
          {statusToast}
        </div>
      )}

      {/* Conteúdo Principal */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-6 py-6">
        {activeTab === 'dashboard' && (
          <ExecutiveDashboard
            records={records}
            onNavigateToQueue={() => handleSwitchTab('fila24h')}
            onNavigateToSpreadsheet={() => handleSwitchTab('planilha')}
          />
        )}

        {activeTab === 'fila24h' && (
          <ApprovalQueue24h
            records={records}
            nowMs={nowMs}
            workstationMode={workstationMode}
            onChangeWorkstationMode={(active) => setWorkstationMode(active)}
            onStopValidatingPlates={handleStopValidatingPlates}
            onActiveLockedSeqChange={(seq) => {
              activeLockedSeqRef.current = seq;
            }}
            sessionStats={sessionStats}
            validationAlert={validationAlert}
            onDismissAlert={() => setValidationAlert(null)}
            onStartOrToggleSession={(forceState) =>
              setSessionStats((prev) => ({
                ...prev,
                isActive:
                  forceState !== undefined ? forceState : !prev.isActive,
              }))
            }
            onResetSession={() => {
              setSessionStats({
                isActive: false,
                elapsedSeconds: 0,
                recoveredCount: 0,
                recoveredValue: 0,
                lostCount: 0,
                lostValue: 0,
              });
              setValidationAlert(null);
            }}
            onSubmitWorkstationValidation={handleSubmitWorkstationValidation}
            onApproveRecord={handleApproveRecordFromTable}
            onApproveAllQueue={handleApproveAllQueue}
            onMarkAsLost={handleMarkAsLost}
            onSimulateExpireAllQueue={handleSimulateExpireAllQueue}
            onGenerateCriticalQueueSample={() => {
              appendNewPassages(5, true);
              showToast(
                '+5 passagens críticas (com 2 a 6 minutos restantes) adicionadas na fila e na planilha!'
              );
            }}
            onInspectRecordModal={(rec) => setInspectedRecord(rec)}
          />
        )}

        {activeTab === 'planilha' && (
          <SpreadsheetView
            records={records}
            onChangeRecordStatus={handleChangeRecordStatus}
            onInspectRecordModal={(rec) => setInspectedRecord(rec)}
          />
        )}

        {activeTab === 'porticos' && <PorticosReferenceView />}

        {activeTab === 'dax' && <PowerBiDaxGuide />}
      </main>

      {/* MODAL DE ALERTA NA TELA QUE PAUSA TODOS OS CRONÔMETROS ATÉ CLICAR EM "ENTENDI" */}
      {validationAlert && validationAlert.blockingModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/80 flex items-center justify-center p-4"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="learning-alert-title"
        >
          <div className="bg-white border-2 border-red-300 rounded-lg max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200">
              <span className="px-2.5 py-1 text-xs font-mono font-bold uppercase rounded bg-red-100 text-red-800">
                {validationAlert.type === 'expired_timeout'
                  ? 'PRAZO SLA 24H EXPIRADO — TEMPO PAUSADO'
                  : 'ERRO NA VALIDAÇÃO — TEMPO PAUSADO PARA APRENDIZADO'}
              </span>
              <span className="text-xs font-mono text-slate-500">
                Cronômetros Pausados
              </span>
            </div>

            <div>
              <h3
                id="learning-alert-title"
                className="text-base font-bold text-slate-900"
              >
                {validationAlert.title}
              </h3>
              <p className="text-xs font-mono text-slate-600 mt-1">
                Recibo: <strong>{validationAlert.recibo}</strong> · Valor da
                Passagem Perdida:{' '}
                <strong className="text-red-700">{validationAlert.valor}</strong>
              </p>
            </div>

            <div className="p-4 bg-red-50/70 border border-red-200 rounded-md space-y-2">
              <div className="text-xs font-bold text-red-900 uppercase tracking-wider">
                Diagnóstico do Erro &amp; Gabarito Oficial:
              </div>
              <ul className="text-xs space-y-1.5 font-mono text-slate-800">
                {validationAlert.details.map((line, idx) => (
                  <li key={idx} className="leading-relaxed">
                    • {line}
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-3.5 bg-slate-900 text-white rounded-md flex items-center justify-between text-xs font-mono">
              <span className="text-slate-300">
                Seu Acumulado de Perdas na Sessão:
              </span>
              <span className="text-red-400 font-bold text-sm">
                {validationAlert.accumulatedLostCount} passagem(ns) ·{' '}
                {formatCurrencyBRL(validationAlert.accumulatedLostValue)}
              </span>
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={handleStopValidatingPlates}
                className="px-4 py-2.5 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-md transition-colors cursor-pointer"
              >
                Parar de Validar Placas
              </button>
              <button
                type="button"
                autoFocus
                onClick={() => setValidationAlert(null)}
                className="px-6 py-2.5 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
              >
                Entendi (Retomar Contagem do Tempo)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Inspeção das 3 Fotos ao clicar no ID Recibo */}
      <PassageInspectionModal
        record={inspectedRecord}
        onClose={() => setInspectedRecord(null)}
      />

      {/* Rodapé Corporativo Limpo */}
      <footer className="bg-white border-t border-slate-200 px-6 py-4 mt-8">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <div>
            Caminhos da Celulose CCA · Monitoramento de Recuperação e Cobrança
            Free Flow (BR-262 · BR-267 · MS-040 · MS-338) · Compatível com
            GitHub Pages
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleExportSpreadsheet('xlsx')}
              className="text-sky-700 hover:underline font-medium"
            >
              Baixar Excel (.xlsx)
            </button>
            <span>·</span>
            <button
              onClick={() => handleExportSpreadsheet('csv')}
              className="text-sky-700 hover:underline font-medium"
            >
              Baixar CSV (.csv)
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
