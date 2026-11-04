# Caminhos da Celulose CCA — Ajustes de Realismo nas Câmeras, Categoria Original com Desconto de Eixos Erguidos, Filtro de 1 Minuto e Controle de Validação

Refinamento da Estação de Validação e do cálculo tarifário da planilha para eliminar dicas visuais ("spoilers") de ilegibilidade e rodagem nas câmeras, corrigir a relação entre **Categoria Original (`Cat`)** e **Eixos Erguidos (`Subcat`)** no desenho e no valor cobrado, garantir tempo mínimo de **1 minuto** para novas passagens enviadas ao operador e adicionar o botão **"Parar de Validar Placas"** sem alertas intrusivos em outras telas.

## User Review & Critical Decisions

> [!IMPORTANT]
> Decisões confirmadas para implementação imediata:

- **Decisão Confirmada 1 — Categoria Original (`Cat`), Desenho na CAM-03 e Cálculo do `Valor` com `Subcat`**:
  - **`Cat` (Categoria Original)**: Representa o **total de eixos físicos do veículo** + tipo de rodagem (ex.: uma carreta simples de 5 eixos físicos é sempre **CAT 7**, mesmo que esteja com 1 eixo suspenso).
  - **`Subcat` (Eixos Erguidos)**: Representa quantos desses eixos totais estão levantados (`00`, `01`, `02`, `03`).
  - **Desenho Exato na CAM-03**: Um veículo `CAT 7` (5 eixos totais) com `Subcat 01` (1 erguido) exibirá exatamente **5 rodas na lateral**: **4 rodas verdes no solo** + **1 roda amarela erguida** (e não 5 + 1 = 6).
  - **Cálculo do `Valor` na Planilha**: O valor da passagem na planilha **desconta os eixos erguidos (`Subcat`)** da categoria original (`Eixos Cobrados = Total de Eixos da Cat − Subcat`). Assim, um caminhão de rodagem dupla `CAT 7` (5 eixos) com `Subcat 01` (1 eixo erguido) paga pelos **4 eixos em contato com o solo** (`4,0x` a tarifa base CAT 1 do pórtico).
- **Decisão Confirmada 2 — Botão "Parar de Validar Placas" e Bloqueio de Alertas Fora da Estação**:
  - Os prazos SLA 24h continuam correndo normalmente em segundo plano, porém **nenhum modal de alerta de expiração será exibido se o usuário estiver em outra aba** (Painel Executivo, Planilha Base, Pórticos, DAX) ou se tiver clicado em **"Parar de Validar Placas"**.
- **Decisão Confirmada 3 — Tempo Mínimo de 1 Minuto para Receber Nova Passagem na Estação**:
  - A Estação de Validação só puxará uma nova passagem para a tela do operador se ela tiver **pelo menos 1 minuto (`>= 60 segundos`) restante de SLA**. Passagens que já estejam com menos de 1 minuto não são enviadas para início de validação (para que o operador tenha tempo hábil de raciocinar) e expiram normalmente ao zerar o relógio.

---

## 1. Visão Geral das Alterações na Experiência Visual e Operacional

### A. Câmeras Sem "Spoilers" de Ilegibilidade ou Rodagem (`FreeFlowCameraTriplet`)
1. **Casos Ilegíveis Sem Texto Explicativo**:
   - **Placa com Barro/Dano (`placa_ilegivel_barro`)**: A placa Mercosul mantém sua moldura padrão, mas os caracteres ficam cobertos por crostas visuais de lama/desgaste e desfoque físico, **sem escrever "ILEGÍVEL" ou "BARRO/DANO"** na placa nem no indicador superior. O próprio operador perceberá, ao testar os sliders de Brilho/Contraste/Infravermelho, que não é possível identificar as 7 letras/números e deverá decidir clicar em **Ilegível**.
   - **Câmera 03 Lateral Obstruída (`lateral_obstruida`)**: Em vez de uma caixa de texto dizendo *"FALHA ÓPTICA · CÂMERA LATERAL OBSTRUÍDA"*, a câmera lateral exibe a cena da pista com uma **obstrução visual gráfica sobre a linha dos eixos** (mancha densa de lama/respingo na lente e silhueta escura bloqueando a visão das rodas), exigindo que o operador perceba visualmente que não há como contar os eixos.
2. **Câmera 03 Lateral Sem Textos no Corpo do Veículo**:
   - Remoção completa dos rótulos internos dentro do desenho SVG (`"RODAGEM SIMPLES"`, `"REBOQUE SIMPLES"`, `"CARGA PESADA · RODAGEM DUPLA (◎)"`, `"ISENTO / OFICIAL / MOTO"`).
   - Permanece **apenas a legenda superior** (`● Solo (Verde) vs ● Erguido (Amarelo)` e `◯ Aro Único = Simples · ◎ Aro Duplo = Dupla`) para que o analista conte os eixos e identifique o tipo de aro visualmente.

### B. Botão "Parar de Validar Placas" e Silenciamento de Alertas Fora da Estação
- Na Estação de Validação, inclusão do botão destacado **"Parar de Validar Placas"** ao lado dos controles da sessão.
- Ao clicar em **"Parar de Validar Placas"** (ou ao navegar para qualquer outra aba do sistema):
  - O modo ativo da Estação de Validação é encerrado (`workstationMode = false`), o cronômetro de turno do operador é pausado e `lockedSeq` é liberado.
  - O verificador de expiração SLA 24h continua atualizando a planilha em segundo plano, mas **só dispara o Modal de Alerta Pausado se a passagem que estava ativamente travada na tela do operador expirar enquanto ele estiver com a Estação de Validação aberta**.

### C. Regra de 1 Minuto Mínimo (`>= 60s`) para Envio à Estação
- Quando a Estação de Validação for buscar a próxima passagem da fila (`activeWorkstationItem`), ela filtrará apenas as passagens pendentes cujo tempo restante (`expiraAprovacaoMs - nowMs`) seja **maior ou igual a 60.000 ms (1 minuto)**.
- Além disso, o botão **"+ Gerar 5 Passagens Críticas"** gerará passagens com prazos entre **1m 30s e 6m 00s**, garantindo que todas entrem com tempo hábil para análise.

---

## 2. Arquitetura Técnica e Fluxo de Cálculo (`Cat` Original − `Subcat` Erguidos)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                 CÁLCULO DE EIXOS E VALOR NA PLANILHA BASE                    │
│                                                                              │
│  • Cat Original (01 a 09): Define o TOTAL DE EIXOS FÍSICOS do veículo        │
│    Ex: CAT 7 = Carreta 5 eixos (Dupla) | CAT 8 = Carreta 6 eixos (Dupla)     │
│                                                                              │
│  • Subcat (00 a 03): Quantidade de EIXOS ERGUIDOS (Suspensos / Amarelos)     │
│    Ex: Subcat 01 = 1 eixo erguido                                            │
│                                                                              │
│  • Desenho na CAM-03 Lateral:                                                │
│    Total de Rodas Desenhadas = Total de Eixos da Cat Original (ex: 5 rodas)  │
│      ├─ Rodas Verdes (No Solo)   = Total da Cat − Subcat (ex: 5 − 1 = 4)     │
│      └─ Rodas Amarelas (Erguidas)= Subcat (ex: 1 roda suspensa)              │
│                                                                              │
│  • Cálculo do Valor na Planilha (calculateTariffValue):                      │
│    Eixos Cobrados Efetivos = Total de Eixos da Cat − Eixos Erguidos (Subcat) │
│      ├─ Rodagem Dupla:   Tarifa Base CAT 1 × (Total Eixos − Subcat)          │
│      └─ Rodagem Simples: Tarifa Base CAT 1 × 0,5 × (Total Eixos − Subcat)    │
└──────────────────────────────────────────────────────────────────────────────┘
```
