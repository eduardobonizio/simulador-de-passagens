export type EstadoRD = 'Pendente' | 'Pago' | 'Evasao' | 'Pago perdido' | 'Isento';

export type AnomaliaOptica =
  | 'normal'
  | 'fita_isolante'
  | 'sol_forte'
  | 'muito_escura'
  | 'desfoque_velocidade'
  | 'placa_ilegivel_barro'
  | 'lateral_obstruida';

export interface PassageRecord {
  /** Sequencial numérico interno (1, 2, 3...) */
  seq: number;
  /** Coluna 1: ID Recibo (ex: FAKEFF000001) */
  idRecibo: string;
  /** Coluna 2: Mensagem ID (ex: 2609230800016290101) */
  mensagemId: string;
  /** Coluna 3: Data/Hora (ex: 23/09/2026 08:00:01) */
  dataHora: string;
  /** Timestamp em ms da passagem */
  timestampMs: number;
  /** Coluna 4: Praça (01 a 12) */
  praca: string;
  /** Coluna 5: Pista (ex: 08LFF, 08OFF, 01NFF) */
  pista: string;
  /** Coluna 6: Tipo (sempre Free Flow) */
  tipo: 'Free Flow';
  /** Coluna 7: Cat (01 a 09, ou 00 para isento) */
  cat: string;
  /** Quantidade exata de eixos no solo (para CAT 09 que pode ter 7, 8 ou 9 eixos) */
  eixosSoloReais?: number;
  /** Coluna 8: Subcat (00 a 03 — eixos suspensos isentos) */
  subcat: string;
  /** Coluna 9: Placa registrada na planilha (Mercosul AAA1A11 / AAA1A111) */
  placa: string;
  /** Placa física real estampada no veículo */
  placaReal?: string;
  /** Placa lida inicialmente pelo OCR antes da auditoria humana */
  placaLidaOcr?: string;
  /** Anomalia óptica na captura das câmeras do pórtico */
  anomaliaOptica?: AnomaliaOptica;
  /** Em casos de lama, indica se afeta ambas as câmeras ou apenas frontal/traseira */
  lamaAngulo?: 'ambas' | 'frontal' | 'traseira';
  /** Posição do caractere adulterado (ex: fita isolante em posições 0..6) */
  posicaoAdulterada?: number;
  /** Índices dos caracteres onde o OCR cometeu erro de leitura (0..6) */
  posicoesErroOcr?: number[];
  /** Tipo didático de erro de OCR */
  tipoErroOcr?: 'substituicao' | 'segmentacao' | 'desgaste' | 'adulteracao';
  /** Indica se a passagem é fisicamente impossível de validar (deve ser marcada como Ilegível) */
  ehIlegivelReal?: boolean;
  /** Descrição detalhada da condição óptica da foto */
  detalheAnomalia?: string;
  /** Velocidade registrada no pórtico (km/h) */
  velocidadeKmh?: number;
  /** Coluna 10: CPF (sempre em branco conforme especificação) */
  cpf: string;
  /** Coluna 11: Estado RD (Pendente, Pago, Evasao, Pago perdido, Isento) */
  estadoRd: EstadoRD;
  /** Coluna 12: Valor formatado (ex: R$ 13,70) */
  valor: string;
  /** Valor numérico em reais para cálculos exatos de KPIs */
  valorNumerico: number;
  /** Coluna 13: Forma de Pagamento */
  formaPagamento: string;
  /** Coluna 14: Emissor / Grupos isentos */
  emissorGruposIsentos: string;
  /** Coluna 15: Pago (valor pago formatado ou '-') */
  pago: string;
  /** Valor numérico efetivamente pago */
  pagoNumerico: number;
  /** Coluna 16: Local Pagamento */
  localPagamento: string;
  /** Coluna 17: Data do pagamento */
  dataPagamento: string;
  /** Coluna 18: Arrecadador */
  arrecadador: string;
  /** Controle interno da fila de aprovação 24h: aguardando aprovação manual da placa */
  aguardandoAprovacao24h?: boolean;
  /** Prazo limite em ms para aprovar (timestampMs + 24h) */
  expiraAprovacaoMs?: number;
  /** Nível de confiança do OCR na leitura da placa (0 a 100) */
  confiancaOcr?: number;
}

export interface PorticoInfo {
  praca: string; // '01' .. '12'
  codigo: string; // 'PFF-01' .. 'PFF-12'
  nome: string; // 'Pórtico-01' .. 'Pórtico-12'
  rodovia: string; // 'BR-262', 'MS-040', 'MS-338', 'BR-267'
  km: string;
  municipio: string;
  tarifaCat1: number;
  pistaDuplicada?: boolean;
  observacao?: string;
}

export interface CategoriaVeiculoInfo {
  cat: string;
  nomeCurto: string;
  exemploVeiculo: string;
  descricao: string;
  eixosTexto: string;
  eixosCobrados: number;
  rodagem: 'Simples' | 'Dupla' | 'Isento';
  valorDidatico: string;
  fatorTexto: string;
  multiplicador: number;
  isento: boolean;
}

export interface GeneratorConfig {
  isRunning: boolean;
  intervalSeconds: number;
  batchSizePerTick: number;
  plateMaskMode: 'mercosul7' | 'mercosul8';
  /** Distribuição percentual na geração */
  weights: {
    pago: number;
    pendente: number;
    evasao: number;
    pagoPerdido: number;
    isento: number;
    fila24h: number;
  };
}
