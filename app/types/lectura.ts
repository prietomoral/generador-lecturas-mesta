export interface Pregunta {
  pregunta: string;
  respuesta: string;
}

export interface ResultadoLectura {
  titulo: string;
  texto: string;
  preguntas_literales: Pregunta[];
  preguntas_inferenciales: Pregunta[];
}

export interface FormLectura {
  edad: string;
  tipoTextoSelect: string;
  tipoTextoOtro: string;
  dificultad: string;
  extension: string;
  tematica: string;
  saberes: string;
  numLiterales: number;
  numInferenciales: number;
}

export const TEMAS_ALEATORIOS = [
  "La biodiversidad de la dehesa extremeña y el Parque Nacional de Monfragüe",
  "Un misterio nocturno en la biblioteca del instituto",
  "Cómo funciona la inteligencia artificial en nuestra vida cotidiana",
  "El viaje de una gota de agua desde el río Guadiana hasta el océano",
  "La historia del teatro romano de Mérida y los espectáculos de la antigüedad",
  "El impacto de las redes sociales y la huella digital en la adolescencia",
  "La primera expedición científica a la Antártida",
  "El secreto de las abejas y su papel en los ecosistemas",
  "Una carta encontrada dentro de un libro antiguo en Cáceres",
  "Energías renovables: cómo el sol y el viento generan electricidad",
  "El origen de los Juegos Olímpicos y los valores del deporte",
  "Un día en la vida de un adolescente en el año 2126",
  "La importancia del sueño y el descanso para el cerebro",
  "Los grandes inventos que cambiaron la historia de la comunicación",
  "La ruta de la trashumancia por las cañadas reales de Extremadura",
];

export function obtenerTemaAleatorio(excluir?: string): string {
  const disponibles = excluir
    ? TEMAS_ALEATORIOS.filter((t) => t !== excluir)
    : TEMAS_ALEATORIOS;
  const indice = Math.floor(Math.random() * disponibles.length);
  return disponibles[indice];
}