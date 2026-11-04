import React, { useEffect, useState } from 'react';
import { CATEGORIAS_VEICULOS, PORTICO_MAP } from '../data/porticos';
import { AnomaliaOptica, PassageRecord } from '../types/passage';

interface FreeFlowCameraTripletProps {
  record: PassageRecord;
  compact?: boolean;
  hideCategorySpoilers?: boolean;
}

interface SliderState {
  brightness: number;
  contrast: number;
  sharpness: number;
  zoom: number;
  infrared: boolean;
}

/**
 * Calcula a posição inicial dos sliders de acordo com a Confiança Inicial do OCR:
 * - Confiança 100%: Sliders iniciam na posição calibrada e perfeita (100% legível).
 * - Confiança baixa (ex: 5% a 30%): Sliders iniciam no extremo oposto / bem distantes do que a imagem precisa.
 * - Confiança intermediária: Deslocamento proporcional à perda de confiança (100 - conf).
 * - Placa ilegível: Sliders iniciam em posições totalmente aleatórias e dispersas a cada passagem.
 */
function getBalancedSliderState(record: PassageRecord): SliderState {
  const anomalia: AnomaliaOptica = record.anomaliaOptica || 'normal';
  const conf = Math.max(0, Math.min(100, record.confiancaOcr ?? 70));
  const isIllegible = record.ehIlegivelReal || anomalia === 'placa_ilegivel_barro' || anomalia === 'lateral_obstruida';

  // 1. Caso Ilegível: posições pseudo-aleatórias baseadas no seq da passagem
  if (isIllegible) {
    const seed = (record.seq * 9301 + 49297) % 233280;
    const rnd1 = (seed % 100) / 100;
    const rnd2 = ((seed * 7) % 100) / 100;
    const rnd3 = ((seed * 13) % 100) / 100;
    const rnd4 = ((seed * 19) % 100) / 100;

    return {
      brightness: Math.round(-75 + rnd1 * 150), // entre -75% e +75%
      contrast: Math.round(60 + rnd2 * 170),    // entre 60% e 230%
      sharpness: Math.round(rnd3 * 90),         // entre 0% e 90%
      zoom: Number((1.0 + rnd4 * 1.5).toFixed(1)), // entre 1.0x e 2.5x
      infrared: rnd1 > 0.6,
    };
  }

  // 2. Pontos ideais de calibração para 100% de legibilidade
  let idealBrightness = 0;
  let idealContrast = 100;
  let idealSharpness = 50;
  let idealZoom = 1.35;
  let idealInfrared = false;

  // Ponto mais adverso (extremo oposto de onde a imagem precisa estar)
  let worstBrightness = 0;
  let worstContrast = 60;
  let worstSharpness = 0;
  let worstZoom = 1.0;

  if (anomalia === 'sol_forte') {
    // Sol forte precisa de brilho negativo e alto contraste
    idealBrightness = -45;
    idealContrast = 165;
    idealSharpness = 80;
    idealZoom = 1.4;

    worstBrightness = +70; // estourado no branco
    worstContrast = 60;
    worstSharpness = 0;
    worstZoom = 1.0;
  } else if (anomalia === 'muito_escura') {
    // Foto escura precisa de brilho positivo e alto contraste
    idealBrightness = +45;
    idealContrast = 165;
    idealSharpness = 75;
    idealZoom = 1.4;

    worstBrightness = -70; // afundado no preto
    worstContrast = 60;
    worstSharpness = 0;
    worstZoom = 1.0;
  } else if (anomalia === 'desfoque_velocidade') {
    idealBrightness = -5;
    idealContrast = 155;
    idealSharpness = 85;
    idealZoom = 1.45;

    worstBrightness = +45;
    worstContrast = 65;
    worstSharpness = 0;
    worstZoom = 1.0;
  } else if (anomalia === 'fita_isolante') {
    idealBrightness = -10;
    idealContrast = 165;
    idealSharpness = 75;
    idealZoom = 1.5;
    idealInfrared = true;

    worstBrightness = -60;
    worstContrast = 70;
    worstSharpness = 5;
    worstZoom = 1.0;
  } else {
    // Normal
    idealBrightness = 0;
    idealContrast = 100;
    idealSharpness = 55;
    idealZoom = 1.3;

    worstBrightness = -65;
    worstContrast = 60;
    worstSharpness = 0;
    worstZoom = 1.0;
  }

  // Fator de distância: 0 para conf 100%, 0.95 para conf 5%
  const distanceFactor = Math.max(0, Math.min(1.0, (100 - conf) / 95));

  const initialBrightness = Math.round(
    idealBrightness + (worstBrightness - idealBrightness) * distanceFactor
  );
  const initialContrast = Math.round(
    idealContrast + (worstContrast - idealContrast) * distanceFactor
  );
  const initialSharpness = Math.round(
    idealSharpness + (worstSharpness - idealSharpness) * distanceFactor
  );
  const initialZoom = Number(
    (idealZoom + (worstZoom - idealZoom) * distanceFactor).toFixed(1)
  );

  return {
    brightness: Math.max(-75, Math.min(75, initialBrightness)),
    contrast: Math.max(60, Math.min(230, initialContrast)),
    sharpness: Math.max(0, Math.min(100, initialSharpness)),
    zoom: Math.max(1.0, Math.min(2.6, initialZoom)),
    infrared: conf >= 90 ? idealInfrared : false,
  };
}

export const FreeFlowCameraTriplet: React.FC<FreeFlowCameraTripletProps> = ({
  record,
  compact = false,
}) => {
  const initialSliders = getBalancedSliderState(record);
  const [brightness, setBrightness] = useState<number>(initialSliders.brightness);
  const [contrast, setContrast] = useState<number>(initialSliders.contrast);
  const [sharpness, setSharpness] = useState<number>(initialSliders.sharpness);
  const [infraredMode, setInfraredMode] = useState<boolean>(initialSliders.infrared);
  const [plateZoom, setPlateZoom] = useState<number>(initialSliders.zoom);
  const [focusedCamera, setFocusedCamera] = useState<'all' | 'front' | 'rear' | 'side'>('all');

  // Sempre que mudar para uma nova placa/passagem, balancear os sliders conforme a Confiança OCR
  useEffect(() => {
    const balanced = getBalancedSliderState(record);
    setBrightness(balanced.brightness);
    setContrast(balanced.contrast);
    setSharpness(balanced.sharpness);
    setInfraredMode(balanced.infrared);
    setPlateZoom(balanced.zoom);
    setFocusedCamera('all');
  }, [record.seq, record.idRecibo]);

  const portico = PORTICO_MAP[record.praca];
  const catInfo =
    CATEGORIAS_VEICULOS.find((c) => c.cat === record.cat) || CATEGORIAS_VEICULOS[0];

  const anomalia: AnomaliaOptica = record.anomaliaOptica || 'normal';
  const truePlate = record.placaReal || record.placa;
  const ocrPlate = record.placaLidaOcr || record.placa;
  const ocrConf = record.confiancaOcr ?? 72;

  // CÁLCULO DE CONVERGÊNCIA ÓPTICA (EXIGE COMBINAÇÃO DE BRILHO + CONTRASTE + NITIDEZ):
  // 1. Convergência de Brilho (0.0 a 1.0) conforme a condição de iluminação
  let brightnessFitness = 1.0;
  if (anomalia === 'sol_forte') {
    // Foto estourada de luz branca: exige Brilho negativo (ideal entre -35% e -60%)
    if (brightness >= 0) {
      brightnessFitness = 0.08;
    } else {
      const dist = Math.abs(brightness - (-45));
      brightnessFitness = Math.max(0.12, Math.min(1.0, 1.0 - dist / 35));
    }
  } else if (anomalia === 'muito_escura') {
    // Foto noturna na penumbra: exige Brilho positivo (ideal entre +35% e +60%)
    if (brightness <= 0 && !infraredMode) {
      brightnessFitness = 0.08;
    } else if (infraredMode) {
      brightnessFitness = 0.95;
    } else {
      const dist = Math.abs(brightness - 45);
      brightnessFitness = Math.max(0.12, Math.min(1.0, 1.0 - dist / 35));
    }
  } else if (anomalia === 'desfoque_velocidade' || anomalia === 'fita_isolante') {
    // Ajuste equilibrado de exposição (ideal entre -20% e +15%)
    const dist = Math.abs(brightness - (-5));
    brightnessFitness = Math.max(0.3, Math.min(1.0, 1.0 - dist / 40));
  }

  // 2. Convergência de Contraste (0.0 a 1.0)
  // Quase todas as fotos com defeito exigem Contraste aumentado para separar os caracteres Mercosul
  let contrastFitness = 1.0;
  if (anomalia === 'sol_forte' || anomalia === 'muito_escura') {
    // Ideal entre 140% e 195%
    if (contrast <= 100 && !infraredMode) {
      contrastFitness = 0.15;
    } else {
      const dist = Math.abs(contrast - 165);
      contrastFitness = Math.max(0.2, Math.min(1.0, 1.0 - dist / 70));
    }
  } else if (anomalia === 'desfoque_velocidade') {
    // Exige contraste para destacar as bordas dos caracteres (ideal entre 135% e 180%)
    if (contrast <= 105) {
      contrastFitness = 0.25;
    } else {
      const dist = Math.abs(contrast - 155);
      contrastFitness = Math.max(0.3, Math.min(1.0, 1.0 - dist / 60));
    }
  } else if (anomalia === 'fita_isolante') {
    if (contrast < 135 && !infraredMode) {
      contrastFitness = 0.35;
    } else {
      contrastFitness = Math.min(1.0, (contrast - 90) / 60);
    }
  }

  // 3. Eficiência da Nitidez: SÓ FAZ EFEITO SE O BRILHO E CONTRASTE ESTIVEREM ALINHADOS!
  // Se o analista apenas jogar nitidez no máximo sem consertar brilho/contraste, a eficácia é travada em ~20%
  const opticalSynergy = brightnessFitness * contrastFitness;
  const sharpnessFitness = Math.min(1.0, sharpness / 75);

  const baseBlurPx = Math.max(0, (100 - ocrConf) / 10);
  // Redução real do blur depende da multiplicação dos 3 fatores simultâneos
  const maxPossibleReduction = baseBlurPx * 0.95;
  const effectiveReduction = maxPossibleReduction * (sharpness / 100) * opticalSynergy;
  
  const effectivePlateBlur =
    anomalia === 'placa_ilegivel_barro'
      ? 6.5
      : Math.max(0.15, baseBlurPx - effectiveReduction);

  // Opacidade da névoa de luz solar: só se dissipa se o brilho for reduzido e contraste aumentado
  let sunGlareOpacity = 0;
  if (anomalia === 'sol_forte') {
    const glareFactor = Math.max(0, (1 - brightnessFitness * 0.85) * (1 - contrastFitness * 0.5));
    sunGlareOpacity = Math.max(0.08, Math.min(0.94, glareFactor));
    if (infraredMode) sunGlareOpacity *= 0.35;
  }

  // Opacidade da sombra noturna: só se dissipa se o brilho subir ou ativar infravermelho
  let nightShadowOpacity = 0;
  if (anomalia === 'muito_escura') {
    const darkFactor = Math.max(0, (1 - brightnessFitness * 0.85) * (1 - contrastFitness * 0.5));
    nightShadowOpacity = infraredMode ? 0.08 : Math.max(0.08, Math.min(0.92, darkFactor));
  }

  // Revelação de fita isolante: exige Infravermelho OU combinação precisa de Contraste + Nitidez + Brilho
  const isTapeRevealed =
    anomalia === 'fita_isolante' &&
    (infraredMode || (contrast >= 145 && sharpness >= 60 && brightnessFitness >= 0.7));

  // Score percentual exibido no topo: reflete a convergência dos 3 sliders
  let readabilityScore = 100;
  if (anomalia === 'placa_ilegivel_barro' || anomalia === 'lateral_obstruida') {
    readabilityScore = Math.min(32, Math.round(15 + sharpness * 0.12));
  } else if (anomalia === 'sol_forte') {
    readabilityScore = Math.round(opticalSynergy * sharpnessFitness * 100);
  } else if (anomalia === 'muito_escura') {
    readabilityScore = infraredMode
      ? Math.round(Math.min(100, 70 + sharpness * 0.3))
      : Math.round(opticalSynergy * sharpnessFitness * 100);
  } else if (anomalia === 'fita_isolante') {
    readabilityScore = isTapeRevealed ? 96 : Math.round(opticalSynergy * 45);
  } else if (anomalia === 'desfoque_velocidade') {
    readabilityScore = Math.round(opticalSynergy * sharpnessFitness * 100);
  }

  const handleResetFilters = () => {
    const balanced = getBalancedSliderState(record);
    setBrightness(balanced.brightness);
    setContrast(balanced.contrast);
    setSharpness(balanced.sharpness);
    setInfraredMode(balanced.infrared);
    setPlateZoom(balanced.zoom);
  };

  const cssFilterString = `brightness(${100 + brightness}%) contrast(${contrast}%) ${
    infraredMode ? 'grayscale(100%) invert(92%) contrast(135%)' : ''
  }`;

  // Total de eixos físicos pertence à Categoria Original (Cat) do veículo!
  // Os eixos erguidos (Subcat) fazem parte desse total físico e ficam suspensos (amarelos).
  const totalEixosFisicos =
    record.cat === '09'
      ? record.eixosSoloReais && record.eixosSoloReais >= 7
        ? record.eixosSoloReais
        : 7
      : catInfo.isento
      ? 2
      : catInfo.eixosCobrados;

  const eixosSuspensos = Math.min(
    Math.max(0, totalEixosFisicos - 2),
    Math.max(0, Number(record.subcat) || 0)
  );
  const isRodagemSimples = catInfo.rodagem === 'Simples';
  const isRodagemDupla = catInfo.rodagem === 'Dupla';

  const renderMercosulPlate = (cameraAngle: 'front' | 'rear') => {
    const angleBlur =
      cameraAngle === 'rear' ? Math.max(0, effectivePlateBlur * 0.85) : effectivePlateBlur;

    if (anomalia === 'placa_ilegivel_barro') {
      // Renderiza placa Mercosul fisicamente coberta por manchas densas de barro/desgaste,
      // SEM qualquer texto dizendo "ILEGÍVEL" para que o próprio operador perceba visualmente.
      return (
        <div
          style={{ transform: `scale(${plateZoom})` }}
          className="relative inline-flex flex-col items-center bg-stone-300 border-2 border-slate-900 rounded px-3 py-1 shadow-md select-none overflow-hidden"
        >
          <div className="w-full bg-blue-900/80 text-white/50 text-[8px] font-bold tracking-widest px-1.5 py-0.2 flex items-center justify-between rounded-t-xs">
            <span>MERCOSUL</span>
            <span>BRASIL</span>
          </div>
          <div className="relative flex items-center justify-center gap-0.5 pt-0.5 pb-0.5 font-mono font-extrabold text-lg tracking-wider text-stone-800">
            {truePlate.split('').map((ch, idx) => (
              <span
                key={idx}
                style={{ filter: 'blur(6px)' }}
                className="relative inline-block px-0.5 opacity-25 select-none"
              >
                {ch}
              </span>
            ))}
            {/* Crostas visuais opacas de barro e raspagem sobre os caracteres */}
            <svg
              viewBox="0 0 120 28"
              className="pointer-events-none absolute inset-0 w-full h-full"
            >
              <ellipse cx="26" cy="15" rx="24" ry="11" fill="#292524" fillOpacity="0.96" />
              <ellipse cx="62" cy="13" rx="28" ry="12" fill="#451a03" fillOpacity="0.95" />
              <ellipse cx="96" cy="16" rx="22" ry="11" fill="#1c1917" fillOpacity="0.96" />
              <path
                d="M8 8 Q 45 22, 85 10 T 115 18"
                stroke="#292524"
                strokeWidth="7"
                fill="none"
              />
            </svg>
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          transform: `scale(${plateZoom})`,
          filter: `blur(${angleBlur.toFixed(2)}px)`,
        }}
        className="relative inline-flex flex-col items-center bg-white border-2 border-slate-900 rounded px-3 py-1 shadow-md transition-transform duration-150 select-none"
      >
        <div className="w-full bg-blue-800 text-white text-[8px] font-bold tracking-widest px-1.5 py-0.2 flex items-center justify-between rounded-t-xs">
          <span>MERCOSUL</span>
          <span>BRASIL</span>
        </div>

        <div className="relative flex items-center justify-center gap-0.5 pt-0.5 pb-0.5 font-mono font-extrabold text-lg tracking-wider text-slate-950">
          {truePlate.split('').map((trueChar, idx) => {
            const ocrChar = ocrPlate[idx] || trueChar;
            const hasTapeHere = anomalia === 'fita_isolante' && idx === 3;

            return (
              <span key={idx} className="relative inline-block px-0.5">
                {hasTapeHere && !isTapeRevealed ? ocrChar : trueChar}

                {hasTapeHere && (
                  <span
                    title="Adulteração por fita isolante detectada"
                    className={`pointer-events-none absolute inset-0 rounded-xs transition-opacity ${
                      isTapeRevealed
                        ? 'border border-dashed border-red-600 bg-red-500/20 opacity-95'
                        : 'bg-slate-950/35'
                    }`}
                  />
                )}
              </span>
            );
          })}
        </div>

        {anomalia === 'sol_forte' && (
          <div
            style={{ opacity: sunGlareOpacity }}
            className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-amber-100 via-white to-yellow-200 rounded mix-blend-screen"
          />
        )}
      </div>
    );
  };

  // Renderiza o pneu na Câmera 03 diferenciando visualmente Aro Simples (◯) vs Aro Duplo (◎)
  const renderWheelLateral = (
    cx: number,
    cy: number,
    lifted: boolean,
    dualTire: boolean,
    idx: number
  ) => {
    const strokeColor = lifted ? '#f59e0b' : '#10b981';
    return (
      <g key={idx}>
        {/* Pneu externo */}
        <circle
          cx={cx}
          cy={cy}
          r={13}
          fill="#0f172a"
          stroke={strokeColor}
          strokeWidth="2.5"
        />
        {dualTire ? (
          /* Rodagem Dupla: segundo anel concêntrico + cubo duplo pesado (◎) */
          <>
            <circle
              cx={cx}
              cy={cy}
              r={8}
              fill="#0f172a"
              stroke={strokeColor}
              strokeWidth="1.8"
            />
            <circle cx={cx} cy={cy} r={3.2} fill={strokeColor} />
          </>
        ) : (
          /* Rodagem Simples: cubo simples central (◯) */
          <circle cx={cx} cy={cy} r={4} fill={strokeColor} />
        )}

        {lifted && (
          <line
            x1={cx - 10}
            y1="103"
            x2={cx + 10}
            y2="103"
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="2 2"
          />
        )}
      </g>
    );
  };

  return (
    <div className="space-y-4">
      {/* Cabeçalho e Sliders Ópticos */}
      <div className="bg-slate-900 text-slate-100 border border-slate-800 rounded-lg p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-mono font-semibold text-sky-400">
              {record.idRecibo} · {portico?.codigo} ({record.pista})
            </span>
            <span className="text-slate-600">·</span>
            <span className="text-xs text-slate-300">
              Confiança Inicial OCR:{' '}
              <strong
                className={
                  ocrConf < 65
                    ? 'text-amber-400 font-mono'
                    : 'text-emerald-400 font-mono'
                }
              >
                {ocrConf}%
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-slate-400">
              Nitidez Óptica:{' '}
              <strong
                className={
                  readabilityScore >= 75
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }
              >
                {readabilityScore}%
              </strong>
            </span>
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-2.5 py-1 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded transition-colors whitespace-nowrap shrink-0"
            >
              Resetar Sliders
            </button>
          </div>
        </div>

        {/* Barra de Sliders Ópticos */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 pt-3 text-xs">
          <div>
            <div className="flex justify-between text-slate-400 mb-1 font-mono">
              <span>Brilho / Exposição</span>
              <span className="text-white">
                {brightness > 0 ? `+${brightness}` : brightness}%
              </span>
            </div>
            <input
              type="range"
              min={-75}
              max={75}
              value={brightness}
              onChange={(e) => setBrightness(Number(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-400 mb-1 font-mono">
              <span>Contraste</span>
              <span className="text-white">{contrast}%</span>
            </div>
            <input
              type="range"
              min={60}
              max={230}
              value={contrast}
              onChange={(e) => setContrast(Number(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-400 mb-1 font-mono">
              <span>Nitidez (Compensar OCR)</span>
              <span className="text-white">{sharpness}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={sharpness}
              onChange={(e) => setSharpness(Number(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          <div>
            <div className="flex justify-between text-slate-400 mb-1 font-mono">
              <span>Zoom na Placa</span>
              <span className="text-white">{plateZoom.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={1.0}
              max={2.6}
              step={0.1}
              value={plateZoom}
              onChange={(e) => setPlateZoom(Number(e.target.value))}
              className="w-full accent-sky-400 cursor-pointer"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setInfraredMode((v) => !v)}
              className={`w-full py-1.5 px-3 rounded font-semibold text-xs border transition-colors whitespace-nowrap shrink-0 ${
                infraredMode
                  ? 'bg-emerald-600 text-white border-emerald-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              {infraredMode
                ? 'Filtro Infravermelho (IR): ATIVO'
                : 'Ativar Infravermelho (Detecta Fita)'}
            </button>
          </div>
        </div>
      </div>

      {/* Grade das 3 Câmeras do Pórtico Free Flow */}
      <div
        className={`grid grid-cols-1 ${
          focusedCamera === 'all' ? 'lg:grid-cols-3' : 'lg:grid-cols-1'
        } gap-4`}
      >
        {/* CÂMERA 01: FRONTAL */}
        {(focusedCamera === 'all' || focusedCamera === 'front') && (
          <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col justify-between">
            <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-300">
              <span>CAM-01 · FRONTAL OCR · {record.pista}</span>
              <button
                type="button"
                onClick={() =>
                  setFocusedCamera((c) => (c === 'front' ? 'all' : 'front'))
                }
                className="text-sky-400 hover:underline font-sans"
              >
                {focusedCamera === 'front' ? 'Ver 3 Câmeras' : 'Expandir'}
              </button>
            </div>

            <div
              style={{ filter: cssFilterString }}
              className={`relative ${
                compact ? 'h-56' : 'h-64'
              } bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 flex flex-col items-center justify-between p-4 overflow-hidden`}
            >
              {anomalia === 'sol_forte' && (
                <div
                  style={{ opacity: sunGlareOpacity }}
                  className="pointer-events-none absolute -top-12 -right-12 w-64 h-64 rounded-full bg-gradient-to-br from-yellow-100 via-amber-200/80 to-transparent blur-xl"
                />
              )}

              <div className="w-full flex-1 flex flex-col items-center justify-center relative">
                <svg
                  viewBox="0 0 260 120"
                  className="w-48 h-28 text-slate-300 stroke-current"
                  fill="none"
                >
                  <line x1="10" y1="115" x2="250" y2="115" stroke="#475569" strokeWidth="2" />
                  <line x1="35" y1="115" x2="65" y2="20" stroke="#334155" strokeWidth="1.5" strokeDasharray="4 4" />
                  <line x1="225" y1="115" x2="195" y2="20" stroke="#334155" strokeWidth="1.5" strokeDasharray="4 4" />

                  {isRodagemDupla ? (
                    <g>
                      <rect x="65" y="14" width="130" height="86" rx="6" fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
                      <rect x="75" y="24" width="110" height="32" rx="3" fill="#0f172a" stroke="#64748b" strokeWidth="1.5" />
                      <rect x="92" y="62" width="76" height="24" rx="2" fill="#0f172a" stroke="#64748b" strokeWidth="1.5" />
                      <line x1="92" y1="70" x2="168" y2="70" stroke="#475569" strokeWidth="1" />
                      <line x1="92" y1="78" x2="168" y2="78" stroke="#475569" strokeWidth="1" />
                      <rect x="72" y="72" width="16" height="10" rx="2" fill="#fef08a" />
                      <rect x="172" y="72" width="16" height="10" rx="2" fill="#fef08a" />
                      <rect x="68" y="100" width="22" height="15" rx="2" fill="#020617" />
                      <rect x="170" y="100" width="22" height="15" rx="2" fill="#020617" />
                    </g>
                  ) : record.cat === '00' ? (
                    <g>
                      <circle cx="130" cy="40" r="14" fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
                      <rect x="116" y="55" width="28" height="36" rx="5" fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
                      <circle cx="130" cy="66" r="6" fill="#fef08a" />
                      <rect x="124" y="90" width="12" height="24" rx="3" fill="#020617" />
                    </g>
                  ) : (
                    <g>
                      <path
                        d="M75 60 L92 32 L168 32 L185 60 Z"
                        fill="#1e293b"
                        stroke="#94a3b8"
                        strokeWidth="2"
                      />
                      <rect x="68" y="58" width="124" height="40" rx="8" fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
                      <rect x="76" y="68" width="20" height="10" rx="3" fill="#fef08a" />
                      <rect x="164" y="68" width="20" height="10" rx="3" fill="#fef08a" />
                      <rect x="102" y="70" width="56" height="14" rx="2" fill="#0f172a" stroke="#64748b" strokeWidth="1" />
                      <rect x="72" y="98" width="20" height="16" rx="2" fill="#020617" />
                      <rect x="168" y="98" width="20" height="16" rx="2" fill="#020617" />
                    </g>
                  )}
                </svg>

                <div className="mt-1 z-10">{renderMercosulPlate('front')}</div>
              </div>

              {anomalia === 'muito_escura' && (
                <div
                  style={{ opacity: nightShadowOpacity }}
                  className="pointer-events-none absolute inset-0 bg-slate-950"
                />
              )}

              <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 z-20 pt-2">
                <span>{record.dataHora}</span>
                <span>{record.velocidadeKmh || 82} km/h · Foco Dianteiro</span>
              </div>
            </div>
          </div>
        )}

        {/* CÂMERA 02: TRASEIRA */}
        {(focusedCamera === 'all' || focusedCamera === 'rear') && (
          <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col justify-between">
            <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-300">
              <span>CAM-02 · TRASEIRA OCR · {record.pista}</span>
              <button
                type="button"
                onClick={() =>
                  setFocusedCamera((c) => (c === 'rear' ? 'all' : 'rear'))
                }
                className="text-sky-400 hover:underline font-sans"
              >
                {focusedCamera === 'rear' ? 'Ver 3 Câmeras' : 'Expandir'}
              </button>
            </div>

            <div
              style={{ filter: cssFilterString }}
              className={`relative ${
                compact ? 'h-56' : 'h-64'
              } bg-gradient-to-b from-slate-800 via-slate-900 to-slate-950 flex flex-col items-center justify-between p-4 overflow-hidden`}
            >
              {anomalia === 'sol_forte' && (
                <div
                  style={{ opacity: sunGlareOpacity * 0.75 }}
                  className="pointer-events-none absolute -top-8 left-10 w-56 h-56 rounded-full bg-gradient-to-br from-amber-100 via-white/70 to-transparent blur-xl"
                />
              )}

              <div className="w-full flex-1 flex flex-col items-center justify-center relative">
                <svg
                  viewBox="0 0 260 120"
                  className="w-48 h-28 text-slate-300 stroke-current"
                  fill="none"
                >
                  <line x1="10" y1="115" x2="250" y2="115" stroke="#475569" strokeWidth="2" />
                  {isRodagemDupla ? (
                    <g>
                      <rect x="60" y="14" width="140" height="84" rx="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
                      <line x1="80" y1="26" x2="180" y2="26" stroke="#64748b" strokeWidth="3" />
                      <line x1="80" y1="40" x2="180" y2="40" stroke="#64748b" strokeWidth="3" />
                      <rect x="66" y="84" width="128" height="8" fill="#dc2626" stroke="#f8fafc" strokeWidth="1" strokeDasharray="8 6" />
                      <rect x="68" y="70" width="18" height="8" rx="1" fill="#ef4444" />
                      <rect x="174" y="70" width="18" height="8" rx="1" fill="#ef4444" />
                      <rect x="62" y="98" width="15" height="16" rx="2" fill="#020617" stroke="#10b981" strokeWidth="1" />
                      <rect x="79" y="98" width="15" height="16" rx="2" fill="#020617" stroke="#10b981" strokeWidth="1" />
                      <rect x="166" y="98" width="15" height="16" rx="2" fill="#020617" stroke="#10b981" strokeWidth="1" />
                      <rect x="183" y="98" width="15" height="16" rx="2" fill="#020617" stroke="#10b981" strokeWidth="1" />
                    </g>
                  ) : (
                    <g>
                      <rect x="70" y="34" width="120" height="62" rx="6" fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
                      <rect x="84" y="42" width="92" height="22" rx="2" fill="#0f172a" stroke="#64748b" strokeWidth="1.5" />
                      <rect x="76" y="72" width="22" height="9" rx="2" fill="#ef4444" />
                      <rect x="162" y="72" width="22" height="9" rx="2" fill="#ef4444" />
                      <rect x="74" y="96" width="18" height="18" rx="2" fill="#020617" stroke="#38bdf8" strokeWidth="1" />
                      <rect x="168" y="96" width="18" height="18" rx="2" fill="#020617" stroke="#38bdf8" strokeWidth="1" />
                    </g>
                  )}
                </svg>

                <div className="mt-1 z-10">{renderMercosulPlate('rear')}</div>
              </div>

              {anomalia === 'muito_escura' && (
                <div
                  style={{ opacity: nightShadowOpacity }}
                  className="pointer-events-none absolute inset-0 bg-slate-950"
                />
              )}

              <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 z-20 pt-2">
                <span>Leitura OCR Inicial: {ocrPlate}</span>
                <span>Ângulo Traseiro</span>
              </div>
            </div>
          </div>
        )}

        {/* CÂMERA 03: PERFIL LATERAL (APENAS A LEGENDA NO TOPO, SEM RÓTULOS DE RODAGEM OU AVISO DE ILEGÍVEL) */}
        {(focusedCamera === 'all' || focusedCamera === 'side') && (
          <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex flex-col justify-between">
            <div className="bg-slate-900 px-3 py-2 border-b border-slate-800 flex items-center justify-between text-[11px] font-mono text-slate-300">
              <span>CAM-03 · PERFIL LATERAL</span>
              <button
                type="button"
                onClick={() =>
                  setFocusedCamera((c) => (c === 'side' ? 'all' : 'side'))
                }
                className="text-sky-400 hover:underline font-sans"
              >
                {focusedCamera === 'side' ? 'Ver 3 Câmeras' : 'Expandir'}
              </button>
            </div>

            <div
              style={{ filter: cssFilterString }}
              className={`relative ${
                compact ? 'h-56' : 'h-64'
              } bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col justify-between p-4 overflow-hidden`}
            >
              {/* Apenas a Legenda Visual no Topo */}
              <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono z-10">
                <span className="text-emerald-400">
                  ● Solo (Verde) vs ● Erguido (Amarelo)
                </span>
                <span className="text-sky-300">
                  ◯ Aro Único = Simples · ◎ Aro Duplo = Dupla
                </span>
              </div>

              <div className="my-auto w-full relative">
                <svg viewBox="0 0 380 135" className="w-full h-36" fill="none">
                  {/* Linha do Asfalto */}
                  <line
                    x1="8"
                    y1="112"
                    x2="372"
                    y2="112"
                    stroke="#38bdf8"
                    strokeWidth="2"
                  />

                  {record.cat === '00' ? (
                    /* Silhueta de Veículo Isento (sem texto interno) */
                    <g>
                      <path
                        d="M125 90 L155 56 L220 56 L245 90 Z"
                        fill="#1e293b"
                        stroke="#94a3b8"
                        strokeWidth="2"
                      />
                      <rect
                        x="180"
                        y="46"
                        width="16"
                        height="9"
                        rx="3"
                        fill="#ef4444"
                      />
                      {renderWheelLateral(145, 98, false, false, 0)}
                      {renderWheelLateral(230, 98, false, false, 1)}
                    </g>
                  ) : isRodagemSimples ? (
                    /* Silhueta de Veículo de Rodagem Simples (sem texto interno dizendo rodagem simples) */
                    <g>
                      <path
                        d="M36 86 L58 54 L138 54 L162 72 L195 74 L195 94 L36 94 Z"
                        fill="#1e293b"
                        stroke="#94a3b8"
                        strokeWidth="2"
                      />
                      {renderWheelLateral(68, 98, false, false, 0)}
                      {renderWheelLateral(164, 98, false, false, 1)}

                      {totalEixosFisicos >= 3 && (
                        <g>
                          <line
                            x1="195"
                            y1="88"
                            x2="225"
                            y2="88"
                            stroke="#cbd5e1"
                            strokeWidth="3"
                          />
                          <rect
                            x="225"
                            y="60"
                            width="122"
                            height="34"
                            rx="3"
                            fill="#0f172a"
                            stroke="#94a3b8"
                            strokeWidth="1.8"
                          />
                          {totalEixosFisicos === 3 ? (
                            renderWheelLateral(286, 98, false, false, 2)
                          ) : (
                            <>
                              {renderWheelLateral(265, 98, false, false, 2)}
                              {renderWheelLateral(312, 98, false, false, 3)}
                            </>
                          )}
                        </g>
                      )}
                    </g>
                  ) : (
                    /* Silhueta de Veículo de Rodagem Dupla (sem texto interno dizendo rodagem dupla) */
                    <g>
                      <path
                        d="M24 92 L24 48 L56 36 L82 36 L82 92 Z"
                        fill="#0284c7"
                        stroke="#bae6fd"
                        strokeWidth="1.8"
                      />
                      <rect x="30" y="46" width="22" height="18" rx="2" fill="#0f172a" />
                      <rect
                        x="84"
                        y="32"
                        width="276"
                        height="52"
                        rx="3"
                        fill="#1e293b"
                        stroke="#94a3b8"
                        strokeWidth="1.8"
                      />
                      <line x1="125" y1="28" x2="125" y2="84" stroke="#cbd5e1" strokeWidth="2.5" />
                      <line x1="185" y1="28" x2="185" y2="84" stroke="#cbd5e1" strokeWidth="2.5" />
                      <line x1="245" y1="28" x2="245" y2="84" stroke="#cbd5e1" strokeWidth="2.5" />
                      <line x1="305" y1="28" x2="305" y2="84" stroke="#cbd5e1" strokeWidth="2.5" />
                      <line x1="24" y1="90" x2="360" y2="90" stroke="#64748b" strokeWidth="4" />

                      {Array.from({ length: totalEixosFisicos }).map((_, idx) => {
                        const startX = 48;
                        const endX = 342;
                        const step =
                          totalEixosFisicos > 1
                            ? (endX - startX) / (totalEixosFisicos - 1)
                            : 0;
                        const cx = Math.round(startX + idx * step);

                        // Os eixos erguidos (Subcat) fazem parte do total de eixos da Categoria Original (Cat)
                        const lifted =
                          eixosSuspensos > 0 &&
                          idx >=
                            Math.max(1, totalEixosFisicos - 1 - eixosSuspensos) &&
                          idx < totalEixosFisicos - 1;

                        const cy = lifted ? 82 : 98;
                        return renderWheelLateral(cx, cy, lifted, true, idx);
                      })}
                    </g>
                  )}

                  {/* Caso de obstrução física na câmera lateral (sem nenhum texto explicativo) */}
                  {anomalia === 'lateral_obstruida' && (
                    <g>
                      <rect
                        x="14"
                        y="56"
                        width="352"
                        height="62"
                        rx="4"
                        fill="#090d16"
                      />
                      <ellipse
                        cx="115"
                        cy="88"
                        rx="95"
                        ry="34"
                        fill="#1c1917"
                      />
                      <ellipse
                        cx="255"
                        cy="86"
                        rx="105"
                        ry="36"
                        fill="#292524"
                      />
                      <path
                        d="M14 68 Q 110 52, 210 70 T 366 64 L 366 118 L 14 118 Z"
                        fill="#0f172a"
                      />
                    </g>
                  )}
                </svg>
              </div>

              <div className="w-full flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
                <span>Sensor Lateral de Pista</span>
                <span>Preencha Cat e Subcat abaixo</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
