import React, { useState } from 'react';

interface DaxMeasure {
  title: string;
  description: string;
  formula: string;
}

const DAX_MEASURES: DaxMeasure[] = [
  {
    title: '1. Total de Passagens',
    description: 'Quantidade total de passagens registradas nos 12 pórticos Free Flow.',
    formula: `Total Passagens = COUNTROWS('Passagens_FreeFlow')`,
  },
  {
    title: '2. Valores Já Pagos pelos Clientes (R$)',
    description: 'Soma dos valores das passagens com Estado RD igual a "Pago".',
    formula: `Valor Pago = 
CALCULATE(
    SUM('Passagens_FreeFlow'[Valor_Num]),
    'Passagens_FreeFlow'[Estado RD] = "Pago"
)`,
  },
  {
    title: '3. Valores Dentro do Prazo de 30 Dias (Pendente)',
    description: 'Passagens aprovadas em 24h que estão aguardando pagamento do cliente dentro da janela de 30 dias.',
    formula: `Valor Pendente 30d = 
CALCULATE(
    SUM('Passagens_FreeFlow'[Valor_Num]),
    'Passagens_FreeFlow'[Estado RD] = "Pendente"
)`,
  },
  {
    title: '4. Percentual de Passagens Perdidas (% Pago perdido)',
    description: 'Percentual de passagens não aprovadas em 24h ou com falha irreversível de leitura da placa.',
    formula: `% Passagens Perdidas = 
DIVIDE(
    CALCULATE(
        COUNTROWS('Passagens_FreeFlow'),
        'Passagens_FreeFlow'[Estado RD] = "Pago perdido"
    ),
    [Total Passagens],
    0
)`,
  },
  {
    title: '5. Receita Perdida em Passagens Não Aprovadas 24h (R$)',
    description: 'Valor total que a concessionária deixou de cobrar por perder o SLA de 24 horas ou erro de leitura.',
    formula: `Receita Perdida 24h = 
CALCULATE(
    SUM('Passagens_FreeFlow'[Valor_Num]),
    'Passagens_FreeFlow'[Estado RD] = "Pago perdido"
)`,
  },
  {
    title: '6. Percentual de Multas Emitidas por Evasão (%)',
    description: 'Proporção de passagens que ultrapassaram os 30 dias sem pagamento e geraram autuação por evasão.',
    formula: `% Multas Evasao = 
DIVIDE(
    CALCULATE(
        COUNTROWS('Passagens_FreeFlow'),
        'Passagens_FreeFlow'[Estado RD] = "Evasao"
    ),
    [Total Passagens],
    0
)`,
  },
  {
    title: '7. Repasse de Multas por Evasão — 95% Concessionária (R$)',
    description: 'Nos casos de multa por evasão, o órgão autuador repassa 95% do valor da passagem para a concessionária.',
    formula: `Repasse Evasao 95% = 
VAR ValorBrutoEvasao = 
    CALCULATE(
        SUM('Passagens_FreeFlow'[Valor_Num]),
        'Passagens_FreeFlow'[Estado RD] = "Evasao"
    )
RETURN
    ValorBrutoEvasao * 0.95`,
  },
  {
    title: '8. Prejuízo em Multas por Evasão — 5% Retido (R$)',
    description: 'Parcela de 5% do valor da passagem em multas de evasão que fica como prejuízo para a concessionária.',
    formula: `Prejuizo Evasao 5% = 
VAR ValorBrutoEvasao = 
    CALCULATE(
        SUM('Passagens_FreeFlow'[Valor_Num]),
        'Passagens_FreeFlow'[Estado RD] = "Evasao"
    )
RETURN
    ValorBrutoEvasao * 0.05`,
  },
  {
    title: '9. Prejuízo Financeiro Total (Perdas 24h + 5% Evasão)',
    description: 'Soma consolidada para o Analista de Recuperação e Cobrança monitorar todas as perdas.',
    formula: `Prejuizo Total CCA = [Receita Perdida 24h] + [Prejuizo Evasao 5%]`,
  },
];

export const PowerBiDaxGuide: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const handleCopy = (formula: string, idx: number) => {
    navigator.clipboard.writeText(formula);
    setCopiedIndex(idx);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Passo a passo de conexão com o Power BI */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <h2 className="text-base font-semibold text-slate-900">
          Como Conectar esta Planilha ao seu Power BI Desktop e Atualizar com 1 Clique
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-xs font-semibold text-slate-900">
              01. Vincular Arquivo ou Pasta Local
            </div>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Na barra de controle acima, clique em <strong>&ldquo;Vincular Arquivo Local (.xlsx / .csv)&rdquo;</strong> para escolher a pasta do seu computador onde o Power BI vai ler a planilha (ou use o botão de download direto).
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-xs font-semibold text-slate-900">
              02. Alimentação Automática Acumulativa
            </div>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              Deixe o <strong>Motor Automático</strong> ativo (a cada X segundos). Ele mantém todas as linhas anteriores desde o <span className="font-mono">FAKEFF000001</span> e só grava/baixa a planilha atualizada quando você clicar no botão de exportação.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-md">
            <div className="text-xs font-semibold text-slate-900">
              03. Transformar Coluna Valor no Power Query
            </div>
            <p className="text-xs text-slate-600 mt-1.5 leading-relaxed">
              No Power BI Desktop, importe a aba <span className="font-mono font-semibold">Passagens_FreeFlow</span> e a aba <span className="font-mono font-semibold">Dim_Porticos_CCA</span>. No Power Query, duplique a coluna <span className="font-mono">Valor</span> como <span className="font-mono">Valor_Num</span> (Tipo Moeda/Decimal) para usar nas medidas DAX abaixo.
            </p>
          </div>
        </div>
      </section>

      {/* Fórmulas DAX prontas para copiar */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="pb-4 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">
            Medidas DAX Prontas para o Relatório de Recuperação e Cobrança (CCA)
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Fórmulas configuradas exatamente com os nomes das colunas e status padronizados (<span className="font-mono">Pago</span>, <span className="font-mono">Pendente</span>, <span className="font-mono">Evasao</span>, <span className="font-mono">Pago perdido</span>, <span className="font-mono">Isento</span>)
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {DAX_MEASURES.map((m, idx) => (
            <div
              key={m.title}
              className="border border-slate-200 rounded-md p-4 flex flex-col justify-between bg-slate-50/50"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold text-slate-900">{m.title}</h4>
                  <button
                    onClick={() => handleCopy(m.formula, idx)}
                    className="px-2.5 py-1 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedIndex === idx ? 'Copiado!' : 'Copiar DAX'}
                  </button>
                </div>
                <p className="text-xs text-slate-600 mt-1">{m.description}</p>
              </div>
              <pre className="mt-3 p-3 bg-slate-900 text-slate-100 rounded text-xs font-mono overflow-x-auto leading-relaxed">
                {m.formula}
              </pre>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
