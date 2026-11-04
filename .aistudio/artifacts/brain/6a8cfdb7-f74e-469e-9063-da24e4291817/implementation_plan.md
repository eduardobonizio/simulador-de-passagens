# Plano de Balanceamento Dinâmico dos Sliders por Confiança OCR

Este plano implementa o balanceamento dinâmico da posição inicial dos sliders de imagem (Brilho, Contraste, Nitidez e Zoom) com base no valor de **Confiança Inicial OCR (`confiancaOcr`)** de cada passagem, e posições aleatórias para casos de **placa ilegível**.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Regras confirmadas:**
> 1. **Confiança 100% (ou muito alta >= 95%):**
>    - Os sliders iniciam exatamente nos valores ideais em que a imagem já fica 100% legível (Ex: Brilho calibrado, Contraste ideal, Nitidez adequada e Zoom 1.35x).
> 2. **Confiança Baixa (ex: 5% a 30%):**
>    - Os sliders iniciam propositalmente muito distantes dos valores ideais necessários para ler a placa (por exemplo, sol forte com brilho no máximo positivo ou penumbra com brilho no mínimo e contraste no mínimo), exigindo grande esforço de correção do operador.
> 3. **Confiança Intermediária (ex: 40% a 70%):**
>    - A distância dos sliders em relação ao ponto ótimo é proporcional ao erro `(100 - confiança)`.
> 4. **Casos de Placa Ilegível (`ehIlegivelReal = true` ou anomalia barro/dano):**
>    - Os sliders iniciam em posições pseudo-aleatórias (variando de passagem para passagem), simulando uma tentativa desregulada do equipamento e deixando evidente que mexer neles não tornará o barro legível.

---

## 1. Mapeamento Matemático das Posições Iniciais

Para cada passagem gerada, definimos o **Ponto Ótimo de Leitura** de acordo com sua anomalia:
- **`sol_forte`**: Ponto ideal é Brilho `-45%`, Contraste `165%`, Nitidez `80%`, Zoom `1.4x`.
- **`muito_escura`**: Ponto ideal é Brilho `+50%`, Contraste `165%`, Nitidez `75%`, Zoom `1.4x`.
- **`desfoque_velocidade`**: Ponto ideal é Brilho `-5%`, Contraste `155%`, Nitidez `85%`, Zoom `1.4x`.
- **`fita_isolante`**: Ponto ideal é Brilho `-10%`, Contraste `165%`, Nitidez `80%`, Zoom `1.5x`.
- **`normal`**: Ponto ideal é Brilho `0%`, Contraste `100%`, Nitidez `50%`, Zoom `1.3x`.

### Interpolação pela Confiança:
Seja `conf` a Confiança OCR (0 a 100) e `distancia = (100 - conf) / 100`:
- **Com `conf = 100%`**: `distancia = 0` $\rightarrow$ Slider = Ponto Ótimo $\rightarrow$ Imagem perfeitamente nítida de imediato.
- **Com `conf = 5%`**: `distancia = 0.95` $\rightarrow$ Slider deslocado para o extremo oposto do que a imagem precisa (ex.: no sol forte, Brilho vai para `+75%`, estourando ainda mais a luz; Nitidez vai para `0%`; Contraste vai para `60%`).
- **Com `ehIlegivelReal = true`**: Sliders gerados de forma aleatória e dispersa a cada recibo.

---

## 2. Arquivos Modificados
- `/src/components/FreeFlowCameraTriplet.tsx`:
  - Criação da função auxiliar `getInitialSliderState(record: PassageRecord)` calculando Brilho, Contraste, Nitidez e Zoom de acordo com as regras acima.
  - Atualização do `useState` inicial e do `useEffect` de troca de passagem / botão `handleResetFilters`.
