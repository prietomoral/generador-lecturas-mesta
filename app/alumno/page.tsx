"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../lib/supabase";

const MAX_INTENTOS = 10;

const NIVELES_ESCALA = [
  "No conseguido",
  "Bajamente Conseguido",
  "Conseguido",
  "Altamente Conseguido",
];

function esNivelDominado(nivel?: string): boolean {
  return nivel === "Conseguido" || nivel === "Altamente Conseguido";
}

function calcularMediaNiveles(nivelComp: string, nivelExpr: string): string {
  const idxComp = Math.max(0, NIVELES_ESCALA.indexOf(nivelComp));
  const idxExpr = Math.max(0, NIVELES_ESCALA.indexOf(nivelExpr));
  const mediaIdx = Math.floor((idxComp + idxExpr) / 2);
  return NIVELES_ESCALA[mediaIdx] || "No conseguido";
}

function calcularNivelGlobalActividad(
  totalLiterales: number,
  totalInferenciales: number,
  tieneResumen: boolean,
  corrLit: CorreccionItem[],
  corrInf: CorreccionItem[],
  corrRes?: CorreccionItem | null
): { compGlobal: string; exprGlobal: string; mediaGlobal: string } {
  const items: (CorreccionItem | undefined | null)[] = [];

  for (let i = 0; i < totalLiterales; i++) items.push(corrLit[i]);
  for (let i = 0; i < totalInferenciales; i++) items.push(corrInf[i]);
  if (tieneResumen) items.push(corrRes);

  if (items.length === 0) {
    return {
      compGlobal: "No conseguido",
      exprGlobal: "No conseguido",
      mediaGlobal: "No conseguido",
    };
  }

  let sumaComp = 0;
  let sumaExpr = 0;

  for (const item of items) {
    const idxC = item ? Math.max(0, NIVELES_ESCALA.indexOf(item.nivel_comprension)) : 0;
    const idxE = item ? Math.max(0, NIVELES_ESCALA.indexOf(item.nivel_expresion)) : 0;
    sumaComp += idxC;
    sumaExpr += idxE;
  }

  const avgCompIdx = Math.floor(sumaComp / items.length);
  const avgExprIdx = Math.floor(sumaExpr / items.length);

  const compGlobal = NIVELES_ESCALA[avgCompIdx] || "No conseguido";
  const exprGlobal = NIVELES_ESCALA[avgExprIdx] || "No conseguido";
  const mediaGlobal = calcularMediaNiveles(compGlobal, exprGlobal);

  return { compGlobal, exprGlobal, mediaGlobal };
}

interface Pregunta {
  pregunta: string;
  respuesta: string;
}

interface Actividad {
  codigo: string;
  titulo: string;
  texto: string;
  edad: string;
  pdf_url?: string | null;
  media_url?: string | null;
  media_tipo?: "youtube" | "video" | "audio" | null;
  preguntas_literales: Pregunta[];
  preguntas_inferenciales: Pregunta[];
  resumen_min_palabras?: number | null;
  resumen_modelo?: string | null;
  bloqueo_secuencial?: boolean | null;
}

interface CorreccionItem {
  nivel_comprension: string;
  nivel_expresion: string;
  nivel_media?: string;
  estado: string;
  pista_comprension: string;
  consejo_redaccion: string;
}

interface ResultadoCorreccion {
  nivel_global: string;
  nivel_comprension_global: string;
  nivel_expresion_global: string;
  comentario_general: string;
  correcciones_literales: CorreccionItem[];
  correcciones_inferenciales: CorreccionItem[];
  correccion_resumen?: CorreccionItem | null;
  progreso_pasos?: {
    dominados: number;
    total: number;
    paso_actual_etiqueta: string;
  };
}

type PasoSecuencial =
  | { tipo: "literal"; indice: number; pregunta: Pregunta; etiqueta: string }
  | { tipo: "inferencial"; indice: number; pregunta: Pregunta; etiqueta: string }
  | { tipo: "resumen"; etiqueta: string };

function contarPalabras(texto: string): number {
  const limpio = (texto || "").trim();
  if (!limpio) return 0;
  return limpio.split(/\s+/).filter(Boolean).length;
}

function VistaAlumnoContenido() {
  const searchParams = useSearchParams();
  const [codigo, setCodigo] = useState(searchParams.get("codigo") || "");
  const [nombreAlumno, setNombreAlumno] = useState("");
  const [actividad, setActividad] = useState<Actividad | null>(null);
  const [respLiterales, setRespLiterales] = useState<string[]>([]);
  const [respInferenciales, setRespInferenciales] = useState<string[]>([]);
  const [respResumen, setRespResumen] = useState("");
  const [evaluacion, setEvaluacion] = useState<ResultadoCorreccion | null>(null);
  const [intentos, setIntentos] = useState(0);
  const [superada, setSuperada] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [corrigiendoPaso, setCorrigiendoPaso] = useState(false);
  const [enviandoGlobal, setEnviandoGlobal] = useState(false);
  const [vistaLectura, setVistaLectura] = useState<"original" | "texto">("original");
  const [avisoPegado, setAvisoPegado] = useState<string | null>(null);

  const [modoSecuencial, setModoSecuencial] = useState(true);
  const [pasoActual, setPasoActual] = useState(0);

  const bloqueoSecuencial = actividad?.bloqueo_secuencial ?? true;
  const sinIntentos = intentos >= MAX_INTENTOS && !superada;
  const bloqueado = superada || sinIntentos;
  const ocupado = corrigiendoPaso || enviandoGlobal;

  const minPalabrasResumen = Number(actividad?.resumen_min_palabras) || 0;
  const requiereResumen = minPalabrasResumen > 0;
  const palabrasActualesResumen = contarPalabras(respResumen);
  const resumenCumpleMinimo =
    !requiereResumen || palabrasActualesResumen >= minPalabrasResumen;
  const palabrasFaltantes = Math.max(0, minPalabrasResumen - palabrasActualesResumen);

  const pasosSecuenciales: PasoSecuencial[] = actividad
    ? [
        ...(actividad.preguntas_literales || []).map((p, i) => ({
          tipo: "literal" as const,
          indice: i,
          pregunta: p,
          etiqueta: `Literal L${i + 1}`,
        })),
        ...(actividad.preguntas_inferenciales || []).map((p, i) => ({
          tipo: "inferencial" as const,
          indice: i,
          pregunta: p,
          etiqueta: `Inferencial I${i + 1}`,
        })),
        ...(requiereResumen
          ? [{ tipo: "resumen" as const, etiqueta: "Resumen final" }]
          : []),
      ]
    : [];

  const obtenerCorreccionPaso = (
    evalData: ResultadoCorreccion | null,
    paso?: PasoSecuencial
  ): CorreccionItem | null => {
    if (!paso || !evalData) return null;
    if (paso.tipo === "literal") {
      return evalData.correcciones_literales?.[paso.indice] || null;
    }
    if (paso.tipo === "inferencial") {
      return evalData.correcciones_inferenciales?.[paso.indice] || null;
    }
    return evalData.correccion_resumen || null;
  };

  const estaPasoDominado = (
    evalData: ResultadoCorreccion | null,
    paso?: PasoSecuencial
  ): boolean => {
    const corr = obtenerCorreccionPaso(evalData, paso);
    return Boolean(
      corr &&
        esNivelDominado(corr.nivel_comprension) &&
        esNivelDominado(corr.nivel_expresion)
    );
  };

  const maxPasoDesbloqueado = (() => {
    if (!bloqueoSecuencial) {
      return Math.max(0, pasosSecuenciales.length - 1);
    }
    for (let i = 0; i < pasosSecuenciales.length; i++) {
      if (!estaPasoDominado(evaluacion, pasosSecuenciales[i])) {
        return i;
      }
    }
    return Math.max(0, pasosSecuenciales.length - 1);
  })();

  const todosLosPasosDominados =
    pasosSecuenciales.length > 0 &&
    pasosSecuenciales.every((p) => estaPasoDominado(evaluacion, p));

  const todasLasRespuestasRellenas =
    (actividad?.preguntas_literales || []).every((_, i) =>
      Boolean(respLiterales[i]?.trim())
    ) &&
    (actividad?.preguntas_inferenciales || []).every((_, i) =>
      Boolean(respInferenciales[i]?.trim())
    ) &&
    (!requiereResumen || resumenCumpleMinimo);

  const listoParaEntregar = bloqueoSecuencial
    ? todosLosPasosDominados
    : todasLasRespuestasRellenas;

  const indicePasoSeguro = Math.min(
    pasoActual,
    maxPasoDesbloqueado,
    Math.max(0, pasosSecuenciales.length - 1)
  );
  const pasoActivo = pasosSecuenciales[indicePasoSeguro];
  const corrPasoActivo = obtenerCorreccionPaso(evaluacion, pasoActivo);
  const pasoActivoDominado = estaPasoDominado(evaluacion, pasoActivo);
  const esUltimoPaso = indicePasoSeguro >= pasosSecuenciales.length - 1;

  const totalLit = (actividad?.preguntas_literales || []).length;
  const totalInf = (actividad?.preguntas_inferenciales || []).length;
  const indiceGlobalLiteral = (idx: number) => idx;
  const indiceGlobalInferencial = (idx: number) => totalLit + idx;
  const indiceGlobalResumen = totalLit + totalInf;
  const resumenDesbloqueado =
    !bloqueoSecuencial || indiceGlobalResumen <= maxPasoDesbloqueado;

  const parrafosTexto = (actividad?.texto || "")
    .replace(/\\n/g, "\n")
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const bloquearPegado = (
    e: React.ClipboardEvent<HTMLTextAreaElement> | React.DragEvent<HTMLTextAreaElement>
  ) => {
    e.preventDefault();
    setAvisoPegado(
      "🚫 No está permitido pegar texto. Redacta la respuesta con tus propias palabras."
    );
    setTimeout(() => setAvisoPegado(null), 4500);
  };

  const entrarActividad = async (e: React.FormEvent) => {
    e.preventDefault();
    const codLimpio = codigo.trim().toUpperCase();
    const nomLimpio = nombreAlumno.trim();
    if (!codLimpio || !nomLimpio) return;

    setCargando(true);
    try {
      const { data: act, error } = await supabase
        .from("actividades")
        .select("*")
        .eq("codigo", codLimpio)
        .single();

      if (error || !act) {
        alert("No existe ninguna actividad con ese código.");
        return;
      }

      const actTipada = act as Actividad;
      const esBloqueoActivo = actTipada.bloqueo_secuencial ?? true;
      setActividad(actTipada);
      setModoSecuencial(esBloqueoActivo);

      const { data: entregaPrevia } = await supabase
        .from("entregas")
        .select("*")
        .eq("actividad_codigo", codLimpio)
        .eq("nombre_alumno", nomLimpio)
        .maybeSingle();

      if (entregaPrevia) {
        setRespLiterales(entregaPrevia.respuestas_literales || []);
        setRespInferenciales(entregaPrevia.respuestas_inferenciales || []);
        setRespResumen(entregaPrevia.respuesta_resumen || "");
        const evalPrevia: ResultadoCorreccion | null =
          entregaPrevia.ultima_evaluacion || null;
        setEvaluacion(evalPrevia);
        setIntentos(entregaPrevia.intentos || 0);
        setSuperada(Boolean(entregaPrevia.superada));

        if (evalPrevia && esBloqueoActivo) {
          const litLen = (actTipada.preguntas_literales || []).length;
          const infLen = (actTipada.preguntas_inferenciales || []).length;
          let primerPendiente = 0;
          let encontrado = false;

          for (let i = 0; i < litLen; i++) {
            const c = evalPrevia.correcciones_literales?.[i];
            if (
              !c ||
              !esNivelDominado(c.nivel_comprension) ||
              !esNivelDominado(c.nivel_expresion)
            ) {
              primerPendiente = i;
              encontrado = true;
              break;
            }
          }
          if (!encontrado) {
            for (let j = 0; j < infLen; j++) {
              const c = evalPrevia.correcciones_inferenciales?.[j];
              if (
                !c ||
                !esNivelDominado(c.nivel_comprension) ||
                !esNivelDominado(c.nivel_expresion)
              ) {
                primerPendiente = litLen + j;
                encontrado = true;
                break;
              }
            }
          }
          if (!encontrado && (Number(actTipada.resumen_min_palabras) || 0) > 0) {
            primerPendiente = litLen + infLen;
          }
          setPasoActual(primerPendiente);
        } else {
          setPasoActual(0);
        }
      } else {
        setRespLiterales((act.preguntas_literales || []).map(() => ""));
        setRespInferenciales((act.preguntas_inferenciales || []).map(() => ""));
        setRespResumen("");
        setPasoActual(0);
      }
    } finally {
      setCargando(false);
    }
  };

  // 1) Comprobar un paso individual SIN gastar intentos globales
  const comprobarPasoIndividual = async (pasoForzado?: PasoSecuencial) => {
    if (!actividad || bloqueado || ocupado) return;

    const pasoObjetivo =
      pasoForzado ||
      (modoSecuencial ? pasoActivo : pasosSecuenciales[maxPasoDesbloqueado]);

    if (!pasoObjetivo) return;

    if (pasoObjetivo.tipo === "literal" && !respLiterales[pasoObjetivo.indice]?.trim()) {
      alert(
        `Debes responder primero a la pregunta L${pasoObjetivo.indice + 1} antes de comprobarla.`
      );
      return;
    }
    if (
      pasoObjetivo.tipo === "inferencial" &&
      !respInferenciales[pasoObjetivo.indice]?.trim()
    ) {
      alert(
        `Debes responder primero a la pregunta I${pasoObjetivo.indice + 1} antes de comprobarla.`
      );
      return;
    }
    if (pasoObjetivo.tipo === "resumen" && !resumenCumpleMinimo) {
      alert(
        `El resumen es obligatorio y debe tener al menos ${minPalabrasResumen} palabras (llevas ${palabrasActualesResumen}).`
      );
      return;
    }

    setCorrigiendoPaso(true);

    try {
      const payload = {
        titulo: actividad.titulo,
        texto: actividad.texto,
        edad: actividad.edad,
        intentoActual: 1,
        preguntas_literales:
          pasoObjetivo.tipo === "literal" ? [pasoObjetivo.pregunta] : [],
        preguntas_inferenciales:
          pasoObjetivo.tipo === "inferencial" ? [pasoObjetivo.pregunta] : [],
        respuestasAlumnoLiterales:
          pasoObjetivo.tipo === "literal" ? [respLiterales[pasoObjetivo.indice] || ""] : [],
        respuestasAlumnoInferenciales:
          pasoObjetivo.tipo === "inferencial"
            ? [respInferenciales[pasoObjetivo.indice] || ""]
            : [],
        resumenMinPalabras: pasoObjetivo.tipo === "resumen" ? minPalabrasResumen : 0,
        resumenModelo: pasoObjetivo.tipo === "resumen" ? actividad.resumen_modelo || "" : "",
        respuestaAlumnoResumen: pasoObjetivo.tipo === "resumen" ? respResumen : undefined,
      };

      const res = await fetch("/api/corregir-lectura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data: ResultadoCorreccion & { error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error al evaluar el paso");

      const base: ResultadoCorreccion = evaluacion || {
        nivel_global: "No conseguido",
        nivel_comprension_global: "No conseguido",
        nivel_expresion_global: "No conseguido",
        comentario_general: data.comentario_general,
        correcciones_literales: [],
        correcciones_inferenciales: [],
        correccion_resumen: null,
      };

      const nuevasLit = [...(base.correcciones_literales || [])];
      const nuevasInf = [...(base.correcciones_inferenciales || [])];
      let nuevoRes = base.correccion_resumen || null;

      if (pasoObjetivo.tipo === "literal" && data.correcciones_literales?.[0]) {
        nuevasLit[pasoObjetivo.indice] = data.correcciones_literales[0];
      } else if (
        pasoObjetivo.tipo === "inferencial" &&
        data.correcciones_inferenciales?.[0]
      ) {
        nuevasInf[pasoObjetivo.indice] = data.correcciones_inferenciales[0];
      } else if (pasoObjetivo.tipo === "resumen" && data.correccion_resumen) {
        nuevoRes = data.correccion_resumen;
      }

      const { compGlobal, exprGlobal, mediaGlobal } = calcularNivelGlobalActividad(
        totalLit,
        totalInf,
        requiereResumen,
        nuevasLit,
        nuevasInf,
        nuevoRes
      );

      let pasosDominados = 0;
      (actividad.preguntas_literales || []).forEach((_, i) => {
        const c = nuevasLit[i];
        if (c && esNivelDominado(c.nivel_comprension) && esNivelDominado(c.nivel_expresion)) {
          pasosDominados++;
        }
      });
      (actividad.preguntas_inferenciales || []).forEach((_, i) => {
        const c = nuevasInf[i];
        if (c && esNivelDominado(c.nivel_comprension) && esNivelDominado(c.nivel_expresion)) {
          pasosDominados++;
        }
      });
      if (
        requiereResumen &&
        nuevoRes &&
        esNivelDominado(nuevoRes.nivel_comprension) &&
        esNivelDominado(nuevoRes.nivel_expresion)
      ) {
        pasosDominados++;
      }

      const totalPasos = pasosSecuenciales.length;
      const siguientePasoIdx = Math.min(pasosDominados, Math.max(0, totalPasos - 1));
      const etiquetaPasoActual = !bloqueoSecuencial
        ? "Modo avance libre"
        : pasosDominados >= totalPasos
        ? "Listo para entregar"
        : pasosSecuenciales[siguientePasoIdx]?.etiqueta || "En curso";

      const evaluacionActualizada: ResultadoCorreccion = {
        ...base,
        nivel_global: mediaGlobal,
        nivel_comprension_global: compGlobal,
        nivel_expresion_global: exprGlobal,
        correcciones_literales: nuevasLit,
        correcciones_inferenciales: nuevasInf,
        correccion_resumen: nuevoRes,
        progreso_pasos: {
          dominados: pasosDominados,
          total: totalPasos,
          paso_actual_etiqueta: etiquetaPasoActual,
        },
      };

      await supabase.from("entregas").upsert(
        {
          actividad_codigo: actividad.codigo,
          nombre_alumno: nombreAlumno.trim(),
          intentos,
          nivel_logro: mediaGlobal,
          nivel_comprension: compGlobal,
          nivel_expresion: exprGlobal,
          superada: false,
          respuestas_literales: respLiterales,
          respuestas_inferenciales: respInferenciales,
          respuesta_resumen: requiereResumen ? respResumen : null,
          ultima_evaluacion: evaluacionActualizada,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "actividad_codigo,nombre_alumno" }
      );

      setEvaluacion(evaluacionActualizada);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado.";
      alert("Error: " + msg);
    } finally {
      setCorrigiendoPaso(false);
    }
  };

  // 2) Entregar actividad completa al profesor (gasta 1 intento global de los 10 disponibles)
  const entregarActividadCompleta = async () => {
    if (!actividad || bloqueado || ocupado) return;

    if (bloqueoSecuencial && !todosLosPasosDominados) {
      alert(
        "Debes completar y dominar todos los pasos en orden antes de realizar la entrega final."
      );
      return;
    }

    if (!bloqueoSecuencial && !todasLasRespuestasRellenas) {
      alert("Responde a todas las preguntas (y al resumen si lo hay) antes de entregar.");
      return;
    }

    if (requiereResumen && !resumenCumpleMinimo) {
      alert(
        `El resumen es obligatorio y debe tener al menos ${minPalabrasResumen} palabras.`
      );
      return;
    }

    setEnviandoGlobal(true);
    const nuevoIntento = intentos + 1;

    try {
      const res = await fetch("/api/corregir-lectura", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titulo: actividad.titulo,
          texto: actividad.texto,
          edad: actividad.edad,
          intentoActual: nuevoIntento,
          preguntas_literales: actividad.preguntas_literales,
          preguntas_inferenciales: actividad.preguntas_inferenciales,
          respuestasAlumnoLiterales: respLiterales,
          respuestasAlumnoInferenciales: respInferenciales,
          resumenMinPalabras: minPalabrasResumen,
          resumenModelo: actividad.resumen_modelo || "",
          respuestaAlumnoResumen: requiereResumen ? respResumen : undefined,
        }),
      });

      const data: ResultadoCorreccion & { error?: string } = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Error al evaluar entrega");

      const compGlobal = data.nivel_comprension_global || data.nivel_global;
      const exprGlobal = data.nivel_expresion_global || data.nivel_global;
      const mediaGlobal = calcularMediaNiveles(compGlobal, exprGlobal);

      const estaSuperada = esNivelDominado(compGlobal) && esNivelDominado(exprGlobal);
      const totalPasos = pasosSecuenciales.length;

      let dominadosFinal = 0;
      (actividad.preguntas_literales || []).forEach((_, i) => {
        const c = data.correcciones_literales?.[i];
        if (c && esNivelDominado(c.nivel_comprension) && esNivelDominado(c.nivel_expresion)) {
          dominadosFinal++;
        }
      });
      (actividad.preguntas_inferenciales || []).forEach((_, i) => {
        const c = data.correcciones_inferenciales?.[i];
        if (c && esNivelDominado(c.nivel_comprension) && esNivelDominado(c.nivel_expresion)) {
          dominadosFinal++;
        }
      });
      if (
        requiereResumen &&
        data.correccion_resumen &&
        esNivelDominado(data.correccion_resumen.nivel_comprension) &&
        esNivelDominado(data.correccion_resumen.nivel_expresion)
      ) {
        dominadosFinal++;
      }

      const evaluacionFinal: ResultadoCorreccion = {
        ...data,
        nivel_global: mediaGlobal,
        nivel_comprension_global: compGlobal,
        nivel_expresion_global: exprGlobal,
        progreso_pasos: {
          dominados: bloqueoSecuencial ? totalPasos : dominadosFinal,
          total: totalPasos,
          paso_actual_etiqueta: estaSuperada ? "Completada" : "Revisión final",
        },
      };

      const { error: errorUpsert } = await supabase.from("entregas").upsert(
        {
          actividad_codigo: actividad.codigo,
          nombre_alumno: nombreAlumno.trim(),
          intentos: nuevoIntento,
          nivel_logro: mediaGlobal,
          nivel_comprension: compGlobal,
          nivel_expresion: exprGlobal,
          superada: estaSuperada,
          respuestas_literales: respLiterales,
          respuestas_inferenciales: respInferenciales,
          respuesta_resumen: requiereResumen ? respResumen : null,
          ultima_evaluacion: evaluacionFinal,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "actividad_codigo,nombre_alumno" }
      );

      if (errorUpsert) {
        console.error("Error guardando entrega final en Supabase:", errorUpsert.message);
      }

      setIntentos(nuevoIntento);
      setEvaluacion(evaluacionFinal);
      setSuperada(estaSuperada);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error inesperado.";
      alert("Error: " + msg);
    } finally {
      setEnviandoGlobal(false);
    }
  };

  const estiloNivel = (nivel: string) => {
    switch (nivel) {
      case "Altamente Conseguido":
        return "bg-emerald-100 text-emerald-950 border-emerald-400";
      case "Conseguido":
        return "bg-teal-100 text-teal-950 border-teal-400";
      case "Bajamente Conseguido":
        return "bg-amber-100 text-amber-950 border-amber-400";
      default:
        return "bg-rose-100 text-rose-950 border-rose-400";
    }
  };

  const renderBloqueFeedbackEstructurado = (
    corr: CorreccionItem,
    subtituloComp: string,
    subtituloExpr: string
  ) => {
    const mediaItem =
      corr.nivel_media ||
      calcularMediaNiveles(corr.nivel_comprension, corr.nivel_expresion);

    return (
      <div className="space-y-2.5 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="bg-blue-50/80 border border-blue-200 rounded-lg p-3 flex flex-col justify-between gap-2.5 text-blue-950">
            <div className="text-xs leading-relaxed">
              <strong className="block text-blue-900 mb-1">
                🧭 {subtituloComp}
              </strong>
              <p>{corr.pista_comprension}</p>
            </div>
            <div className="pt-2 border-t border-blue-200/80 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-blue-900">
                Indicador de logro:
              </span>
              <span
                className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                  corr.nivel_comprension
                )}`}
              >
                {corr.nivel_comprension}
              </span>
            </div>
          </div>

          <div className="bg-indigo-50/80 border border-indigo-200 rounded-lg p-3 flex flex-col justify-between gap-2.5 text-indigo-950">
            <div className="text-xs leading-relaxed">
              <strong className="block text-indigo-900 mb-1">
                ✍️ {subtituloExpr}
              </strong>
              <p>{corr.consejo_redaccion}</p>
            </div>
            <div className="pt-2 border-t border-indigo-200/80 flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-indigo-900">
                Indicador de logro:
              </span>
              <span
                className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${estiloNivel(
                  corr.nivel_expresion
                )}`}
              >
                {corr.nivel_expresion}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-slate-100/90 border border-slate-300 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-bold text-slate-700">
            ⚖️ Valoración media de la respuesta (Comprensión + Expresión):
          </span>
          <span
            className={`text-xs font-extrabold px-3 py-0.5 rounded-full border ${estiloNivel(
              mediaItem
            )}`}
          >
            {mediaItem}
          </span>
        </div>
      </div>
    );
  };

  if (!actividad) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <form
          onSubmit={entrarActividad}
          className="bg-white max-w-md w-full rounded-2xl shadow-lg border border-slate-200 p-6 space-y-4"
        >
          <div className="space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 block">
              DialectIA · IESO Sierra la Mesta
            </span>
            <span className="text-xs text-slate-500 block">
              Entrenador de Competencia Lingüística — Programa NEXO (Educalectura-Educalem)
            </span>
          </div>
          <h1 className="text-xl font-extrabold text-slate-900">
            Acceder a la actividad de clase
          </h1>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Código de la actividad
            </label>
            <input
              type="text"
              required
              placeholder="Ej: MESTA-482"
              value={codigo}
              onChange={(e) => setCodigo(e.target.value.toUpperCase())}
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm uppercase font-mono"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              Tu nombre y apellidos
            </label>
            <input
              type="text"
              required
              placeholder="Ej: María García López"
              value={nombreAlumno}
              onChange={(e) => setNombreAlumno(e.target.value)}
              className="w-full border border-slate-300 rounded-xl px-3.5 py-2.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={cargando}
            className="w-full bg-indigo-700 hover:bg-indigo-600 text-white font-bold py-3 rounded-xl transition cursor-pointer"
          >
            {cargando ? "Cargando actividad..." : "Entrar y comenzar"}
          </button>
        </form>
      </div>
    );
  }

  const mediaGlobalActual = evaluacion
    ? calcularMediaNiveles(
        evaluacion.nivel_comprension_global || evaluacion.nivel_global,
        evaluacion.nivel_expresion_global || evaluacion.nivel_global
      )
    : "";

  const pasoAEnviar = modoSecuencial
    ? pasoActivo
    : pasosSecuenciales[maxPasoDesbloqueado];
  const deshabilitarComprobarPaso =
    ocupado || (pasoAEnviar?.tipo === "resumen" && !resumenCumpleMinimo);

  return (
    <div className="min-h-screen bg-slate-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 mb-0.5">
              DialectIA · IESO Sierra la Mesta · Programa NEXO (Educalectura-Educalem)
            </div>
            <div className="text-xs text-slate-500">
              Alumno/a: <strong className="text-slate-900">{nombreAlumno}</strong> · Código:{" "}
              <span className="font-mono font-bold">{actividad.codigo}</span>
            </div>
            <h1 className="text-lg font-extrabold text-slate-900">{actividad.titulo}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {bloqueoSecuencial ? (
              <div className="inline-flex bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => {
                    setPasoActual(maxPasoDesbloqueado);
                    setModoSecuencial(true);
                  }}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    modoSecuencial
                      ? "bg-indigo-700 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  🎯 Paso a paso
                </button>
                <button
                  type="button"
                  onClick={() => setModoSecuencial(false)}
                  className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                    !modoSecuencial
                      ? "bg-indigo-700 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📋 Todas las preguntas
                </button>
              </div>
            ) : (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-300">
                🔓 Modo avance libre
              </span>
            )}

            <span
              title="Los intentos se contabilizan únicamente al realizar la entrega global"
              className="text-xs font-bold px-3 py-1 rounded-full bg-slate-100 text-slate-800 border border-slate-200"
            >
              Entregas globales: {intentos} / {MAX_INTENTOS}
            </span>
            {superada && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-emerald-100 text-emerald-950 border border-emerald-300">
                🏆 {mediaGlobalActual || "Conseguido"}
              </span>
            )}
            {sinIntentos && (
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-rose-100 text-rose-900 border border-rose-300">
                ⛔ Límite de 10 entregas alcanzado
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-5 h-fit">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                {actividad.media_url ? "Recurso audiovisual" : "Documento de lectura"}
              </h2>
              {!actividad.media_url && actividad.pdf_url && (
                <div className="inline-flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setVistaLectura("original")}
                    className={`px-2 py-1 rounded-md transition cursor-pointer ${
                      vistaLectura === "original"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    📑 Documento original
                  </button>
                  <button
                    type="button"
                    onClick={() => setVistaLectura("texto")}
                    className={`px-2 py-1 rounded-md transition cursor-pointer ${
                      vistaLectura === "texto"
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    📝 Solo texto
                  </button>
                </div>
              )}
            </div>

            {actividad.media_url ? (
              <div className="space-y-3">
                {actividad.media_tipo === "youtube" && (
                  <div className="w-full aspect-video rounded-xl overflow-hidden border border-slate-300 bg-black shadow-inner">
                    <iframe
                      src={actividad.media_url}
                      title={actividad.titulo}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                )}
                {actividad.media_tipo === "video" && (
                  <video
                    controls
                    src={actividad.media_url}
                    className="w-full rounded-xl border border-slate-300 bg-black"
                  />
                )}
                {actividad.media_tipo === "audio" && (
                  <div className="bg-teal-50/70 border border-teal-200 rounded-xl p-4">
                    <audio controls src={actividad.media_url} className="w-full" />
                  </div>
                )}
                <p className="text-xs text-slate-500">
                  Escucha atentamente el audio o vídeo tantas veces como necesites antes de responder.
                </p>
              </div>
            ) : actividad.pdf_url && vistaLectura === "original" ? (
              <div className="w-full h-[520px] rounded-xl overflow-hidden border border-slate-300 bg-slate-200 shadow-inner">
                <iframe
                  src={`${actividad.pdf_url}#toolbar=1&navpanes=0`}
                  title={actividad.titulo}
                  className="w-full h-full"
                />
              </div>
            ) : (
              <div className="space-y-3.5 text-sm leading-relaxed text-slate-800 text-justify">
                {parrafosTexto.map((parrafo, idx) => (
                  <p key={idx} className="indent-3">
                    {parrafo}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-5 space-y-5">
            {avisoPegado && (
              <div className="bg-rose-50 border-2 border-rose-300 text-rose-950 rounded-xl px-4 py-2.5 text-xs font-bold shadow-xs">
                {avisoPegado}
              </div>
            )}

            {/* Resultado final global cuando ya se ha realizado la entrega completa */}
            {evaluacion && (superada || (!bloqueoSecuencial && intentos > 0)) && (
              <div
                className={`border-2 rounded-2xl p-4 space-y-2.5 ${
                  superada
                    ? "border-emerald-400 bg-emerald-50/60"
                    : "border-amber-300 bg-amber-50/50"
                }`}
              >
                <div
                  className={`font-extrabold text-sm sm:text-base ${
                    superada ? "text-emerald-950" : "text-amber-950"
                  }`}
                >
                  {superada
                    ? `🏆 Actividad entregada y superada (Entrega ${intentos} de ${MAX_INTENTOS})`
                    : `📊 Resultado de tu entrega global (Intento ${intentos} de ${MAX_INTENTOS})`}
                </div>
                <p className="text-sm leading-relaxed text-slate-700">
                  {evaluacion.comentario_general}
                </p>
                <div className="flex flex-wrap gap-2 pt-1 text-xs font-bold">
                  <span className="px-3 py-1 rounded-full bg-white border border-blue-300 text-blue-950">
                    1. Comprensión: {evaluacion.nivel_comprension_global}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white border border-indigo-300 text-indigo-950">
                    2. Expresión: {evaluacion.nivel_expresion_global}
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white border border-slate-300 text-slate-900">
                    Media General: {mediaGlobalActual}
                  </span>
                </div>
              </div>
            )}

            {bloqueoSecuencial && modoSecuencial && pasoActivo ? (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>
                      🎯 Avance secuencial obligatorio · Paso {indicePasoSeguro + 1} de{" "}
                      {pasosSecuenciales.length}
                    </span>
                    <span className="text-indigo-700">
                      {Math.round(((indicePasoSeguro + 1) / pasosSecuenciales.length) * 100)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 h-full transition-all duration-300"
                      style={{
                        width: `${((indicePasoSeguro + 1) / pasosSecuenciales.length) * 100}%`,
                      }}
                    />
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Comprueba cada pregunta hasta alcanzar al menos <strong>Conseguido</strong> en Comprensión y Expresión escrita. Al terminar todas, pulsa <strong>Entregar actividad completa</strong>.
                  </p>
                </div>

                {pasoActivo.tipo === "literal" && (
                  <div className="border-2 border-blue-200 rounded-2xl p-4 space-y-3 bg-blue-50/20">
                    <span className="text-xs font-bold uppercase tracking-wider text-blue-800 bg-blue-100 inline-block px-3 py-1 rounded-lg">
                      Comprensión Literal · Pregunta {pasoActivo.indice + 1} de {totalLit}
                    </span>
                    <label className="block text-base font-bold text-slate-900">
                      L{pasoActivo.indice + 1}. {pasoActivo.pregunta.pregunta}
                    </label>
                    <textarea
                      rows={3}
                      disabled={bloqueado}
                      onPaste={bloquearPegado}
                      onDrop={bloquearPegado}
                      placeholder="Redacta una oración completa con tus propias palabras (pegar deshabilitado)..."
                      value={respLiterales[pasoActivo.indice] || ""}
                      onChange={(e) => {
                        const copia = [...respLiterales];
                        copia[pasoActivo.indice] = e.target.value;
                        setRespLiterales(copia);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm disabled:bg-slate-100"
                    />
                    {corrPasoActivo &&
                      renderBloqueFeedbackEstructurado(
                        corrPasoActivo,
                        "Comprensión (fondo y contenido):",
                        "Expresión escrita (ortografía, gramática y coherencia):"
                      )}
                  </div>
                )}

                {pasoActivo.tipo === "inferencial" && (
                  <div className="border-2 border-indigo-200 rounded-2xl p-4 space-y-3 bg-indigo-50/20">
                    <span className="text-xs font-bold uppercase tracking-wider text-indigo-800 bg-indigo-100 inline-block px-3 py-1 rounded-lg">
                      Comprensión Inferencial · Pregunta {pasoActivo.indice + 1} de {totalInf}
                    </span>
                    <label className="block text-base font-bold text-slate-900">
                      I{pasoActivo.indice + 1}. {pasoActivo.pregunta.pregunta}
                    </label>
                    <textarea
                      rows={3}
                      disabled={bloqueado}
                      onPaste={bloquearPegado}
                      onDrop={bloquearPegado}
                      placeholder="Redacta tu respuesta razonada con tus propias palabras (pegar deshabilitado)..."
                      value={respInferenciales[pasoActivo.indice] || ""}
                      onChange={(e) => {
                        const copia = [...respInferenciales];
                        copia[pasoActivo.indice] = e.target.value;
                        setRespInferenciales(copia);
                      }}
                      className="w-full bg-white border border-slate-300 rounded-xl p-3 text-sm disabled:bg-slate-100"
                    />
                    {corrPasoActivo &&
                      renderBloqueFeedbackEstructurado(
                        corrPasoActivo,
                        "Comprensión (fondo y deducción):",
                        "Expresión escrita (ortografía, gramática y coherencia):"
                      )}
                  </div>
                )}

                {pasoActivo.tipo === "resumen" && (
                  <div className="border-2 border-amber-200 rounded-2xl p-4 space-y-3 bg-amber-50/30">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-900 bg-amber-100 inline-block px-3 py-1 rounded-lg">
                        Actividad Final · Redacción de Resumen
                      </span>
                      <span
                        className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                          resumenCumpleMinimo
                            ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                            : "bg-amber-100 text-amber-950 border-amber-300"
                        }`}
                      >
                        {palabrasActualesResumen} / {minPalabrasResumen} palabras{" "}
                        {resumenCumpleMinimo ? "✓" : `(faltan ${palabrasFaltantes})`}
                      </span>
                    </div>
                    <label className="block text-base font-bold text-slate-900">
                      Redacta con tus propias palabras un resumen completo del texto (mínimo{" "}
                      {minPalabrasResumen} palabras):
                    </label>
                    <textarea
                      rows={5}
                      disabled={bloqueado}
                      onPaste={bloquearPegado}
                      onDrop={bloquearPegado}
                      placeholder={`Escribe aquí tu resumen con tus propias palabras (mínimo ${minPalabrasResumen} palabras, pegar deshabilitado)...`}
                      value={respResumen}
                      onChange={(e) => setRespResumen(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded-xl p-3 text-sm leading-relaxed disabled:bg-slate-100"
                    />
                    {!bloqueado && !resumenCumpleMinimo && (
                      <p className="text-xs font-semibold text-amber-900">
                        ⚠️ Requisito obligatorio: escribe al menos {palabrasFaltantes}{" "}
                        {palabrasFaltantes === 1 ? "palabra más" : "palabras más"} para habilitar la comprobación.
                      </p>
                    )}
                    {corrPasoActivo &&
                      renderBloqueFeedbackEstructurado(
                        corrPasoActivo,
                        "Comprensión (síntesis de ideas principales):",
                        "Expresión escrita (ortografía, puntuación y cohesión):"
                      )}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    disabled={indicePasoSeguro === 0}
                    onClick={() => setPasoActual((p) => Math.max(0, p - 1))}
                    className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs font-bold text-slate-700 cursor-pointer"
                  >
                    ⬅️ Pregunta anterior
                  </button>

                  {pasoActivoDominado ? (
                    esUltimoPaso ? (
                      <div className="px-4 py-2 rounded-xl bg-emerald-100 border border-emerald-400 text-emerald-950 text-xs font-extrabold">
                        ✅ Todos los pasos dominados · Pulsa abajo para entregar
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setPasoActual((p) => Math.min(maxPasoDesbloqueado, p + 1))
                        }
                        className="px-5 py-2.5 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white text-xs font-extrabold shadow-sm transition cursor-pointer"
                      >
                        ✅ Dominado · Siguiente pregunta ➡️
                      </button>
                    )
                  ) : (
                    <span className="text-xs font-semibold text-slate-500">
                      🔒 Alcanza <strong>Conseguido</strong> en Comprensión y Expresión para avanzar
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <>
                {bloqueoSecuencial ? (
                  <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl px-4 py-2.5 text-xs text-indigo-950 flex items-center justify-between gap-2">
                    <span>
                      🔒 <strong>Progreso secuencial activo:</strong> responde y domina cada pregunta en orden para desbloquear la siguiente.
                    </span>
                    <span className="font-bold whitespace-nowrap">
                      Paso {maxPasoDesbloqueado + 1} / {pasosSecuenciales.length}
                    </span>
                  </div>
                ) : (
                  <div className="bg-slate-100 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-800">
                    🔓 <strong>Avance libre:</strong> puedes responder en el orden que prefieras, pedir revisión individual de cada pregunta sin gastar intentos y entregar al terminar.
                  </div>
                )}

                {(actividad.preguntas_literales || []).map((item, idx) => {
                  const corr = evaluacion?.correcciones_literales?.[idx];
                  const idxGlobal = indiceGlobalLiteral(idx);
                  const desbloqueada = !bloqueoSecuencial || idxGlobal <= maxPasoDesbloqueado;
                  const dominada = estaPasoDominado(
                    evaluacion,
                    pasosSecuenciales[idxGlobal]
                  );

                  return (
                    <div
                      key={`L-${idx}`}
                      className={`border rounded-xl p-4 space-y-2.5 transition ${
                        desbloqueada
                          ? "border-slate-200 bg-white"
                          : "border-slate-200 bg-slate-100/80 opacity-70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-sm font-semibold text-slate-900">
                          L{idx + 1}. {item.pregunta}
                        </label>
                        {dominada ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 shrink-0">
                            ✅ Dominada
                          </span>
                        ) : !desbloqueada ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 shrink-0">
                            🔒 Bloqueada
                          </span>
                        ) : !bloqueoSecuencial && !bloqueado ? (
                          <button
                            type="button"
                            disabled={ocupado || !respLiterales[idx]?.trim()}
                            onClick={() =>
                              comprobarPasoIndividual(pasosSecuenciales[idxGlobal])
                            }
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 disabled:opacity-40 cursor-pointer shrink-0"
                          >
                            🔍 Comprobar L{idx + 1}
                          </button>
                        ) : (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 shrink-0">
                            ✍️ Activa
                          </span>
                        )}
                      </div>

                      <textarea
                        rows={2}
                        disabled={bloqueado || !desbloqueada}
                        onPaste={bloquearPegado}
                        onDrop={bloquearPegado}
                        placeholder={
                          desbloqueada
                            ? "Redacta una oración completa (pegar deshabilitado)..."
                            : "🔒 Supera la pregunta anterior en Comprensión y Expresión para desbloquear esta casilla."
                        }
                        value={respLiterales[idx] || ""}
                        onChange={(e) => {
                          const copia = [...respLiterales];
                          copia[idx] = e.target.value;
                          setRespLiterales(copia);
                        }}
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm disabled:bg-slate-200/70 disabled:cursor-not-allowed"
                      />
                      {corr &&
                        renderBloqueFeedbackEstructurado(
                          corr,
                          "Comprensión (fondo y contenido):",
                          "Expresión escrita (ortografía, gramática y coherencia):"
                        )}
                    </div>
                  );
                })}

                {(actividad.preguntas_inferenciales || []).map((item, idx) => {
                  const corr = evaluacion?.correcciones_inferenciales?.[idx];
                  const idxGlobal = indiceGlobalInferencial(idx);
                  const desbloqueada = !bloqueoSecuencial || idxGlobal <= maxPasoDesbloqueado;
                  const dominada = estaPasoDominado(
                    evaluacion,
                    pasosSecuenciales[idxGlobal]
                  );

                  return (
                    <div
                      key={`I-${idx}`}
                      className={`border rounded-xl p-4 space-y-2.5 transition ${
                        desbloqueada
                          ? "border-slate-200 bg-white"
                          : "border-slate-200 bg-slate-100/80 opacity-70"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <label className="block text-sm font-semibold text-slate-900">
                          I{idx + 1}. {item.pregunta}
                        </label>
                        {dominada ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300 shrink-0">
                            ✅ Dominada
                          </span>
                        ) : !desbloqueada ? (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 shrink-0">
                            🔒 Bloqueada
                          </span>
                        ) : !bloqueoSecuencial && !bloqueado ? (
                          <button
                            type="button"
                            disabled={ocupado || !respInferenciales[idx]?.trim()}
                            onClick={() =>
                              comprobarPasoIndividual(pasosSecuenciales[idxGlobal])
                            }
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 disabled:opacity-40 cursor-pointer shrink-0"
                          >
                            🔍 Comprobar I{idx + 1}
                          </button>
                        ) : (
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-900 shrink-0">
                            ✍️ Activa
                          </span>
                        )}
                      </div>

                      <textarea
                        rows={2}
                        disabled={bloqueado || !desbloqueada}
                        onPaste={bloquearPegado}
                        onDrop={bloquearPegado}
                        placeholder={
                          desbloqueada
                            ? "Redacta tu respuesta razonada (pegar deshabilitado)..."
                            : "🔒 Supera la pregunta anterior en Comprensión y Expresión para desbloquear esta casilla."
                        }
                        value={respInferenciales[idx] || ""}
                        onChange={(e) => {
                          const copia = [...respInferenciales];
                          copia[idx] = e.target.value;
                          setRespInferenciales(copia);
                        }}
                        className="w-full border border-slate-300 rounded-lg p-2.5 text-sm disabled:bg-slate-200/70 disabled:cursor-not-allowed"
                      />
                      {corr &&
                        renderBloqueFeedbackEstructurado(
                          corr,
                          "Comprensión (fondo y deducción):",
                          "Expresión escrita (ortografía, gramática y coherencia):"
                        )}
                    </div>
                  );
                })}

                {requiereResumen && (
                  <div
                    className={`border-2 rounded-xl p-4 space-y-2.5 transition ${
                      resumenDesbloqueado
                        ? "border-amber-200 bg-amber-50/30"
                        : "border-slate-200 bg-slate-100/80 opacity-70"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-amber-900 bg-amber-100 px-2.5 py-1 rounded-lg">
                        Actividad Final · Redacción de Resumen (Obligatorio)
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${
                            !resumenDesbloqueado
                              ? "bg-slate-200 text-slate-700 border-slate-300"
                              : resumenCumpleMinimo
                              ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                              : "bg-amber-100 text-amber-950 border-amber-300"
                          }`}
                        >
                          {!resumenDesbloqueado
                            ? "🔒 Bloqueado hasta superar las preguntas"
                            : `${palabrasActualesResumen} / ${minPalabrasResumen} palabras ${
                                resumenCumpleMinimo ? "✓" : `(faltan ${palabrasFaltantes})`
                              }`}
                        </span>
                        {!bloqueoSecuencial && !bloqueado && (
                          <button
                            type="button"
                            disabled={ocupado || !resumenCumpleMinimo}
                            onClick={() =>
                              comprobarPasoIndividual(pasosSecuenciales[indiceGlobalResumen])
                            }
                            className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 disabled:opacity-40 cursor-pointer shrink-0"
                          >
                            🔍 Comprobar resumen
                          </button>
                        )}
                      </div>
                    </div>

                    <label className="block text-sm font-semibold text-slate-900">
                      Redacta con tus propias palabras un resumen completo del texto (mínimo{" "}
                      {minPalabrasResumen} palabras):
                    </label>

                    <textarea
                      rows={5}
                      disabled={bloqueado || !resumenDesbloqueado}
                      onPaste={bloquearPegado}
                      onDrop={bloquearPegado}
                      placeholder={
                        resumenDesbloqueado
                          ? `Escribe aquí tu resumen con tus propias palabras (mínimo ${minPalabrasResumen} palabras, pegar deshabilitado)...`
                          : "🔒 Supera todas las preguntas anteriores para desbloquear el resumen final."
                      }
                      value={respResumen}
                      onChange={(e) => setRespResumen(e.target.value)}
                      className="w-full bg-white border border-amber-300 rounded-lg p-3 text-sm leading-relaxed disabled:bg-slate-200/70 disabled:border-slate-300 disabled:cursor-not-allowed"
                    />

                    {!bloqueado && resumenDesbloqueado && !resumenCumpleMinimo && (
                      <p className="text-xs font-semibold text-amber-900">
                        ⚠️ Requisito obligatorio: escribe al menos {palabrasFaltantes}{" "}
                        {palabrasFaltantes === 1 ? "palabra más" : "palabras más"} para habilitar la comprobación.
                      </p>
                    )}

                    {evaluacion?.correccion_resumen &&
                      renderBloqueFeedbackEstructurado(
                        evaluacion.correccion_resumen,
                        "Comprensión (síntesis de ideas principales):",
                        "Expresión escrita (ortografía, puntuación y cohesión):"
                      )}
                  </div>
                )}
              </>
            )}

            {/* Botonera inferior */}
            {!bloqueado && (
              <div className="space-y-2.5 pt-1">
                {bloqueoSecuencial ? (
                  !todosLosPasosDominados ? (
                    <button
                      type="button"
                      disabled={deshabilitarComprobarPaso}
                      onClick={() => comprobarPasoIndividual()}
                      className="w-full py-3 rounded-xl bg-indigo-700 hover:bg-indigo-600 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-bold text-sm transition cursor-pointer"
                    >
                      {corrigiendoPaso
                        ? "Analizando esta respuesta..."
                        : pasoAEnviar?.tipo === "resumen" && !resumenCumpleMinimo
                        ? `🔒 Completa el resumen (faltan ${palabrasFaltantes} palabras)`
                        : `🔍 Comprobar paso ${
                            (modoSecuencial ? indicePasoSeguro : maxPasoDesbloqueado) + 1
                          } de ${pasosSecuenciales.length} (no gasta intentos)`}
                    </button>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-2.5">
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={() => comprobarPasoIndividual()}
                        className="sm:w-1/3 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 disabled:opacity-50 text-slate-700 font-bold text-xs transition cursor-pointer"
                      >
                        {corrigiendoPaso ? "Revisando..." : "🔍 Revisar último paso"}
                      </button>
                      <button
                        type="button"
                        disabled={ocupado}
                        onClick={entregarActividadCompleta}
                        className="sm:w-2/3 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-400 text-white font-extrabold text-sm shadow-sm transition cursor-pointer"
                      >
                        {enviandoGlobal
                          ? "Enviando entrega global al profesor..."
                          : `📤 Entregar actividad completa al profesor (Intento ${
                              intentos + 1
                            } de ${MAX_INTENTOS})`}
                      </button>
                    </div>
                  )
                ) : (
                  <button
                    type="button"
                    disabled={ocupado || !listoParaEntregar}
                    onClick={entregarActividadCompleta}
                    className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 disabled:bg-slate-400 disabled:cursor-not-allowed text-white font-extrabold text-sm shadow-sm transition cursor-pointer"
                  >
                    {enviandoGlobal
                      ? "Enviando entrega global al profesor..."
                      : !listoParaEntregar
                      ? "✍️ Responde a todas las preguntas para habilitar la entrega"
                      : `📤 Entregar actividad completa al profesor (Intento ${
                          intentos + 1
                        } de ${MAX_INTENTOS})`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PaginaAlumno() {
  return (
    <Suspense fallback={<div className="p-8 text-center">Cargando entrenador...</div>}>
      <VistaAlumnoContenido />
    </Suspense>
  );
}