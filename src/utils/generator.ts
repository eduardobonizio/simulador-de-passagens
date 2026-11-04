import {
  CATEGORIAS_VEICULOS,
  LISTA_VEICULOS_ISENTOS,
  PORTICOS_CCA,
} from '../data/porticos';
import { AnomaliaOptica, EstadoRD, GeneratorConfig, PassageRecord } from '../types/passage';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';

const RECURRING_PLATES_7 = [
  'CCA2A62', 'MSF4B40', 'RBP7C11', 'TRL9D01', 'CGR3E88',
  'BGS5F20', 'NVA8G77', 'SRP1H33', 'AGC6J90', 'ANR2K15',
  'CEL9M99', 'ELD8N44', 'SUZ7P22', 'ARA6Q10', 'MSX5R55',
];

const RECURRING_PLATES_8 = [
  'CCA2A621', 'MSF4B402', 'RBP7C119', 'TRL9D014', 'CGR3E885',
  'BGS5F207', 'NVA8G773', 'SRP1H338', 'AGC6J906', 'ANR2K150',
];

export function formatCurrencyBRL(value: number): string {
  return `R$ ${value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatDateTimeBR(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const d = pad(date.getDate());
  const m = pad(date.getMonth() + 1);
  const y = date.getFullYear();
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${d}/${m}/${y} ${hh}:${mm}:${ss}`;
}

export function generateMensagemId(date: Date, praca: string, seq: number): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  const mmm = pad((date.getMilliseconds() + seq * 37) % 1000, 3);
  const laneNum = (seq % 2) + 1;
  return `${yy}${mm}${dd}${hh}${min}${ss}${mmm}${praca}0${laneNum}`;
}

export function generateMercosulPlate(mode: 'mercosul7' | 'mercosul8' = 'mercosul7'): string {
  if (Math.random() < 0.25) {
    const pool = mode === 'mercosul8' ? RECURRING_PLATES_8 : RECURRING_PLATES_7;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  const l = () => LETTERS[Math.floor(Math.random() * LETTERS.length)];
  const d = () => DIGITS[Math.floor(Math.random() * DIGITS.length)];
  if (mode === 'mercosul8') {
    return `${l()}${l()}${l()}${d()}${l()}${d()}${d()}${d()}`;
  }
  return `${l()}${l()}${l()}${d()}${l()}${d()}${d()}`;
}

const TAPE_ADULTERATIONS: Record<string, string> = {
  F: 'E',
  P: 'B',
  R: 'B',
  C: 'O',
  '1': '7',
  '3': '8',
  '0': '8',
  '6': '8',
  '5': '6',
  '7': 'Z',
  L: 'U',
};

const VISUAL_SUBSTITUTIONS: Record<string, string[]> = {
  // Letras x Dígitos / Letras semelhantes
  A: ['4', 'R'],
  B: ['8', 'R', '3'],
  C: ['0', 'G', 'O'],
  D: ['0', 'O', 'Q'],
  E: ['F', 'B'],
  F: ['E', 'P'],
  G: ['6', 'C', '0'],
  H: ['M', 'N'],
  I: ['1', 'T', 'L'],
  J: ['U', '1'],
  K: ['X', 'R'],
  L: ['1', 'I'],
  M: ['N', 'W'],
  N: ['M', 'H'],
  O: ['0', 'Q', 'D'],
  P: ['R', 'F', '9', 'B'],
  Q: ['0', 'O'],
  R: ['P', 'B', 'K'],
  S: ['5', '8'],
  T: ['1', '7', 'I'],
  U: ['V', '0'],
  V: ['U', 'Y'],
  W: ['M', 'V'],
  X: ['K', 'Y'],
  Y: ['V', 'X'],
  Z: ['2', '7'],
  // Dígitos x Letras / Dígitos semelhantes
  '0': ['O', '8', 'D', 'Q'],
  '1': ['I', '7', 'L', 'T'],
  '2': ['Z', '7'],
  '3': ['8', 'B', '5'],
  '4': ['A', '1'],
  '5': ['S', '6'],
  '6': ['G', '8', '5', '0'],
  '7': ['1', 'T', 'Z'],
  '8': ['B', '3', '0', '6'],
  '9': ['P', '0', '8'],
};

export interface OcrMisreadResult {
  misreadPlate: string;
  errorPositions: number[];
  adulteratedPosition?: number;
  errorType: 'substituicao' | 'segmentacao' | 'desgaste' | 'adulteracao';
}

export function simulateOcrMisreadDetailed(
  truePlate: string,
  anomalia: AnomaliaOptica,
  lamaAngulo?: 'ambas' | 'frontal' | 'traseira'
): OcrMisreadResult {
  if (anomalia === 'normal' || truePlate.length < 7) {
    return {
      misreadPlate: truePlate,
      errorPositions: [],
      errorType: 'substituicao',
    };
  }

  const chars = truePlate.split('');
  const totalLen = chars.length;

  if (anomalia === 'fita_isolante') {
    // Procura posições onde cabe fita isolante realista
    const candidateIndices: number[] = [];
    chars.forEach((c, i) => {
      if (TAPE_ADULTERATIONS[c]) {
        candidateIndices.push(i);
      }
    });

    // Se achou caracteres com fitas naturais (F, P, C, 1, 3, 0, 6, 5, 7, L), sorteia entre eles.
    // Senão, escolhe qualquer posição aleatória entre 0 e totalLen - 1.
    const chosenIdx =
      candidateIndices.length > 0
        ? pickRandom(candidateIndices)
        : Math.floor(Math.random() * totalLen);

    const origChar = chars[chosenIdx];
    const adulterated =
      TAPE_ADULTERATIONS[origChar] ||
      (/[0-9]/.test(origChar) ? '8' : 'B');
    chars[chosenIdx] = adulterated;

    return {
      misreadPlate: chars.join(''),
      errorPositions: [chosenIdx],
      adulteratedPosition: chosenIdx,
      errorType: 'adulteracao',
    };
  }

  // Distribuição realista de erros em qualquer uma das 7 posições (índices 0..6)
  const isAllMud = anomalia === 'placa_ilegivel_barro' && (!lamaAngulo || lamaAngulo === 'ambas');
  const numErrors = isAllMud
    ? Math.min(3, Math.max(2, Math.floor(2 + Math.random() * 2)))
    : Math.random() < 0.45
    ? 2
    : 1;

  const availableIndices = Array.from({ length: totalLen }, (_, i) => i);
  // Embaralhamento Fisher-Yates para escolher posições totalmente aleatórias
  for (let i = availableIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableIndices[i], availableIndices[j]] = [
      availableIndices[j],
      availableIndices[i],
    ];
  }

  const selectedIndices = availableIndices
    .slice(0, numErrors)
    .sort((a, b) => a - b);
  const errorPositions: number[] = [];

  for (const idx of selectedIndices) {
    const orig = chars[idx];
    const subs = VISUAL_SUBSTITUTIONS[orig];
    if (subs && subs.length > 0) {
      chars[idx] = pickRandom(subs);
      errorPositions.push(idx);
    } else {
      const isDigit = /[0-9]/.test(orig);
      chars[idx] = isDigit
        ? pickRandom(['0', '8', '1', '7', '5'])
        : pickRandom(['O', 'B', 'I', 'S', 'Z']);
      errorPositions.push(idx);
    }
  }

  const errorType: 'substituicao' | 'segmentacao' | 'desgaste' =
    Math.random() < 0.6
      ? 'substituicao'
      : Math.random() < 0.5
      ? 'segmentacao'
      : 'desgaste';

  return {
    misreadPlate: chars.join(''),
    errorPositions,
    errorType,
  };
}

export function simulateOcrMisread(
  truePlate: string,
  anomalia: AnomaliaOptica,
  lamaAngulo?: 'ambas' | 'frontal' | 'traseira'
): string {
  return simulateOcrMisreadDetailed(truePlate, anomalia, lamaAngulo).misreadPlate;
}

const FORMAS_PAGAMENTO_TAG = {
  forma: 'TAG Automatico',
  emissores: ['Sem Parar', 'ConectCar', 'Veloe', 'Move Mais', 'Taggy'],
  local: 'Automatico via Operadora (OSA)',
  arrecadadores: ['Itau Unibanco', 'Banco Bradesco', 'Banco Santander'],
};

const FORMAS_PAGAMENTO_AVULSO = [
  {
    forma: 'PIX App CCA',
    emissor: 'Pagamento Avulso Digital',
    locais: ['App Caminhos da Celulose', 'Portal Web Free Flow CCA', 'WhatsApp Oficial CCA'],
    arrecadadores: ['Itau Unibanco', 'Stone Pagamentos', 'Banco do Brasil'],
  },
  {
    forma: 'Cartao de Credito',
    emissor: 'Pagamento Avulso Digital',
    locais: ['App Caminhos da Celulose', 'Portal Web Free Flow CCA', 'Totem AutoAtendimento SAU'],
    arrecadadores: ['Stone Pagamentos', 'Rede / Itau', 'Cielo / Bradesco'],
  },
  {
    forma: 'Cartao de Debito',
    emissor: 'Pagamento Avulso Digital',
    locais: ['Totem AutoAtendimento SAU', 'Rede Credenciada Postos MS'],
    arrecadadores: ['Stone Pagamentos', 'Caixa Economica', 'Banco Santander'],
  },
  {
    forma: 'Boleto / Convenio Frota',
    emissor: 'Frota Corporativa Celulose',
    locais: ['Portal Frotas CCA', 'Faturamento Mensal Consolidado'],
    arrecadadores: ['Itau Unibanco', 'Banco Bradesco'],
  },
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function chooseAnomalia(allowIllegible = true): {
  anomalia: AnomaliaOptica;
  ehIlegivelReal: boolean;
  detalhe: string;
  ocrConfidence: number;
  lamaAngulo?: 'ambas' | 'frontal' | 'traseira';
} {
  const r = Math.random();

  // Casos de lama/barro na placa: ~20% de ocorrência na fila
  if (r < 0.20) {
    const mudRoll = Math.random();
    if (allowIllegible && mudRoll < 0.33) {
      // Ambas com lama -> Realmente Ilegível
      return {
        anomalia: 'placa_ilegivel_barro',
        ehIlegivelReal: true,
        lamaAngulo: 'ambas',
        detalhe:
          'Lama densa cobrindo as placas frontal (CAM-01) e traseira (CAM-02) (Impossível ler em ambos os ângulos — Marque Ilegível)',
        ocrConfidence: Math.floor(25 + Math.random() * 20),
      };
    } else if (mudRoll < 0.66) {
      // Lama só na frontal -> Placa traseira legível!
      return {
        anomalia: 'placa_ilegivel_barro',
        ehIlegivelReal: false,
        lamaAngulo: 'frontal',
        detalhe:
          'Lama cobrindo a placa frontal (CAM-01), mas a placa traseira (CAM-02) está legível — Inspecione o ângulo traseiro e Valide',
        ocrConfidence: Math.floor(45 + Math.random() * 25),
      };
    } else {
      // Lama só na traseira -> Placa frontal legível!
      return {
        anomalia: 'placa_ilegivel_barro',
        ehIlegivelReal: false,
        lamaAngulo: 'traseira',
        detalhe:
          'Lama cobrindo a placa traseira (CAM-02), mas a placa frontal (CAM-01) está legível — Inspecione o ângulo frontal e Valide',
        ocrConfidence: Math.floor(45 + Math.random() * 25),
      };
    }
  }

  // Obstrução na visão dos eixos na CAM-03
  if (allowIllegible && r < 0.30) {
    return {
      anomalia: 'lateral_obstruida',
      ehIlegivelReal: true,
      detalhe:
        'Obstrução física na visão dos eixos da Câmera 03 Lateral (Impossível aferir quantidade de eixos — Deve ser marcada como Ilegível)',
      ocrConfidence: Math.floor(55 + Math.random() * 20),
    };
  }

  // Fita isolante com adulteração distribuída em qualquer posição
  if (r < 0.52) {
    return {
      anomalia: 'fita_isolante',
      ehIlegivelReal: false,
      detalhe:
        'Suspeita de adulteração com fita isolante em caractere da placa (Ative o Filtro Infravermelho + Contraste para revelar)',
      ocrConfidence: Math.floor(42 + Math.random() * 25),
    };
  }

  // Sol forte
  if (r < 0.72) {
    return {
      anomalia: 'sol_forte',
      ehIlegivelReal: false,
      detalhe:
        'Estouro de luz solar direta na placa (Reduza o Brilho e aumente o Contraste para ler)',
      ocrConfidence: Math.floor(48 + Math.random() * 26),
    };
  }

  // Passagem noturna escura
  if (r < 0.87) {
    return {
      anomalia: 'muito_escura',
      ehIlegivelReal: false,
      detalhe:
        'Passagem noturna muito escura (Aumente o Brilho/Exposição ou ative o Infravermelho)',
      ocrConfidence: Math.floor(38 + Math.random() * 28),
    };
  }

  // Desfoque óptico
  return {
    anomalia: 'desfoque_velocidade',
    ehIlegivelReal: false,
    detalhe:
      'Desfoque óptico de movimento (Aumente o slider de Nitidez e o Zoom na Placa)',
    ocrConfidence: Math.floor(52 + Math.random() * 26),
  };
}

function chooseEstadoRd(weights: GeneratorConfig['weights']): {
  estadoRd: EstadoRD;
  aguardandoAprovacao24h: boolean;
} {
  const total =
    weights.pago +
    weights.pendente +
    weights.evasao +
    weights.pagoPerdido +
    weights.isento +
    weights.fila24h;
  const r = Math.random() * (total || 100);

  let acc = weights.pago;
  if (r < acc) return { estadoRd: 'Pago', aguardandoAprovacao24h: false };

  acc += weights.pendente;
  if (r < acc) return { estadoRd: 'Pendente', aguardandoAprovacao24h: false };

  acc += weights.evasao;
  if (r < acc) return { estadoRd: 'Evasao', aguardandoAprovacao24h: false };

  acc += weights.pagoPerdido;
  if (r < acc) return { estadoRd: 'Pago perdido', aguardandoAprovacao24h: false };

  acc += weights.isento;
  if (r < acc) return { estadoRd: 'Isento', aguardandoAprovacao24h: false };

  return { estadoRd: 'Pendente', aguardandoAprovacao24h: true };
}

export interface GenerateOptions {
  customDate?: Date;
  forceNearExpirationMinutes?: number;
  forceAnomalia?: AnomaliaOptica;
  forceLamaAngulo?: 'ambas' | 'frontal' | 'traseira';
}

/**
 * Calcula o valor exato da tarifa considerando:
 * - Cat: Categoria original do veículo (total de eixos físicos do veículo + tipo de rodagem)
 * - Subcat: Quantidade de eixos erguidos ("00", "01", "02", "03"), que são descontados na cobrança!
 * - Rodagem Simples: 0,5x a tarifa base CAT 1 por eixo no solo
 * - Rodagem Dupla: 1,0x a tarifa base CAT 1 por eixo no solo
 */
export function calculateTariffValue(
  tarifaCat1: number,
  catCode: string,
  subcatCode = '00',
  totalAxlesCat9?: number
): number {
  const catInfo =
    CATEGORIAS_VEICULOS.find((c) => c.cat === catCode) || CATEGORIAS_VEICULOS[0];
  if (catInfo.isento || catCode === '00') return 0;

  const totalPhysicalAxles =
    catCode === '09'
      ? totalAxlesCat9 && totalAxlesCat9 >= 7
        ? totalAxlesCat9
        : 7
      : catInfo.eixosCobrados;

  const liftedAxles = Math.min(
    Math.max(0, totalPhysicalAxles - 2),
    Math.max(0, Number(subcatCode) || 0)
  );
  const groundAxles = Math.max(2, totalPhysicalAxles - liftedAxles);

  const factorPerAxle = catInfo.rodagem === 'Simples' ? 0.5 : 1.0;
  return Number((tarifaCat1 * groundAxles * factorPerAxle).toFixed(2));
}

export function generateSinglePassage(
  seq: number,
  config: GeneratorConfig,
  options?: GenerateOptions
): PassageRecord {
  const idRecibo = `FAKEFF${String(seq).padStart(6, '0')}`;
  const portico = pickRandom(PORTICOS_CCA);
  const sentido = Math.random() < 0.5 ? 'LFF' : 'OFF';
  const pista = `${portico.praca}${sentido}`;

  const { estadoRd, aguardandoAprovacao24h } = chooseEstadoRd(config.weights);

  const now = new Date();
  let passageDate: Date;

  if (options?.customDate) {
    passageDate = options.customDate;
  } else if (options?.forceNearExpirationMinutes !== undefined) {
    const remainingMs = options.forceNearExpirationMinutes * 60 * 1000;
    passageDate = new Date(now.getTime() - (24 * 3600 * 1000 - remainingMs));
  } else if (aguardandoAprovacao24h) {
    if (Math.random() < 0.45) {
      // Mínimo de 1.8 minutos restantes para dar tempo de pensar ao entrar na estação
      const remainingMinutes = 1.8 + Math.random() * 22;
      passageDate = new Date(
        now.getTime() - (24 * 3600 * 1000 - remainingMinutes * 60 * 1000)
      );
    } else {
      const hoursAgo = Math.random() * 22 + 0.5;
      passageDate = new Date(now.getTime() - hoursAgo * 3600 * 1000);
    }
  } else if (estadoRd === 'Pendente') {
    const daysAgo = Math.random() * 27 + 0.5;
    passageDate = new Date(now.getTime() - daysAgo * 86400 * 1000);
  } else if (estadoRd === 'Evasao') {
    const daysAgo = 31 + Math.random() * 44;
    passageDate = new Date(now.getTime() - daysAgo * 86400 * 1000);
  } else {
    const daysAgo = Math.random() * 45;
    passageDate = new Date(now.getTime() - daysAgo * 86400 * 1000);
  }

  // Distribuir todas as categorias CAT 01 a CAT 09 (Simples: CAT 1, 3, 5 | Dupla: CAT 2, 4, 6, 7, 8, 9)
  let catInfo = CATEGORIAS_VEICULOS[0];
  if (estadoRd === 'Isento') {
    catInfo = CATEGORIAS_VEICULOS.find((c) => c.cat === '00')!;
  } else {
    const weightedCats = [
      '01', '01', '01', '02', '03', '04', '05', '06', '07', '07', '08', '09',
    ];
    const pickedCatCode = pickRandom(weightedCats);
    catInfo =
      CATEGORIAS_VEICULOS.find((c) => c.cat === pickedCatCode) ||
      CATEGORIAS_VEICULOS[0];
  }

  // Total de eixos físicos da categoria original (para CAT 09 pode ser 7, 8 ou 9 eixos físicos totais)
  const totalPhysicalAxles =
    catInfo.cat === '09'
      ? pickRandom([7, 8, 9])
      : catInfo.eixosCobrados;

  // Subcat (eixos erguidos/suspensos): caminhões/carretas de rodagem dupla (CAT 4, 6, 7, 8, 9) podem ter eixos erguidos,
  // respeitando que ao menos 2 eixos permanecem no solo.
  const maxPossibleSuspended =
    catInfo.rodagem === 'Dupla' && Number(catInfo.cat) >= 4
      ? Math.min(3, Math.max(0, totalPhysicalAxles - 2))
      : 0;

  let subcat = '00';
  if (maxPossibleSuspended === 1) {
    subcat = pickRandom(['00', '00', '01']);
  } else if (maxPossibleSuspended === 2) {
    subcat = pickRandom(['00', '00', '01', '01', '02']);
  } else if (maxPossibleSuspended >= 3) {
    subcat = pickRandom(['00', '00', '01', '01', '02', '03']);
  }

  // Valor numérico na planilha desconta os eixos erguidos (Subcat) da categoria original (Cat)
  const valorNumerico =
    estadoRd === 'Isento'
      ? 0
      : calculateTariffValue(
          portico.tarifaCat1,
          catInfo.cat,
          subcat,
          totalPhysicalAxles
        );
  const valor = formatCurrencyBRL(valorNumerico);

  const placaReal = generateMercosulPlate(config.plateMaskMode);
  let anomaliaOptica: AnomaliaOptica = 'normal';
  let ehIlegivelReal = false;
  let detalheAnomalia = 'Captura limpa em condições normais de iluminação';
  let confiancaOcr = 98;
  let placaLidaOcr = placaReal;
  let lamaAngulo: 'ambas' | 'frontal' | 'traseira' | undefined;
  let posicaoAdulterada: number | undefined;
  let posicoesErroOcr: number[] | undefined;
  let tipoErroOcr: 'substituicao' | 'segmentacao' | 'desgaste' | 'adulteracao' | undefined;

  if (options?.forceAnomalia) {
    anomaliaOptica = options.forceAnomalia;
    lamaAngulo = options.forceLamaAngulo;
    if (anomaliaOptica === 'placa_ilegivel_barro') {
      if (!lamaAngulo) {
        lamaAngulo = pickRandom(['ambas', 'frontal', 'traseira']);
      }
      ehIlegivelReal = lamaAngulo === 'ambas';
      detalheAnomalia =
        lamaAngulo === 'ambas'
          ? 'Lama densa cobrindo as placas frontal (CAM-01) e traseira (CAM-02) (Impossível ler em ambos os ângulos — Marque Ilegível)'
          : lamaAngulo === 'frontal'
          ? 'Lama cobrindo a placa frontal (CAM-01), mas a placa traseira (CAM-02) está legível — Inspecione o ângulo traseiro e Valide'
          : 'Lama cobrindo a placa traseira (CAM-02), mas a placa frontal (CAM-01) está legível — Inspecione o ângulo frontal e Valide';
      confiancaOcr = ehIlegivelReal ? 35 : 55;
    } else if (anomaliaOptica === 'lateral_obstruida') {
      ehIlegivelReal = true;
      detalheAnomalia =
        'Obstrução física na Câmera 03 Lateral impedindo aferir os eixos (Impossível validar categoria — Deve ser marcada como Ilegível)';
      confiancaOcr = 54;
    } else {
      ehIlegivelReal = false;
      detalheAnomalia = 'Condição óptica adversa na pista';
      confiancaOcr = 54;
    }
    const misreadRes = simulateOcrMisreadDetailed(placaReal, anomaliaOptica, lamaAngulo);
    placaLidaOcr = misreadRes.misreadPlate;
    posicaoAdulterada = misreadRes.adulteratedPosition;
    posicoesErroOcr = misreadRes.errorPositions;
    tipoErroOcr = misreadRes.errorType;
  } else if (aguardandoAprovacao24h || estadoRd === 'Pago perdido') {
    const chosen = chooseAnomalia(true);
    anomaliaOptica = chosen.anomalia;
    ehIlegivelReal = chosen.ehIlegivelReal;
    detalheAnomalia = chosen.detalhe;
    confiancaOcr = chosen.ocrConfidence;
    lamaAngulo = chosen.lamaAngulo;
    const misreadRes = simulateOcrMisreadDetailed(placaReal, anomaliaOptica, lamaAngulo);
    placaLidaOcr = misreadRes.misreadPlate;
    posicaoAdulterada = misreadRes.adulteratedPosition;
    posicoesErroOcr = misreadRes.errorPositions;
    tipoErroOcr = misreadRes.errorType;
  } else if (Math.random() < 0.2) {
    const chosen = chooseAnomalia(false);
    anomaliaOptica = chosen.anomalia;
    ehIlegivelReal = false;
    detalheAnomalia = chosen.detalhe;
    confiancaOcr = 86;
    lamaAngulo = chosen.lamaAngulo;
    const misreadRes = simulateOcrMisreadDetailed(placaReal, anomaliaOptica, lamaAngulo);
    placaLidaOcr = misreadRes.misreadPlate;
    posicaoAdulterada = misreadRes.adulteratedPosition;
    posicoesErroOcr = misreadRes.errorPositions;
    tipoErroOcr = misreadRes.errorType;
  }

  const placa = aguardandoAprovacao24h ? placaLidaOcr : placaReal;
  const mensagemId = generateMensagemId(passageDate, portico.praca, seq);
  const dataHora = formatDateTimeBR(passageDate);

  let formaPagamento = '-';
  let emissorGruposIsentos = '-';
  let pago = '-';
  let pagoNumerico = 0;
  let localPagamento = '-';
  let dataPagamento = '-';
  let arrecadador = '-';

  if (estadoRd === 'Pago') {
    pagoNumerico = valorNumerico;
    pago = formatCurrencyBRL(pagoNumerico);

    if (Math.random() < 0.55) {
      formaPagamento = FORMAS_PAGAMENTO_TAG.forma;
      emissorGruposIsentos = pickRandom(FORMAS_PAGAMENTO_TAG.emissores);
      localPagamento = FORMAS_PAGAMENTO_TAG.local;
      arrecadador = pickRandom(FORMAS_PAGAMENTO_TAG.arrecadadores);
      const payDate = new Date(
        passageDate.getTime() + (Math.random() * 6 + 0.1) * 3600 * 1000
      );
      dataPagamento = formatDateTimeBR(payDate);
    } else {
      const avulso = pickRandom(FORMAS_PAGAMENTO_AVULSO);
      formaPagamento = avulso.forma;
      emissorGruposIsentos = avulso.emissor;
      localPagamento = pickRandom(avulso.locais);
      arrecadador = pickRandom(avulso.arrecadadores);
      const maxDelayMs = Math.min(
        28 * 86400 * 1000,
        Math.max(3600 * 1000, now.getTime() - passageDate.getTime())
      );
      const payDate = new Date(passageDate.getTime() + Math.random() * maxDelayMs);
      dataPagamento = formatDateTimeBR(payDate);
    }
  } else if (estadoRd === 'Isento') {
    const isentoItem = pickRandom(LISTA_VEICULOS_ISENTOS);
    emissorGruposIsentos = `${isentoItem.tipo} (Isento)`;
  }

  return {
    seq,
    idRecibo,
    mensagemId,
    dataHora,
    timestampMs: passageDate.getTime(),
    praca: portico.praca,
    pista,
    tipo: 'Free Flow',
    cat: catInfo.cat,
    eixosSoloReais: totalPhysicalAxles,
    subcat,
    placa,
    placaReal,
    placaLidaOcr,
    anomaliaOptica,
    lamaAngulo,
    posicaoAdulterada,
    posicoesErroOcr,
    tipoErroOcr,
    ehIlegivelReal,
    detalheAnomalia,
    velocidadeKmh: Math.floor(68 + Math.random() * 38),
    cpf: '',
    estadoRd,
    valor,
    valorNumerico,
    formaPagamento,
    emissorGruposIsentos,
    pago,
    pagoNumerico,
    localPagamento,
    dataPagamento,
    arrecadador,
    aguardandoAprovacao24h,
    expiraAprovacaoMs: aguardandoAprovacao24h
      ? passageDate.getTime() + 24 * 3600 * 1000
      : undefined,
    confiancaOcr,
  };
}

/**
 * Cria a linha #1 idêntica ao exemplo anexo pelo usuário + registros iniciais + passagens variadas na fila 24h
 */
export function createInitialSeedRecords(
  count: number,
  config: GeneratorConfig
): PassageRecord[] {
  const firstRow: PassageRecord = {
    seq: 1,
    idRecibo: 'FAKEFF000001',
    mensagemId: '2609230800016290101',
    dataHora: '23/09/2026 08:00:01',
    timestampMs: new Date(2026, 8, 23, 8, 0, 1).getTime(),
    praca: '01',
    pista: '01NFF',
    tipo: 'Free Flow',
    cat: '07',
    eixosSoloReais: 5,
    subcat: '00',
    placa: 'FAK0001',
    placaReal: 'FAK3A01',
    placaLidaOcr: 'FAK0001',
    anomaliaOptica: 'fita_isolante',
    posicaoAdulterada: 3,
    posicoesErroOcr: [3],
    tipoErroOcr: 'adulteracao',
    ehIlegivelReal: false,
    detalheAnomalia:
      'Placa adulterada com fita isolante e não aprovada dentro das 24 horas',
    velocidadeKmh: 84,
    cpf: '',
    estadoRd: 'Pago perdido',
    valor: 'R$ 105,00',
    valorNumerico: 105.0,
    formaPagamento: '-',
    emissorGruposIsentos: '-',
    pago: '-',
    pagoNumerico: 0,
    localPagamento: '-',
    dataPagamento: '-',
    arrecadador: '-',
    aguardandoAprovacao24h: false,
    confiancaOcr: 48,
  };

  const records: PassageRecord[] = [firstRow];

  const regularLimit = Math.max(2, count - 7);
  for (let i = 2; i <= regularLimit; i++) {
    records.push(generateSinglePassage(i, config));
  }

  // Garantir passagens diversificadas na fila 24h (incluindo lama em 1 ângulo vs ambos os ângulos)
  const queueSeeds: {
    mins: number;
    anomalia: AnomaliaOptica;
    lamaAngulo?: 'ambas' | 'frontal' | 'traseira';
  }[] = [
    { mins: 3.5, anomalia: 'fita_isolante' },
    { mins: 6.0, anomalia: 'sol_forte' },
    { mins: 8.5, anomalia: 'placa_ilegivel_barro', lamaAngulo: 'frontal' }, // Lama apenas na CAM-01 frontal (CAM-02 legível!)
    { mins: 12.0, anomalia: 'placa_ilegivel_barro', lamaAngulo: 'ambas' },  // Ambas com lama (Realmente Ilegível!)
    { mins: 16.0, anomalia: 'muito_escura' },
    { mins: 32.0, anomalia: 'lateral_obstruida' },
    { mins: 95.0, anomalia: 'desfoque_velocidade' },
  ];

  const queueConfig: GeneratorConfig = {
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

  queueSeeds.forEach((seed, idx) => {
    const seq = regularLimit + 1 + idx;
    if (seq <= count) {
      records.push(
        generateSinglePassage(seq, queueConfig, {
          forceNearExpirationMinutes: seed.mins,
          forceAnomalia: seed.anomalia,
          forceLamaAngulo: seed.lamaAngulo,
        })
      );
    }
  });

  return records;
}
