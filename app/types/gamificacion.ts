export type IdInsignia =
  | "lupa_detective"
  | "pluma_oro"
  | "maestro_sintesis"
  | "oido_fino";

export interface InsigniaDefinicion {
  id: IdInsignia;
  nombre: string;
  icono: string;
  descripcion: string;
}

export interface ConfigMision {
  activa: boolean;
  tituloMision: string;
  narrativa: string;
  metaPuntos: number;
}

export interface EstadoEstacionEscudo {
  id: string;
  etiqueta: string;
  tipo: "literal" | "inferencial" | "resumen";
  comprensionIluminada: boolean;
  expresionIluminada: boolean;
  intentosEnEstacion: number;
  superadaAlPrimerIntento: boolean;
  puntosObtenidos: number;
}

export interface EstadoGamificacion {
  puntosTotales: number;
  rachaExpresion: number;
  multiplicadorActual: number;
  insigniasDesbloqueadas: IdInsignia[];
  estaciones: EstadoEstacionEscudo[];
  nivelLector: {
    titulo: string;
    icono: string;
    siguienteUmbral: number;
  };
  ultimoEventoPuntos?: {
    puntosGanados: number;
    motivo: string;
  } | null;
}

export const CATALOGO_INSIGNIAS: Record<IdInsignia, InsigniaDefinicion> = {
  lupa_detective: {
    id: "lupa_detective",
    nombre: "Lupa de Detective",
    icono: "🔎",
    descripcion: "Superar todas las preguntas inferenciales deduciendo pistas del texto.",
  },
  pluma_oro: {
    id: "pluma_oro",
    nombre: "Pluma de Oro",
    icono: "🪶",
    descripcion: "Encadenar 3 o más respuestas seguidas con expresión escrita impecable.",
  },
  maestro_sintesis: {
    id: "maestro_sintesis",
    nombre: "Maestro de la Síntesis",
    icono: "📜",
    descripcion: "Completar el resumen final con dominio en comprensión y redacción.",
  },
  oido_fino: {
    id: "oido_fino",
    nombre: "Oído Fino",
    icono: "🎧",
    descripcion: "Dominar una actividad de comprensión oral a partir de audio o vídeo.",
  },
};