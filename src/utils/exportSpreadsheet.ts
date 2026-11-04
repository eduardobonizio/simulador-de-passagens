import * as XLSX from 'xlsx';
import { PORTICOS_CCA } from '../data/porticos';
import { PassageRecord } from '../types/passage';

export const SPREADSHEET_HEADERS = [
  'ID Recibo',
  'Mensagem ID',
  'Data/Hora',
  'Praça',
  'Pista',
  'Tipo',
  'Cat',
  'Subcat',
  'Placa',
  'CPF',
  'Estado RD',
  'Valor',
  'Forma de Pagamento',
  'Emissor / Grupos isentos',
  'Pago',
  'Local Pagamento',
  'Data do pagamento',
  'Arrecadador',
] as const;

export function mapRecordToSpreadsheetRow(r: PassageRecord): Record<string, string> {
  return {
    'ID Recibo': r.idRecibo,
    'Mensagem ID': r.mensagemId,
    'Data/Hora': r.dataHora,
    'Praça': r.praca,
    'Pista': r.pista,
    'Tipo': r.tipo,
    'Cat': r.cat,
    'Subcat': r.subcat,
    'Placa': r.placa,
    'CPF': r.cpf,
    'Estado RD': r.estadoRd,
    'Valor': r.valor,
    'Forma de Pagamento': r.formaPagamento,
    'Emissor / Grupos isentos': r.emissorGruposIsentos,
    'Pago': r.pago,
    'Local Pagamento': r.localPagamento,
    'Data do pagamento': r.dataPagamento,
    'Arrecadador': r.arrecadador,
  };
}

export function generateWorkbookBuffer(records: PassageRecord[], includeAuxiliarySheets = true): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  // Aba 1: Base principal idêntica ao modelo do fornecedor (18 colunas)
  const mainRows = records.map(mapRecordToSpreadsheetRow);
  const wsMain = XLSX.utils.json_to_sheet(mainRows, {
    header: [...SPREADSHEET_HEADERS],
  });

  wsMain['!cols'] = [
    { wch: 15 }, // ID Recibo
    { wch: 22 }, // Mensagem ID
    { wch: 20 }, // Data/Hora
    { wch: 8 },  // Praça
    { wch: 10 }, // Pista
    { wch: 12 }, // Tipo
    { wch: 6 },  // Cat
    { wch: 8 },  // Subcat
    { wch: 12 }, // Placa
    { wch: 14 }, // CPF
    { wch: 15 }, // Estado RD
    { wch: 13 }, // Valor
    { wch: 22 }, // Forma de Pagamento
    { wch: 26 }, // Emissor / Grupos isentos
    { wch: 13 }, // Pago
    { wch: 28 }, // Local Pagamento
    { wch: 20 }, // Data do pagamento
    { wch: 20 }, // Arrecadador
  ];

  XLSX.utils.book_append_sheet(wb, wsMain, 'Passagens_FreeFlow');

  if (includeAuxiliarySheets) {
    // Aba 2: Dimensão de Pórticos (dPorticos) pronta para relacionamento no Power BI pela coluna 'Praça'
    const porticosRows = PORTICOS_CCA.map((p) => ({
      'Praça': p.praca,
      'Código Pórtico': p.codigo,
      'Nome Pórtico': p.nome,
      'Rodovia': p.rodovia,
      'Quilometragem': p.km,
      'Município de Referência': p.municipio,
      'Tarifa Base Cat 1 (R$)': p.tarifaCat1,
      'Pista Duplicada': p.pistaDuplicada ? 'Sim (Leste/Oeste)' : 'Não',
      'Observação': p.observacao || '-',
    }));
    const wsPorticos = XLSX.utils.json_to_sheet(porticosRows);
    wsPorticos['!cols'] = [
      { wch: 8 },
      { wch: 14 },
      { wch: 15 },
      { wch: 12 },
      { wch: 15 },
      { wch: 26 },
      { wch: 20 },
      { wch: 18 },
      { wch: 52 },
    ];
    XLSX.utils.book_append_sheet(wb, wsPorticos, 'Dim_Porticos_CCA');
  }

  return XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
}

export function generateCsvContent(records: PassageRecord[], delimiter: ';' | ',' = ';'): string {
  const escapeCell = (val: string) => {
    if (val.includes(delimiter) || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };

  const headerLine = SPREADSHEET_HEADERS.map(escapeCell).join(delimiter);
  const lines = records.map((r) => {
    const rowObj = mapRecordToSpreadsheetRow(r);
    return SPREADSHEET_HEADERS.map((col) => escapeCell(rowObj[col] ?? '')).join(delimiter);
  });

  // Incluir UTF-8 BOM para Excel e Power BI reconhecerem acentuação automaticamente
  return '\uFEFF' + [headerLine, ...lines].join('\r\n');
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
