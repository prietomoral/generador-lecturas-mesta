export interface Pregunta {
  pregunta: string;
  respuesta: string;
}

export type MediaTipo = "youtube" | "video" | "audio";

export interface ResultadoLectura {
  titulo: string;
  texto: string;
  preguntas_literales: Pregunta[];
  preguntas_inferenciales: Pregunta[];
  mediaUrl?: string;
  mediaTipo?: MediaTipo;
}

export interface FormLectura {
  modoOrigen?: "generar" | "subir" | "oral";
  tituloPropio?: string;
  textoPropio?: string;
  mediaUrl?: string;
  mediaTipo?: MediaTipo;
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

export const TEMAS_BASE = [
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
  "El descubrimiento de la penicilina y las bacterias resistentes",
  "La vida cotidiana en un castillo medieval de la Raya extremeña",
  "Cómo se orientan las aves migratorias miles de kilómetros sin brújula",
  "El enigma de los manuscritos perdidos de Alejandría",
  "La exploración de las profundidades marinas y la bioluminiscencia",
  "El comercio justo, el consumo responsable y la economía circular",
  "La historia secreta del chocolate desde Mesoamérica hasta el Monasterio de Yuste",
  "Cómo se entrenan los astronautas para vivir en gravedad cero",
  "Un apagón tecnológico de 48 horas en una ciudad moderna",
  "La arquitectura bioclimática y las ciudades verdes del futuro",
  "Mujeres científicas que cambiaron la historia y fueron olvidadas",
  "El lenguaje silencioso de los bosques: cómo se comunican los árboles",
  "La evolución de los videojuegos desde los píxeles hasta la realidad virtual",
  "El arte rupestre en las cuevas de Maltravieso y los primeros pobladores",
  "Cómo detectar noticias falsas (fake news) y bulos en internet",
  "La música como herramienta para entrenar la memoria y las emociones",
  "Un diario de viaje por la Vía de la Plata en bicicleta",
  "El fenómeno de los volcanes submarinos y la formación de nuevas islas",
  "La convivencia entre la ganadería tradicional y el lobo ibérico",
  "El funcionamiento del cerebro cuando aprendemos un idioma nuevo",
  "Un concurso de robótica escolar con un fallo inesperado en la final",
  "La historia del ferrocarril en Extremadura y su impacto en los pueblos",
  "Los microplásticos en los océanos y las soluciones científicas actuales",
  "Una entrevista imaginaria con Miguel de Cervantes en el siglo XXI",
  "El ciclo del carbono y el papel de los bosques mediterráneos",
];
export const TEMAS_ALEATORIOS = TEMAS_BASE;

const SUJETOS_COMBINATORIOS = [
  "Un grupo de estudiantes de ESO",
  "Una joven investigadora",
  "Un cronista de viajes",
  "Un equipo de arqueólogos",
  "Dos hermanos curiosos",
  "Una bióloga de campo",
  "Un inventor aficionado",
  "Una periodista científica",
];

const ESCENARIOS_COMBINATORIOS = [
  "en un observatorio astronómico de Extremadura",
  "durante una tormenta solar inesperada",
  "en una reserva natural protegida",
  "en el archivo histórico de una pequeña localidad",
  "en una estación científica en medio del océano",
  "durante unas excavaciones romanas",
  "en un laboratorio de energías limpias",
  "en un pueblo que decide vivir una semana sin pantallas",
];

const RETOS_COMBINATORIOS = [
  "descubren un patrón oculto que cambia lo que se creía hasta ahora",
  "deben resolver un problema medioambiental antes de que acabe el verano",
  "encuentran un objeto antiguo con un mensaje cifrado",
  "analizan cómo la tecnología puede ayudar a conservar el patrimonio",
  "se enfrentan a un dilema ético sobre el uso de los datos y la privacidad",
  "investigan la desaparición de una especie autóctona",
  "reconstruyen una historia olvidada a partir de pistas cotidianas",
  "diseñan un proyecto sostenible para mejorar la vida de su comunidad",
];

const STORAGE_KEY_USADOS = "lecturas_temas_usados_v1";

function generarBancoCompleto(): string[] {
  const combinados: string[] = [...TEMAS_BASE];

  for (const s of SUJETOS_COMBINATORIOS) {
    for (const e of ESCENARIOS_COMBINATORIOS) {
      for (const r of RETOS_COMBINATORIOS) {
        combinados.push(`${s} ${e} ${r}`);
      }
    }
  }
  return combinados;
}

const BANCO_TEMAS = generarBancoCompleto();
const usadosEnMemoria = new Set<string>();

export function obtenerTemaAleatorio(excluir?: string): string {
  if (excluir) {
    usadosEnMemoria.add(excluir);
  }

  let usadosPersistidos: string[] = [];
  if (typeof window !== "undefined") {
    try {
      const guardado = window.localStorage.getItem(STORAGE_KEY_USADOS);
      if (guardado) {
        usadosPersistidos = JSON.parse(guardado);
        usadosPersistidos.forEach((t) => usadosEnMemoria.add(t));
      }
    } catch {
      // Ignorar errores de almacenamiento privado
    }
  }

  let disponibles = BANCO_TEMAS.filter((t) => !usadosEnMemoria.has(t));

  // Si ya se han usado todos los temas del banco, reiniciamos el historial evitando solo el actual
  if (disponibles.length === 0) {
    usadosEnMemoria.clear();
    if (excluir) usadosEnMemoria.add(excluir);
    disponibles = BANCO_TEMAS.filter((t) => t !== excluir);
  }

  const elegido = disponibles[Math.floor(Math.random() * disponibles.length)];
  usadosEnMemoria.add(elegido);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        STORAGE_KEY_USADOS,
        JSON.stringify(Array.from(usadosEnMemoria))
      );
    } catch {
      // Ignorar errores de cuota
    }
  }

  return elegido;
}