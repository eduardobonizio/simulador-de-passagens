import React, { useState } from 'react';
import {
  CATEGORIAS_VEICULOS,
  LISTA_VEICULOS_ISENTOS,
  PORTICOS_CCA,
} from '../data/porticos';
import { calculateTariffValue, formatCurrencyBRL } from '../utils/generator';

export const PorticosReferenceView: React.FC = () => {
  const [selectedCat, setSelectedCat] = useState<string>('01');
  const [cat9Axles, setCat9Axles] = useState<number>(9);
  const [eixosSuspensos, setEixosSuspensos] = useState<number>(0);

  const activeCategory =
    CATEGORIAS_VEICULOS.find((c) => c.cat === selectedCat) || CATEGORIAS_VEICULOS[0];

  return (
    <div className="space-y-6">
      {/* Seção 1: Guia Didático Oficial de Treinamento de Categorias (Tarifa-Base Fictícia R$ 10,00) */}
      <section className="bg-white border border-slate-200 rounded-lg p-5 space-y-5">
        <div className="pb-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">
            Guia Didático de Treinamento de Operadores — Classificação de Categorias (CAT 1 a CAT 9 e Isentos)
          </h2>
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mt-2">
            <strong>Importante:</strong> Os valores de R$ 10,00 na tabela abaixo são didáticos para facilitar o treinamento dos operadores. Na operação real do Free Flow da Rota da Celulose, a tarifa é calculada multiplicando o <strong>Fator da Categoria</strong> pela tarifa-base de cada pórtico (exibida mais abaixo).
          </p>
        </div>

        {/* Tabela Principal de Treinamento (CAT 1 a CAT 9) */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600 bg-slate-50">
                <th className="py-2.5 px-3">Categoria</th>
                <th className="py-2.5 px-3">Exemplo de Veículo</th>
                <th className="py-2.5 px-3 text-center">Eixos no Solo</th>
                <th className="py-2.5 px-3 text-center">Rodagem</th>
                <th className="py-2.5 px-3 text-right">Valor Didático (Base R$ 10)</th>
                <th className="py-2.5 px-3 text-right">Fator Multiplicador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {CATEGORIAS_VEICULOS.filter((c) => !c.isento).map((cat) => (
                <tr key={cat.cat} className="hover:bg-slate-50">
                  <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                    {cat.nomeCurto} (Cód. {cat.cat})
                  </td>
                  <td className="py-2.5 px-3 text-slate-800 font-medium">
                    {cat.exemploVeiculo}
                  </td>
                  <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-900">
                    {cat.eixosTexto}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={`font-semibold ${
                        cat.rodagem === 'Simples'
                          ? 'text-sky-700'
                          : 'text-amber-800'
                      }`}
                    >
                      {cat.rodagem}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums text-slate-800">
                    {cat.valorDidatico}
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-emerald-700">
                    {cat.fatorTexto}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bloco Triplo: Rodagem Simples vs Rodagem Dupla vs Macete Rápido */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 pt-2">
          {/* Coluna 1: Veículos de Rodagem Simples */}
          <div className="border border-slate-200 rounded-md p-4 bg-slate-50/50 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-sky-900 uppercase tracking-wider">
                Veículos de Rodagem Simples (◯)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Regra didática: <strong>Cada eixo simples ≈ R$ 5,00</strong> (0,5x da tarifa CAT 1 por eixo)
              </p>
            </div>
            <table className="w-full text-left text-xs font-mono tabular-nums border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-sans">
                  <th className="py-1.5">Categoria</th>
                  <th className="py-1.5 text-right">Valor</th>
                  <th className="py-1.5 text-center">Eixos</th>
                  <th className="py-1.5 text-right">Custo/Eixo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                <tr>
                  <td className="py-1.5 font-bold text-slate-900">CAT 1</td>
                  <td className="py-1.5 text-right">R$ 10,00</td>
                  <td className="py-1.5 text-center">2</td>
                  <td className="py-1.5 text-right text-sky-700">R$ 5,00</td>
                </tr>
                <tr>
                  <td className="py-1.5 font-bold text-slate-900">CAT 3</td>
                  <td className="py-1.5 text-right">R$ 15,00</td>
                  <td className="py-1.5 text-center">3</td>
                  <td className="py-1.5 text-right text-sky-700">R$ 5,00</td>
                </tr>
                <tr>
                  <td className="py-1.5 font-bold text-slate-900">CAT 5</td>
                  <td className="py-1.5 text-right">R$ 20,00</td>
                  <td className="py-1.5 text-center">4</td>
                  <td className="py-1.5 text-right text-sky-700">R$ 5,00</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Coluna 2: Veículos de Rodagem Dupla */}
          <div className="border border-slate-200 rounded-md p-4 bg-slate-50/50 space-y-3">
            <div>
              <h3 className="text-xs font-bold text-amber-900 uppercase tracking-wider">
                Veículos de Rodagem Dupla (◎)
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Regra didática: <strong>Cada eixo com rodagem dupla ≈ R$ 10,00</strong> (1,0x da tarifa CAT 1 por eixo)
              </p>
            </div>
            <table className="w-full text-left text-xs font-mono tabular-nums border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-sans">
                  <th className="py-1">Categoria</th>
                  <th className="py-1 text-right">Valor</th>
                  <th className="py-1 text-center">Eixos</th>
                  <th className="py-1 text-right">Custo/Eixo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60">
                <tr>
                  <td className="py-1 font-bold text-slate-900">CAT 2</td>
                  <td className="py-1 text-right">R$ 20,00</td>
                  <td className="py-1 text-center">2</td>
                  <td className="py-1 text-right text-amber-800">R$ 10,00</td>
                </tr>
                <tr>
                  <td className="py-1 font-bold text-slate-900">CAT 4</td>
                  <td className="py-1 text-right">R$ 30,00</td>
                  <td className="py-1 text-center">3</td>
                  <td className="py-1 text-right text-amber-800">R$ 10,00</td>
                </tr>
                <tr>
                  <td className="py-1 font-bold text-slate-900">CAT 6</td>
                  <td className="py-1 text-right">R$ 40,00</td>
                  <td className="py-1 text-center">4</td>
                  <td className="py-1 text-right text-amber-800">R$ 10,00</td>
                </tr>
                <tr>
                  <td className="py-1 font-bold text-slate-900">CAT 7</td>
                  <td className="py-1 text-right">R$ 50,00</td>
                  <td className="py-1 text-center">5</td>
                  <td className="py-1 text-right text-amber-800">R$ 10,00</td>
                </tr>
                <tr>
                  <td className="py-1 font-bold text-slate-900">CAT 8</td>
                  <td className="py-1 text-right">R$ 60,00</td>
                  <td className="py-1 text-center">6</td>
                  <td className="py-1 text-right text-amber-800">R$ 10,00</td>
                </tr>
                <tr>
                  <td className="py-1 font-bold text-slate-900">CAT 9</td>
                  <td className="py-1 text-right">R$ 70 a R$ 90</td>
                  <td className="py-1 text-center">7+</td>
                  <td className="py-1 text-right text-amber-800">R$ 10,00</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Coluna 3: Macete Rápido para Treinamento */}
          <div className="border border-slate-800 rounded-md p-4 bg-slate-900 text-slate-100 flex flex-col justify-between">
            <div>
              <h3 className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                Macete Rápido para Treinamento (Bater o Olho na CAM-03)
              </h3>
              <pre className="mt-3 text-xs font-mono leading-relaxed text-slate-200">
{`CAT 1 → 2 eixos simples (Corolla/Hilux)
CAT 2 → 2 eixos dupla   (Atego/Ônibus)

CAT 3 → 3 eixos simples (Hilux + carretinha)
CAT 4 → 3 eixos dupla   (Caminhão trucado)

CAT 5 → 4 eixos simples (S10 + trailer 2 eixos)
CAT 6 → 4 eixos dupla   (Caminhão rígido 4 eixos)

CAT 7 → 5 eixos dupla   (Carreta simples)
CAT 8 → 6 eixos dupla   (Carreta LS)
CAT 9 → 7+ eixos dupla  (Bitrem/Rodotrem)`}
              </pre>
            </div>
            <div className="text-[11px] text-slate-400 pt-2 border-t border-slate-800">
              Eixos suspensos (Subcat) não tocam o solo e são isentos de cobrança.
            </div>
          </div>
        </div>

        {/* Exemplos Rápidos + Lista de 10 Tipos de Veículos Isentos */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
          <div className="border border-slate-200 rounded-md p-4">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Exemplos Rápidos de Fixação (Base Didática R$ 10,00)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="font-bold text-slate-900">Corolla / Hilux</div>
                <div className="font-mono text-slate-600 mt-0.5">
                  CAT 1 · 2 eixos simples → <strong>R$ 10,00</strong>
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="font-bold text-slate-900">Hilux + carretinha</div>
                <div className="font-mono text-slate-600 mt-0.5">
                  CAT 3 · 3 eixos simples → <strong>R$ 15,00</strong>
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="font-bold text-slate-900">Caminhão trucado</div>
                <div className="font-mono text-slate-600 mt-0.5">
                  CAT 4 · 3 eixos dupla → <strong>R$ 30,00</strong>
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                <div className="font-bold text-slate-900">Carreta 5 eixos</div>
                <div className="font-mono text-slate-600 mt-0.5">
                  CAT 7 · 5 eixos dupla → <strong>R$ 50,00</strong>
                </div>
              </div>
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded sm:col-span-2">
                <div className="font-bold text-slate-900">Rodotrem 9 eixos</div>
                <div className="font-mono text-slate-600 mt-0.5">
                  CAT 9 · 9 eixos dupla → 9 × R$ 10,00 = <strong>R$ 90,00</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="border border-slate-200 rounded-md p-4">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Tabela Oficial de Veículos Isentos (Valor R$ 0,00)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {LISTA_VEICULOS_ISENTOS.map((item) => (
                <div
                  key={item.tipo}
                  className="flex items-center justify-between py-1 border-b border-slate-100"
                >
                  <span className="text-slate-700">{item.tipo}</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {item.valor}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Seção 2: Matriz Tarifária Real dos 12 Pórticos Free Flow (PFF-01 a PFF-12) */}
      <section className="bg-white border border-slate-200 rounded-lg p-5">
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Tabela Oficial dos 12 Pórticos Free Flow &amp; Simulador de Tarifas Reais (CAT 1 a CAT 9)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Aplica o fator oficial de cada categoria (1,0x, 1,5x, 2,0x, 3,0x a 9,0x) sobre a tarifa real de cada pórtico da concessão
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Simular Categoria (Cat)
              </label>
              <select
                value={selectedCat}
                onChange={(e) => setSelectedCat(e.target.value)}
                className="text-xs font-medium bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900"
              >
                {CATEGORIAS_VEICULOS.map((c) => (
                  <option key={c.cat} value={c.cat}>
                    {c.nomeCurto} (Cód. {c.cat}) — {c.eixosTexto} eixos {c.rodagem} ({c.fatorTexto})
                  </option>
                ))}
              </select>
            </div>

            {selectedCat === '09' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Nº Eixos CAT 9 (7+)
                </label>
                <select
                  value={cat9Axles}
                  onChange={(e) => setCat9Axles(Number(e.target.value))}
                  className="text-xs font-medium bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900"
                >
                  <option value={7}>7 eixos (7,0x)</option>
                  <option value={8}>8 eixos (8,0x)</option>
                  <option value={9}>9 eixos (9,0x)</option>
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Eixos Suspensos (Subcat Isenta)
              </label>
              <select
                value={eixosSuspensos}
                onChange={(e) => setEixosSuspensos(Number(e.target.value))}
                className="text-xs font-medium bg-white border border-slate-300 rounded-md px-3 py-1.5 text-slate-900"
              >
                <option value={0}>Subcat 00 — Nenhum erguido</option>
                <option value={1}>Subcat 01 — 1 eixo erguido (isento)</option>
                <option value={2}>Subcat 02 — 2 eixos erguidos (isentos)</option>
                <option value={3}>Subcat 03 — 3 eixos erguidos (isentos)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                <th className="py-2.5 pr-3">Praça</th>
                <th className="py-2.5 px-3">Pórtico / Código</th>
                <th className="py-2.5 px-3">Rodovia &amp; Município</th>
                <th className="py-2.5 px-3 text-right">CAT 1 (1,0x)</th>
                <th className="py-2.5 px-3 text-right">CAT 3 (1,5x)</th>
                <th className="py-2.5 px-3 text-right">CAT 2/5 (2,0x)</th>
                <th className="py-2.5 px-3 text-right">CAT 4 (3,0x)</th>
                <th className="py-2.5 px-3 text-right">CAT 7 (5,0x)</th>
                <th className="py-2.5 pl-3 text-right bg-sky-50 text-sky-900">
                  Simulado ({activeCategory.nomeCurto})
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs font-mono tabular-nums">
              {PORTICOS_CCA.map((p) => {
                const simulatedValue = calculateTariffValue(
                  p.tarifaCat1,
                  activeCategory.cat,
                  cat9Axles
                );
                return (
                  <tr key={p.praca} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-3 font-semibold text-slate-900">
                      {p.praca}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className="font-semibold text-slate-900">{p.nome}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span className="font-mono text-sky-700 font-semibold">
                        {p.codigo}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-700">
                      {p.rodovia} ({p.km}) · {p.municipio}
                    </td>
                    <td className="py-2.5 px-3 text-right font-semibold text-slate-900">
                      {formatCurrencyBRL(p.tarifaCat1)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600">
                      {formatCurrencyBRL(p.tarifaCat1 * 1.5)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600">
                      {formatCurrencyBRL(p.tarifaCat1 * 2.0)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600">
                      {formatCurrencyBRL(p.tarifaCat1 * 3.0)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-600">
                      {formatCurrencyBRL(p.tarifaCat1 * 5.0)}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-bold text-sky-800 bg-sky-50/60">
                      {formatCurrencyBRL(simulatedValue)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
