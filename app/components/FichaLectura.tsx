"use client";

import React, { useState } from "react";
import { ResultadoLectura } from "../types/lectura";
import { supabase } from "../lib/supabase";
import PanelSeguimientoClase from "./PanelSeguimientoClase";

interface FichaLecturaProps {
  resultado: ResultadoLectura;
  edad: string;
  pdfPreviewUrl?: string | null;
  avisoExito: boolean;
  onCerrarAviso: () => void;
  onAbrirCorrector: () => void;
  onRefinarResultado: (instruccion: string) => Promise<void>;
  onActualizarResultado: (nuevoResultado: ResultadoLectura) => void;
  refinando: boolean;
  seccionRef: React.RefObject<HTMLElement | null>;
}

const SUGERENCIAS_RAPIDAS = [
  "Haz el texto un poco más breve",
  "Simplifica el vocabulario (nivel NEAE)",
  "Dale un tono más cercano y narrativo",
  "Añade un párrafo final con moraleja",
  "Haz las preguntas un poco más desafiantes",
];

export default function FichaLectura({
  resultado,
  edad,
  pdfPreviewUrl,
  avisoExito,
  onCerrarAviso,
  onAbrirCorrector,
  onRefinarResultado,
  onActualizarResultado,
  refinando,
  seccionRef,
}: FichaLecturaProps) {
  const [mostrarRespuestas, setMostrarRespuestas] = useState(false);

  const [itemEditando, setItemEditando] = useState<{
    tipo: "literales" | "inferenciales";
    indice: number;
  } | null>(null);
  const [borradorPregunta, setBorradorPregunta] = useState("");
  const [borradorRespuesta, setBorradorRespuesta] = useState("");

  const [editandoResumen, setEditandoResumen] = useState(false);
  const [borradorMinPalabras, setBorradorMinPalabras] = useState(
    resultado.resumen_min_palabras || 60
  );
  const [borradorResumenModelo, setBorradorResumenModelo] = useState(
    resultado.resumen_modelo || ""
  );

  const [codigoAula, setCodigoAula] = useState<string | null>(null);
  const [publicando, setPublicando] = useState(false);
  const [vistaDocumento, setVistaDocumento] = useState<"original" | "texto">("original");

  const [panelRefinarAbierto, setPanelRefinarAbierto] = useState(false);
  const [instruccion, setInstruccion] = useState("");
  const [historialCambios, setHistorialCambios] = useState<string[]>([]);

  const tieneResumen = (resultado.resumen_min_palabras || 0) > 0;

  const parrafosTexto = (resultado.texto || "")
    .replace(/\\n/g, "\n")
    .split(/\r?\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const iniciarEdicion = (tipo: "literales" | "inferenciales", indice: number) => {
    if (itemEditando) {
      guardarEdicionActual();
    }
    const clave = tipo === "literales" ? "preguntas_literales" : "preguntas_inferenciales";
    const item = resultado[clave]?.[indice];
    if (!item) return;

    setBorradorPregunta(item.pregunta);
    setBorradorRespuesta(item.respuesta);
    setItemEditando({ tipo, indice });
  };

  const guardarEdicionActual = () => {
    if (!itemEditando) return;
    const { tipo, indice } = itemEditando;
    const clave = tipo === "literales" ? "preguntas_literales" : "preguntas_inferenciales";
    const listaActual = [...(resultado[clave] || [])];

    if (listaActual[indice]) {
      listaActual[indice] = {
        pregunta: borradorPregunta,
        respuesta: borradorRespuesta,
      };
      onActualizarResultado({
        ...resultado,
        [clave]: listaActual,
      });
    }
    setItemEditando(null);
  };

  const eliminarPregunta = (tipo: "literales" | "inferenciales", indice: number) => {
    const clave = tipo === "literales" ? "preguntas_literales" : "preguntas_inferenciales";
    const listaActual = (resultado[clave] || []).filter((_, i) => i !== indice);
    onActualizarResultado({
      ...resultado,
      [clave]: listaActual,
    });
    if (itemEditando?.tipo === tipo && itemEditando?.indice === indice) {
      setItemEditando(null);
    }
  };

  const anadirPreguntaManual = (tipo: "literales" | "inferenciales") => {
    const clave = tipo === "literales" ? "preguntas_literales" : "preguntas_inferenciales";
    let baseResultado = resultado;

    if (itemEditando) {
      const clavePrev =
        itemEditando.tipo === "literales" ? "preguntas_literales" : "preguntas_inferenciales";
      const copiaPrev = [...(resultado[clavePrev] || [])];
      if (copiaPrev[itemEditando.indice]) {
        copiaPrev[itemEditando.indice] = {
          pregunta: borradorPregunta,
          respuesta: borradorRespuesta,
        };
        baseResultado = { ...resultado, [clavePrev]: copiaPrev };
      }
    }

    const actual = baseResultado[clave] || [];
    const nuevoIndice = actual.length;
    onActualizarResultado({
      ...baseResultado,
      [clave]: [...actual, { pregunta: "", respuesta: "" }],
    });

    setBorradorPregunta("");
    setBorradorRespuesta("");
    setItemEditando({ tipo, indice: nuevoIndice });
  };

  const activarResumenEnFicha = () => {
    setBorradorMinPalabras(60);
    setBorradorResumenModelo(resultado.resumen_modelo || "");
    onActualizarResultado({
      ...resultado,
      resumen_min_palabras: 60,
      resumen_modelo: resultado.resumen_modelo || "",
    });
    setEditandoResumen(true);
  };

  const guardarEdicionResumen = () => {
    const minimoValido = Math.max(10, Number(borradorMinPalabras) || 50);
    onActualizarResultado({
      ...resultado,
      resumen_min_palabras: minimoValido,
      resumen_modelo: borradorResumenModelo,
    });
    setEditandoResumen(false);
  };

  const quitarResumenDeFicha = () => {
    onActualizarResultado({
      ...resultado,
      resumen_min_palabras: 0,
      resumen_modelo: "",
    });
    setEditandoResumen(false);
  };

  const publicarParaClase = async () => {
    if (itemEditando) guardarEdicionActual();
    if (editandoResumen) guardarEdicionResumen();

    const literalesValidas = (resultado.preguntas_literales || []).filter((p) =>
      p.pregunta.trim()
    );
    const inferencialesValidas = (resultado.preguntas_inferenciales || []).filter((p) =>
      p.pregunta.trim()
    );
    const minPalabrasFinal = editandoResumen
      ? Math.max(10, Number(borradorMinPalabras) || 50)
      : resultado.resumen_min_palabras || 0;

    if (
      literalesValidas.length === 0 &&
      inferencialesValidas.length === 0 &&
      minPalabrasFinal === 0
    ) {
      alert("Añade al menos una pregunta o activa el resumen antes de compartir con la clase.");
      return;
    }

    setPublicando(true);
    try {
      const codigoGenerado = `MESTA-${Math.floor(100 + Math.random() * 900)}`;
      const { error } = await supabase.from("actividades").insert({
        codigo: codigoGenerado,
        titulo: resultado.titulo,
        texto: resultado.texto,
        edad,
        media_url: resultado.mediaUrl || null,
        media_tipo: resultado.mediaTipo || null,
        preguntas_literales: literalesValidas,
        preguntas_inferenciales: inferencialesValidas,
        resumen_min_palabras: minPalabrasFinal,
        resumen_modelo: editandoResumen
          ? borradorResumenModelo
          : resultado.resumen_modelo || null,
      });

      if (error) {
        throw new Error(error.message);
      }

      setCodigoAula(codigoGenerado);
      const urlAlumno = `${window.location.origin}/alumno?codigo=${codigoGenerado}`;
      navigator.clipboard?.writeText(urlAlumno);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al publicar la actividad.";
      alert("No se pudo publicar en Supabase: " + msg);
    } finally {
      setPublicando(false);
    }
  };

  const manejarEnvioRefinamiento = async (e: React.FormEvent) => {
    e.preventDefault();
    const textoInstruccion = instruccion.trim();
    if (!textoInstruccion || refinando) return;

    setItemEditando(null);
    setEditandoResumen(false);
    await onRefinarResultado(textoInstruccion);
    setHistorialCambios((prev) => [...prev, textoInstruccion]);
    setInstruccion("");
  };

  const mostrarSelectorVista =
    (!resultado.mediaUrl && Boolean(pdfPreviewUrl)) ||
    (Boolean(resultado.mediaUrl) && mostrarRespuestas);

  const renderBloquePreguntas = (
    tipo: "literales" | "inferenciales",
    lista: { pregunta: string; respuesta: string }[]
  ) => {
    const esLiteral = tipo === "literales";
    const estiloCajaEdicion = esLiteral
      ? "border-blue-300 bg-blue-50/50"
      : "border-indigo-300 bg-indigo-50/50";
    const estiloBotonGuardar = esLiteral
      ? "bg-blue-700 hover:bg-blue-600"
      : "bg-indigo-700 hover:bg-indigo-600";

    return (
      <>
        {lista.length === 0 ? (
          <p className="text-xs text-slate-500 italic py-1 print:hidden">
            No hay preguntas en este bloque. Pulsa el botón de abajo para añadir una.
          </p>
        ) : (
          <ol className="list-decimal pl-5 space-y-4">
            {lista.map((item, i) => {
              const enEdicion =
                itemEditando?.tipo === tipo && itemEditando?.indice === i;

              return (
                <li key={`${tipo}-${i}`} className="break-inside-avoid">
                  {enEdicion ? (
                    <div
                      className={`border-2 ${estiloCajaEdicion} rounded-xl p-4 space-y-3 print:hidden`}
                    >
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          Enunciado de la pregunta
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Escribe aquí el enunciado..."
                          value={borradorPregunta}
                          onChange={(e) => setBorradorPregunta(e.target.value)}
                          className="w-full bg-white border border-slate-300 rounded-lg p-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-emerald-800 mb-1">
                          Respuesta modelo (para solucionario y entrenador IA)
                        </label>
                        <textarea
                          rows={2}
                          placeholder="Escribe la respuesta esperada..."
                          value={borradorRespuesta}
                          onChange={(e) => setBorradorRespuesta(e.target.value)}
                          className="w-full bg-white border border-emerald-200 rounded-lg p-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                        />
                      </div>
                      <div className="flex items-center justify-between pt-1">
                        <button
                          type="button"
                          onClick={() => eliminarPregunta(tipo, i)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-800 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 cursor-pointer"
                        >
                          🗑️ Eliminar
                        </button>
                        <button
                          type="button"
                          onClick={guardarEdicionActual}
                          className={`text-xs font-bold text-white px-4 py-1.5 rounded-lg shadow-xs cursor-pointer ${estiloBotonGuardar}`}
                        >
                          ✓ Guardar pregunta
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="group flex items-start justify-between gap-3 rounded-xl p-1.5 -ml-1.5 hover:bg-slate-50 transition">
                      <div
                        onClick={() => iniciarEdicion(tipo, i)}
                        className="flex-1 cursor-pointer"
                      >
                        <p className="font-medium text-slate-900">
                          {item.pregunta || (
                            <span className="italic text-slate-400">
                              (Sin enunciado — haz clic para escribir)
                            </span>
                          )}
                        </p>
                        {mostrarRespuestas && (
                          <p className="text-emerald-800 text-sm mt-2 bg-emerald-50 border border-emerald-200/70 p-3 rounded-lg print:hidden">
                            <strong>Respuesta:</strong>{" "}
                            {item.respuesta || (
                              <span className="italic text-emerald-700/70">
                                Sin respuesta modelo
                              </span>
                            )}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 print:hidden">
                        <button
                          type="button"
                          onClick={() => iniciarEdicion(tipo, i)}
                          className="text-xs font-semibold text-slate-600 hover:text-indigo-700 bg-white border border-slate-200 hover:border-indigo-300 px-2.5 py-1 rounded-lg shadow-2xs cursor-pointer"
                        >
                          ✏️ Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => eliminarPregunta(tipo, i)}
                          title="Eliminar pregunta"
                          className="text-xs font-semibold text-slate-500 hover:text-rose-700 bg-white border border-slate-200 hover:border-rose-300 px-2 py-1 rounded-lg shadow-2xs cursor-pointer"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="hidden print:block mt-3 space-y-5">
                    <div className="border-b border-gray-400 h-4" />
                    <div className="border-b border-gray-400 h-4" />
                  </div>
                </li>
              );
            })}
          </ol>
        )}

        <div className="pt-1 print:hidden">
          <button
            type="button"
            onClick={() => anadirPreguntaManual(tipo)}
            className={`text-xs font-bold px-3.5 py-2 rounded-lg border transition cursor-pointer ${
              esLiteral
                ? "bg-blue-50 hover:bg-blue-100 text-blue-800 border-blue-200"
                : "bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200"
            }`}
          >
            {esLiteral ? "+ Añadir pregunta literal" : "+ Añadir pregunta inferencial"}
          </button>
        </div>
      </>
    );
  };

  return (
    <section
      ref={seccionRef}
      className="mt-8 bg-white p-6 sm:p-10 rounded-2xl shadow-lg shadow-slate-200/70 border border-slate-200/80 space-y-6 scroll-mt-6 print:mt-0 print:p-0 print:shadow-none print:border-none"
    >
      {/* Aviso visual de confirmación */}
      {avisoExito && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-300 text-emerald-900 px-4 py-3 rounded-xl shadow-sm print:hidden">
          <div className="flex items-center gap-2.5">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white text-xs font-bold">
              ✓
            </span>
            <div className="text-sm">
              <strong>¡Actividad lista!</strong> Puedes editar cualquier pregunta pulsando <strong>✏️ Editar</strong> o añadir las tuyas propias debajo de cada bloque.
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrarAviso}
            className="text-emerald-700 hover:text-emerald-950 text-xs font-bold px-2 py-1 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Barra de herramientas superior */}
      <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 print:hidden">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <span
            className={`w-2.5 h-2.5 rounded-full ${
              mostrarRespuestas ? "bg-emerald-500" : "bg-blue-500"
            }`}
          />
          <span>
            Vista:{" "}
            <strong className="text-slate-900">
              {mostrarRespuestas ? "Ficha Profesor (con soluciones)" : "Ficha Alumnado"}
            </strong>
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setPanelRefinarAbierto(!panelRefinarAbierto)}
            className={`text-sm px-4 py-2 rounded-lg font-bold shadow-sm transition cursor-pointer ${
              panelRefinarAbierto
                ? "bg-amber-600 text-white"
                : "bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300"
            }`}
          >
            💬 {panelRefinarAbierto ? "Ocultar ajustes IA" : "Ajustar texto / preguntas IA"}
          </button>

          {!codigoAula && (
            <button
              type="button"
              disabled={publicando}
              onClick={publicarParaClase}
              className="text-sm bg-emerald-700 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition cursor-pointer"
            >
              {publicando ? "Generando código..." : "📢 Compartir con la clase"}
            </button>
          )}

          <button
            type="button"
            onClick={() => {
              if (itemEditando) guardarEdicionActual();
              if (editandoResumen) guardarEdicionResumen();
              onAbrirCorrector();
            }}
            className="text-sm bg-indigo-700 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold shadow-sm transition cursor-pointer"
          >
            ✍️ Probar corrección IA
          </button>

          <button
            type="button"
            onClick={() => setMostrarRespuestas(!mostrarRespuestas)}
            className="text-sm bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 px-3.5 py-2 rounded-lg font-medium transition cursor-pointer"
          >
            {mostrarRespuestas ? "Ocultar Solucionario" : "Ver Solucionario"}
          </button>

          <button
            type="button"
            onClick={() => {
              if (itemEditando) guardarEdicionActual();
              if (editandoResumen) guardarEdicionResumen();
              setTimeout(() => window.print(), 50);
            }}
            className="text-sm bg-rose-600 hover:bg-rose-700 text-white px-4 py-2 rounded-lg font-semibold shadow-sm transition cursor-pointer"
          >
            🖨️ Descargar PDF
          </button>
        </div>
      </div>

      {/* PANEL DE ITERACIÓN / CONVERSACIÓN CON LA IA */}
      {panelRefinarAbierto && (
        <div className="bg-amber-50/70 border-2 border-amber-200 rounded-2xl p-4 sm:p-5 space-y-3.5 print:hidden">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">
                Asistente de Edición Docente
              </span>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                ¿Qué quieres ajustar en esta actividad?
              </h3>
            </div>
            {historialCambios.length > 0 && (
              <span className="text-xs font-semibold bg-white border border-amber-200 text-amber-900 px-2.5 py-1 rounded-full">
                {historialCambios.length}{" "}
                {historialCambios.length === 1 ? "ajuste aplicado" : "ajustes aplicados"}
              </span>
            )}
          </div>

          {historialCambios.length > 0 && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {historialCambios.map((item, idx) => (
                <span
                  key={idx}
                  className="bg-white/90 border border-amber-200 text-slate-700 px-2.5 py-1 rounded-lg"
                >
                  ✓ {item}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5">
            {SUGERENCIAS_RAPIDAS.map((sug) => (
              <button
                key={sug}
                type="button"
                disabled={refinando}
                onClick={() => setInstruccion(sug)}
                className="text-xs bg-white hover:bg-amber-100 text-amber-950 border border-amber-200 px-2.5 py-1 rounded-lg transition cursor-pointer disabled:opacity-50"
              >
                + {sug}
              </button>
            ))}
          </div>

          <form onSubmit={manejarEnvioRefinamiento} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              disabled={refinando}
              placeholder="Ej: Acorta el segundo párrafo, cambia el tono a más humorístico o añade un dato sobre Extremadura..."
              value={instruccion}
              onChange={(e) => setInstruccion(e.target.value)}
              className="flex-1 bg-white border border-amber-300 text-slate-800 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
            />
            <button
              type="submit"
              disabled={refinando || !instruccion.trim()}
              className="bg-amber-700 hover:bg-amber-600 disabled:bg-slate-400 text-white text-sm font-bold px-5 py-2.5 rounded-xl shadow-xs transition cursor-pointer shrink-0 flex items-center justify-center gap-2"
            >
              {refinando ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  <span>Aplicando cambio...</span>
                </>
              ) : (
                <span>🪄 Aplicar ajuste</span>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Panel de seguimiento en vivo si ya se ha compartido con la clase */}
      {codigoAula && (
        <PanelSeguimientoClase
          codigoActividad={codigoAula}
          tituloActividad={resultado.titulo}
        />
      )}

      {/* BLOQUE 1: FICHA PARA EL ALUMNADO */}
      <div>
        <div className="hidden print:block border-b-2 border-gray-800 pb-4 mb-6">
          <div className="flex justify-between items-start mb-4 gap-4">
            <div>
              <span className="font-bold text-lg uppercase tracking-wide block">
                DialectIA · IESO Sierra la Mesta
              </span>
              <span className="text-xs text-gray-600 block">
                Entrenador de Competencia Lingüística — Programa NEXO (Educalectura-Educalem)
              </span>
            </div>
            <span className="text-sm font-semibold text-gray-700 shrink-0">
              {resultado.mediaUrl
                ? "Actividad de Comprensión Oral"
                : "Actividad de Comprensión Lectora"}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm pt-2">
            <div className="col-span-2">
              <strong>Nombre y apellidos:</strong> ________________________________________
            </div>
            <div>
              <strong>Curso / Fecha:</strong> _______________
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-6 text-slate-900 print:text-2xl print:mb-4">
            {resultado.titulo}
          </h2>

          {/* Selector entre Recurso Original y Texto */}
          {mostrarSelectorVista && (
            <div className="flex justify-center mb-4 print:hidden">
              <div className="inline-flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setVistaDocumento("original")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    vistaDocumento === "original"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {resultado.mediaUrl
                    ? "🎧 Reproductor de Vídeo / Audio"
                    : "📑 Ver PDF original (con imágenes y maquetación)"}
                </button>
                <button
                  type="button"
                  onClick={() => setVistaDocumento("texto")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    vistaDocumento === "texto"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {resultado.mediaUrl
                    ? "📝 Ver transcripción (solo docente)"
                    : "📝 Ver texto extraído limpio"}
                </button>
              </div>
            </div>
          )}

          {/* Reproductor Multimedia */}
          {resultado.mediaUrl && (!mostrarRespuestas || vistaDocumento === "original") && (
            <div className="mb-4 print:hidden">
              {resultado.mediaTipo === "youtube" && (
                <div className="w-full aspect-video max-h-[460px] rounded-xl overflow-hidden border border-slate-300 bg-black shadow-inner">
                  <iframe
                    src={resultado.mediaUrl}
                    title={resultado.titulo}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="w-full h-full"
                  />
                </div>
              )}
              {resultado.mediaTipo === "video" && (
                <video
                  controls
                  src={resultado.mediaUrl}
                  className="w-full max-h-[460px] rounded-xl border border-slate-300 bg-black"
                />
              )}
              {resultado.mediaTipo === "audio" && (
                <div className="bg-teal-50/60 border border-teal-200 rounded-xl p-5">
                  <audio controls src={resultado.mediaUrl} className="w-full" />
                </div>
              )}
            </div>
          )}

          {/* Visor PDF Original */}
          {!resultado.mediaUrl && pdfPreviewUrl && vistaDocumento === "original" && (
            <div className="w-full h-[540px] rounded-xl overflow-hidden border border-slate-300 bg-slate-200 shadow-inner mb-4 print:hidden">
              <iframe
                src={`${pdfPreviewUrl}#toolbar=1&navpanes=0`}
                title="Documento PDF original"
                className="w-full h-full"
              />
            </div>
          )}

          <div
            className={`${
              resultado.mediaUrl
                ? mostrarRespuestas && vistaDocumento === "texto"
                  ? "block"
                  : "hidden print:block"
                : pdfPreviewUrl && vistaDocumento === "original"
                ? "hidden print:block"
                : "block"
            } space-y-4 leading-relaxed text-base sm:text-lg text-slate-700 text-justify bg-slate-50/60 p-6 rounded-xl border border-slate-100 print:bg-transparent print:p-0 print:border-none print:text-base print:leading-7 print:text-black print:space-y-3`}
          >
            {parrafosTexto.map((parrafo, idx) => (
              <p key={idx} className="indent-4 sm:indent-6 print:indent-4">
                {parrafo}
              </p>
            ))}
          </div>
        </div>

        <hr className="border-slate-200 my-6 print:border-gray-300" />

        {/* SECCIÓN 1: PREGUNTAS LITERALES */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-blue-700 bg-blue-50 inline-block px-3 py-1 rounded-lg uppercase tracking-wider print:bg-transparent print:p-0 print:text-base print:text-black">
            1. Comprensión Literal
          </h3>
          {renderBloquePreguntas("literales", resultado.preguntas_literales || [])}
        </div>

        {/* SECCIÓN 2: PREGUNTAS INFERENCIALES */}
        <div className="space-y-3 pt-6">
          <h3 className="text-sm font-bold text-indigo-700 bg-indigo-50 inline-block px-3 py-1 rounded-lg uppercase tracking-wider print:bg-transparent print:p-0 print:text-base print:text-black">
            2. Comprensión Inferencial
          </h3>
          {renderBloquePreguntas("inferenciales", resultado.preguntas_inferenciales || [])}
        </div>

        {/* SECCIÓN 3: ACTIVIDAD FINAL DE RESUMEN */}
        {tieneResumen ? (
          <div className="space-y-3 pt-6 break-inside-avoid">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-amber-800 bg-amber-100/80 inline-block px-3 py-1 rounded-lg uppercase tracking-wider print:bg-transparent print:p-0 print:text-base print:text-black">
                  3. Redacción de Resumen
                </h3>
                <span className="text-xs font-bold bg-amber-50 text-amber-900 border border-amber-300 px-2.5 py-0.5 rounded-full print:border-gray-500 print:text-black">
                  Mínimo obligatorio: {resultado.resumen_min_palabras} palabras
                </span>
              </div>

              {!editandoResumen && (
                <div className="flex items-center gap-1 print:hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setBorradorMinPalabras(resultado.resumen_min_palabras || 60);
                      setBorradorResumenModelo(resultado.resumen_modelo || "");
                      setEditandoResumen(true);
                    }}
                    className="text-xs font-semibold text-slate-600 hover:text-amber-800 bg-white border border-slate-200 hover:border-amber-300 px-2.5 py-1 rounded-lg cursor-pointer"
                  >
                    ✏️ Configurar resumen
                  </button>
                  <button
                    type="button"
                    onClick={quitarResumenDeFicha}
                    title="Quitar actividad de resumen"
                    className="text-xs font-semibold text-slate-500 hover:text-rose-700 bg-white border border-slate-200 hover:border-rose-300 px-2 py-1 rounded-lg cursor-pointer"
                  >
                    🗑️
                  </button>
                </div>
              )}
            </div>

            {editandoResumen ? (
              <div className="border-2 border-amber-300 bg-amber-50/40 rounded-xl p-4 space-y-3 print:hidden">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs font-bold text-slate-800">
                    Número mínimo de palabras obligatorio:
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={500}
                    step={5}
                    value={borradorMinPalabras}
                    onChange={(e) => setBorradorMinPalabras(Number(e.target.value))}
                    className="w-24 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-sm font-bold text-center text-slate-900"
                  />
                  <span className="text-xs text-slate-600">palabras</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-emerald-800 mb-1">
                    Resumen modelo / ideas clave esperadas (para solucionario y entrenador IA)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Escribe el resumen de referencia o las ideas principales que debe recoger el alumnado..."
                    value={borradorResumenModelo}
                    onChange={(e) => setBorradorResumenModelo(e.target.value)}
                    className="w-full bg-white border border-emerald-200 rounded-lg p-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <button
                    type="button"
                    onClick={quitarResumenDeFicha}
                    className="text-xs font-semibold text-rose-600 hover:text-rose-800 px-2.5 py-1.5 rounded-lg hover:bg-rose-50 cursor-pointer"
                  >
                    🗑️ Quitar actividad de resumen
                  </button>
                  <button
                    type="button"
                    onClick={guardarEdicionResumen}
                    className="text-xs font-bold text-white bg-amber-700 hover:bg-amber-600 px-4 py-1.5 rounded-lg shadow-xs cursor-pointer"
                  >
                    ✓ Guardar configuración
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <p className="font-medium text-slate-900">
                  Redacta con tus propias palabras un resumen completo que recoja las ideas principales del texto (extensión mínima obligatoria:{" "}
                  <strong>{resultado.resumen_min_palabras} palabras</strong>).
                </p>

                {mostrarRespuestas && (
                  <div className="text-emerald-900 text-sm mt-2 bg-emerald-50 border border-emerald-200/70 p-3 rounded-lg print:hidden">
                    <strong>Resumen modelo de referencia:</strong>{" "}
                    {resultado.resumen_modelo ? (
                      resultado.resumen_modelo
                    ) : (
                      <span className="italic text-emerald-700/80">
                        El entrenador IA evaluará la fidelidad a las ideas principales del texto y comprobará el mínimo de {resultado.resumen_min_palabras} palabras.
                      </span>
                    )}
                  </div>
                )}

                <div className="hidden print:block mt-4 space-y-5">
                  <div className="border-b border-gray-400 h-4" />
                  <div className="border-b border-gray-400 h-4" />
                  <div className="border-b border-gray-400 h-4" />
                  <div className="border-b border-gray-400 h-4" />
                  <div className="border-b border-gray-400 h-4" />
                  <div className="border-b border-gray-400 h-4" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="pt-4 print:hidden">
            <button
              type="button"
              onClick={activarResumenEnFicha}
              className="text-xs font-bold px-3.5 py-2 rounded-lg border bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-200 transition cursor-pointer"
            >
              + Añadir actividad final: Redacción de resumen
            </button>
          </div>
        )}
      </div>

      {/* BLOQUE 2 (SOLO PDF): SOLUCIONARIO EN HOJA APARTE */}
      <div className="hidden print:block print:break-before-page">
        <div className="border-b-2 border-gray-800 pb-3 mb-6">
          <div className="flex justify-between items-start gap-4">
            <div>
              <span className="font-bold text-lg uppercase tracking-wide block">
                DialectIA · IESO Sierra la Mesta
              </span>
              <span className="text-xs text-gray-600 block">
                Entrenador de Competencia Lingüística — Programa NEXO (Educalectura-Educalem)
              </span>
            </div>
            <span className="text-sm font-semibold uppercase tracking-wider text-gray-700 shrink-0">
              Solucionario para el Docente
            </span>
          </div>
          <p className="text-base font-bold text-black mt-2">
            Actividad: {resultado.titulo}
          </p>
        </div>

        {resultado.preguntas_literales?.length > 0 && (
          <div className="space-y-3 mb-6">
            <h3 className="text-base font-bold uppercase tracking-wider text-black">
              1. Soluciones — Comprensión Literal
            </h3>
            <ol className="list-decimal pl-5 space-y-4">
              {resultado.preguntas_literales.map((item, i) => (
                <li key={i} className="break-inside-avoid text-sm">
                  <p className="font-bold text-black">{item.pregunta}</p>
                  <p className="text-gray-800 mt-1">
                    <strong>Respuesta:</strong> {item.respuesta}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {resultado.preguntas_inferenciales?.length > 0 && (
          <div className="space-y-3 mb-6">
            <h3 className="text-base font-bold uppercase tracking-wider text-black">
              2. Soluciones — Comprensión Inferencial
            </h3>
            <ol className="list-decimal pl-5 space-y-4">
              {resultado.preguntas_inferenciales.map((item, i) => (
                <li key={i} className="break-inside-avoid text-sm">
                  <p className="font-bold text-black">{item.pregunta}</p>
                  <p className="text-gray-800 mt-1">
                    <strong>Respuesta:</strong> {item.respuesta}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        )}

        {tieneResumen && (
          <div className="space-y-2 break-inside-avoid">
            <h3 className="text-base font-bold uppercase tracking-wider text-black">
              3. Criterios — Redacción de Resumen (Mínimo {resultado.resumen_min_palabras} palabras)
            </h3>
            <p className="text-sm text-gray-800">
              {resultado.resumen_modelo
                ? resultado.resumen_modelo
                : `Debe recoger las ideas principales del texto con cohesión y vocabulario propio, alcanzando al menos ${resultado.resumen_min_palabras} palabras.`}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}