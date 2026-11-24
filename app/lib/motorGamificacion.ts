import {
  EstadoEstacionEscudo,
  EstadoGamificacion,
  IdInsignia,
} from "../types/gamificacion";

interface CorreccionBasica {
  nivel_comprension: string;
  nivel_expresion: string;
}

export function esMitadIluminada(nivel?: string): boolean {
  return nivel === "Conseguido" || nivel === "Altamente Conseguido";
}

export function calcularNivelLector(puntos: number): {
  titulo: string;
  icono: string;
  siguienteUmbral: number;
} {
  if (puntos >= 900) {
    return { titulo: "Erudito/a del Mesta", icono: "👑", siguienteUmbral: 1200 };
  }
  if (puntos >= 600) {
    return { titulo: "Maestro/a de la Palabra", icono: "🏛️", siguienteUmbral: 900 };
  }
  if (puntos >= 300) {
    return { titulo: "Explorador/a Crítico", icono: "🧭", siguienteUmbral: 600 };
  }
  return { titulo: "Aprendiz de Lector", icono: "🌱", siguienteUmbral: 300 };
}

export function calcularMultiplicadorRacha(racha: number): number {
  if (racha >= 4) return 2.0;
  if (racha === 3) return 1.5;
  if (racha === 2) return 1.25;
  return 1.0;
}

export function crearEstadoGamificacionInicial(
  numLiterales: number,
  numInferenciales: number,
  tieneResumen: boolean
): EstadoGamificacion {
  const estaciones: EstadoEstacionEscudo[] = [];

  for (let i = 0; i < numLiterales; i++) {
    estaciones.push({
      id: `L-${i}`,
      etiqueta: `L${i + 1}`,
      tipo: "literal",
      comprensionIluminada: false,
      expresionIluminada: false,
      intentosEnEstacion: 0,
      superadaAlPrimerIntento: false,
      puntosObtenidos: 0,
    });
  }

  for (let i = 0; i < numInferenciales; i++) {
    estaciones.push({
      id: `I-${i}`,
      etiqueta: `I${i + 1}`,
      tipo: "inferencial",
      comprensionIluminada: false,
      expresionIluminada: false,
      intentosEnEstacion: 0,
      superadaAlPrimerIntento: false,
      puntosObtenidos: 0,
    });
  }

  if (tieneResumen) {
    estaciones.push({
      id: "RES-0",
      etiqueta: "Meta",
      tipo: "resumen",
      comprensionIluminada: false,
      expresionIluminada: false,
      intentosEnEstacion: 0,
      superadaAlPrimerIntento: false,
      puntosObtenidos: 0,
    });
  }

  return {
    puntosTotales: 0,
    rachaExpresion: 0,
    multiplicadorActual: 1.0,
    insigniasDesbloqueadas: [],
    estaciones,
    nivelLector: calcularNivelLector(0),
    ultimoEventoPuntos: null,
  };
}

export function actualizarGamificacionTrasEvaluacion(params: {
  estadoAnterior: EstadoGamificacion | null;
  estacionIdEvaluada?: string;
  esActividadOral: boolean;
  correccionesLiterales: (CorreccionBasica | undefined)[];
  correccionesInferenciales: (CorreccionBasica | undefined)[];
  correccionResumen?: CorreccionBasica | null;
  numLiterales: number;
  numInferenciales: number;
  tieneResumen: boolean;
  intentosGlobalesPrevios?: number;
}): EstadoGamificacion {
  const base =
    params.estadoAnterior ||
    crearEstadoGamificacionInicial(
      params.numLiterales,
      params.numInferenciales,
      params.tieneResumen
    );

  let racha = base.rachaExpresion;
  let puntosGanadosTurno = 0;
  let motivoTurno = "";

  const nuevasEstaciones = base.estaciones.map((est) => {
    let corr: CorreccionBasica | undefined | null = null;
    if (est.tipo === "literal") {
      const idx = Number(est.id.split("-")[1]);
      corr = params.correccionesLiterales[idx];
    } else if (est.tipo === "inferencial") {
      const idx = Number(est.id.split("-")[1]);
      corr = params.correccionesInferenciales[idx];
    } else {
      corr = params.correccionResumen;
    }

    if (!corr) return est;

    const compOk = esMitadIluminada(corr.nivel_comprension);
    const exprOk = esMitadIluminada(corr.nivel_expresion);
    const yaEstabaDominada = est.comprensionIluminada && est.expresionIluminada;
    const esEstacionActiva =
      !params.estacionIdEvaluada || params.estacionIdEvaluada === est.id;

    const nuevosIntentos = esEstacionActiva
      ? est.intentosEnEstacion + 1
      : est.intentosEnEstacion;

    if (esEstacionActiva) {
      if (exprOk) {
        racha += 1;
      } else {
        racha = 0;
      }
    }

    let puntosEstacion = est.puntosObtenidos;
    let alPrimerIntento = est.superadaAlPrimerIntento;

    if (!yaEstabaDominada && compOk && exprOk) {
      const mult = calcularMultiplicadorRacha(racha);
      const basePts = 100;
      const esPrimero =
        nuevosIntentos === 1 && (params.intentosGlobalesPrevios ?? 0) === 0;
      const bonoIntento = esPrimero ? 60 : 35;

      // Bono extra por alcanzar "Altamente Conseguido" (+25 por cada dimensión)
      const bonoExcelencia =
        (corr.nivel_comprension === "Altamente Conseguido" ? 25 : 0) +
        (corr.nivel_expresion === "Altamente Conseguido" ? 25 : 0);

      const totalCalculado = Math.round(
        (basePts + bonoIntento + bonoExcelencia) * mult
      );

      puntosEstacion += totalCalculado;
      puntosGanadosTurno += totalCalculado;
      alPrimerIntento = esPrimero;

      motivoTurno = esPrimero
        ? `¡Escudo completo a la primera en ${est.etiqueta}! (+${totalCalculado} pts · x${mult})`
        : `¡Autocorrección lograda en ${est.etiqueta}! (+${totalCalculado} pts · x${mult})`;
    } else if (
      esEstacionActiva &&
      !yaEstabaDominada &&
      (compOk || exprOk) &&
      puntosEstacion === 0
    ) {
      puntosEstacion += 25;
      puntosGanadosTurno += 25;
      motivoTurno = `Mitad del escudo iluminada en ${est.etiqueta} (+25 pts)`;
    }

    return {
      ...est,
      comprensionIluminada: compOk,
      expresionIluminada: exprOk,
      intentosEnEstacion: nuevosIntentos,
      superadaAlPrimerIntento: alPrimerIntento,
      puntosObtenidos: puntosEstacion,
    };
  });

  const puntosTotales = base.puntosTotales + puntosGanadosTurno;
  const multiplicadorActual = calcularMultiplicadorRacha(racha);

  const insignias = new Set<IdInsignia>(base.insigniasDesbloqueadas);

  const inferenciales = nuevasEstaciones.filter((e) => e.tipo === "inferencial");
  if (
    inferenciales.length > 0 &&
    inferenciales.every((e) => e.comprensionIluminada && e.expresionIluminada)
  ) {
    insignias.add("lupa_detective");
  }

  if (racha >= 3) {
    insignias.add("pluma_oro");
  }

  const resumenEst = nuevasEstaciones.find((e) => e.tipo === "resumen");
  if (resumenEst && resumenEst.comprensionIluminada && resumenEst.expresionIluminada) {
    insignias.add("maestro_sintesis");
  }

  const todasDominadas =
    nuevasEstaciones.length > 0 &&
    nuevasEstaciones.every((e) => e.comprensionIluminada && e.expresionIluminada);
  if (params.esActividadOral && todasDominadas) {
    insignias.add("oido_fino");
  }

  return {
    puntosTotales,
    rachaExpresion: racha,
    multiplicadorActual,
    insigniasDesbloqueadas: Array.from(insignias),
    estaciones: nuevasEstaciones,
    nivelLector: calcularNivelLector(puntosTotales),
    ultimoEventoPuntos:
      puntosGanadosTurno > 0
        ? { puntosGanados: puntosGanadosTurno, motivo: motivoTurno }
        : base.ultimoEventoPuntos || null,
  };
}

export function reconstruirGamificacionDesdeEvaluacion(params: {
  esActividadOral: boolean;
  correccionesLiterales: (CorreccionBasica | undefined)[];
  correccionesInferenciales: (CorreccionBasica | undefined)[];
  correccionResumen?: CorreccionBasica | null;
  numLiterales: number;
  numInferenciales: number;
  tieneResumen: boolean;
  intentosGlobalesPrevios?: number;
}): EstadoGamificacion {
  return actualizarGamificacionTrasEvaluacion({
    estadoAnterior: null,
    esActividadOral: params.esActividadOral,
    correccionesLiterales: params.correccionesLiterales,
    correccionesInferenciales: params.correccionesInferenciales,
    correccionResumen: params.correccionResumen,
    numLiterales: params.numLiterales,
    numInferenciales: params.numInferenciales,
    tieneResumen: params.tieneResumen,
    intentosGlobalesPrevios: params.intentosGlobalesPrevios,
  });
}