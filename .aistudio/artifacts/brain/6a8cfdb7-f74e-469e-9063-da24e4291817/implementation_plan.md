# Plano Concluído: Aleatoriedade de Lama nas Câmeras e Erros Realistas de OCR em Todas as Posições

Este documento registra a implementação completa da mecânica de lama por ângulo (Frontal vs. Traseira vs. Ambas) e a distribuição de erros de leitura do OCR em qualquer um dos 7 caracteres da Placa Mercosul.

---

## 1. Decisões Implementadas

### A. Aleatoriedade de Lama na Placa (Frontal vs. Traseira vs. Ambas)
1. **Lama apenas na Placa Dianteira (`lamaAngulo: 'frontal'`):**
   - A **CAM-01** (frontal) renderiza com a crosta opaca de lama e desgaste.
   - A **CAM-02** (traseira) renderiza **limpa e nítida** (sujeita apenas aos sliders ópticos normais).
   - **Conduta do Operador:** Inspecionar o ângulo traseiro (CAM-02), ajustar os sliders se necessário e **Validar a placa com sucesso**.
   - Se o operador clicar em "Ilegível", o sistema computa erro operacional com feedback educativo: *"Apenas a CAM-01 Frontal estava com lama! A CAM-02 Traseira estava limpa e permitia validar a passagem."*

2. **Lama apenas na Placa Traseira (`lamaAngulo: 'traseira'`):**
   - A **CAM-02** (traseira) renderiza com lama.
   - A **CAM-01** (frontal) renderiza **limpa e nítida**.
   - **Conduta do Operador:** Inspecionar o ângulo frontal (CAM-01) e **Validar a placa com sucesso**.

3. **Lama em Ambas as Placas (`lamaAngulo: 'ambas'`, `ehIlegivelReal: true`):**
   - Ambas as câmeras mostram a placa coberta por lama impenetrável sem entregar texto de spoiler na imagem.
   - **Conduta do Operador:** Clicar em **"Ilegível"**. O sistema reconhece a decisão correta e recupera a pontuação da sessão.

---

### B. Distribuição Realista de Erros de OCR nos 7 Caracteres
1. **Fim da restrição aos caracteres 4 ou 7:**
   - O OCR agora pode cometer erros de leitura em **qualquer uma das 7 posições** (`0` a `6`).
2. **Matriz de Confusão Visual Bidirecional:**
   - **Letras ↔ Números:** `O` ↔ `0`, `I` ↔ `1`, `Z` ↔ `2`, `B` ↔ `8`, `S` ↔ `5`, `G` ↔ `6`, `Q` ↔ `0`, `A` ↔ `4`.
   - **Letras ↔ Letras:** `D` ↔ `O`, `E` ↔ `F`, `P` ↔ `R`, `V` ↔ `U`, `M` ↔ `N`, `C` ↔ `G`.
   - **Números ↔ Números:** `3` ↔ `8`, `6` ↔ `5`, `7` ↔ `1`, `8` ↔ `0`, `9` ↔ `0`.
3. **Adulteração Dinâmica com Fita Isolante:**
   - A fita isolante agora pode ser aplicada em qualquer caractere que permita camuflagem visual realista (`F` virando `E`, `P` virando `B`, `C` virando `O`, `1` virando `7`, `3` virando `8`, `0` virando `8`, `5` virando `6`, etc.).
   - A posição exata adulterada é salva em `posicaoAdulterada` e destacada na câmera correspondente quando ativado o filtro Infravermelho.

---

## 2. Arquivos Modificados e Validados

1. **`src/types/passage.ts`**:
   - Campos adicionados: `lamaAngulo?: 'ambas' | 'frontal' | 'traseira'`, `posicaoAdulterada?: number`, `posicoesErroOcr?: number[]`, `tipoErroOcr?: 'substituicao' | 'segmentacao' | 'desgaste' | 'adulteracao'`.
2. **`src/utils/generator.ts`**:
   - `TAPE_ADULTERATIONS` e `VISUAL_SUBSTITUTIONS` implementados.
   - `simulateOcrMisreadDetailed` e `simulateOcrMisread` com sorteio aleatório de índices e distribuição nos 7 caracteres.
   - `chooseAnomalia` com sorteio de 33% ambas, 33% frontal e 34% traseira para barro.
   - `createInitialSeedRecords` com casos de lama frontal e ambas para treinamento imediato.
3. **`src/components/FreeFlowCameraTriplet.tsx`**:
   - Renderização condicional da lama em `renderMercosulPlate` respeitando o ângulo de cada câmera (`front` vs `rear`).
   - Fita isolante destacando dinamicamente `record.posicaoAdulterada`.
   - Sliders balanceados e score de nitidez para câmeras limpas mesmo em passagens com barro parcial.
4. **`src/components/ApprovalQueue24h.tsx`**:
   - Guia de treinamento ("Macete CAT 1–9") atualizado com a regra dos 2 ângulos.
5. **`src/App.tsx`**:
   - Diagnóstico no modal de erro e no gabarito explicando a câmera limpa alternativa em casos de lama unilateral.
6. **`src/components/PorticosReferenceView.tsx`**:
   - Correção na chamada da função `calculateTariffValue`.

---

## 3. Status de Verificação

- **TypeScript / Linter:** 100% aprovado (`npm run lint` executado sem erros).
- **Compilação Vite:** 100% aprovado (`compile_applet` com sucesso).
- **Comportamento em Tempo Real:** Operador pode inspecionar CAM-01 e CAM-02 separadamente e validar a placa quando um dos lados estiver limpo.
