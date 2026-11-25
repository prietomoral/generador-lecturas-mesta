"use client";

import React, { useState, useEffect } from "react";
import { FormLectura, MediaTipo, obtenerTemaAleatorio } from "../types/lectura";

interface FormularioLecturaProps {
  form: FormLectura;
  setForm: React.Dispatch<React.SetStateAction<FormLectura>>;
  cargando: boolean;
  segundosRestantes: number;
  onSubmit: (e: React.FormEvent) => void;
  onPdfChange?: (url: string | null) => void;
}

async function comprimirAudioEnNavegador(file: File): Promise<Blob> {
  if (file.size <= 4 * 1024 * 1024) return file;

  try {
    const arrayBuffer = await file.arrayBuffer();
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const audioCtx = new AudioCtx();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const targetRate = 8000;
    const numSamples = Math.ceil(audioBuffer.duration * targetRate);
    const offlineCtx = new OfflineAudioContext(1, numSamples, targetRate);

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    await audioCtx.close();

    const samples = rendered.getChannelData(0);
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const escribirTexto = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    };

    escribirTexto(0, "RIFF");
    view.setUint32(4, 36 + samples.length * 2, true);
    escribirTexto(8, "WAVE");
    escribirTexto(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    escribirTexto(36, "data");
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return new Blob([buffer], { type: "audio/wav" });
  } catch {
    return file;
  }
}

export default function FormularioLectura({
  form,
  setForm,
  cargando,
  segundosRestantes,
  onSubmit,
  onPdfChange,
}: FormularioLecturaProps) {
  const [extrayendoArchivo, setExtrayendoArchivo] = useState(false);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pestanaSubida, setPestanaSubida] = useState<"visor" | "texto">("visor");

  const [enlaceOralInput, setEnlaceOralInput] = useState(form.mediaUrl || "");
  const [extrayendoOral, setExtrayendoOral] = useState(false);
  const [pestanaOral, setPestanaOral] = useState<"reproductor" | "transcripcion">("reproductor");

  const modo = form.modoOrigen || "generar";
  const bloqueoActivo = form.bloqueo_secuencial ?? false;

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) {
        URL.revokeObjectURL(pdfPreviewUrl);
      }
    };
  }, [pdfPreviewUrl]);

  const ajustarPreguntas = (campo: "numLiterales" | "numInferenciales", delta: number) => {
    setForm((prev) => ({
      ...prev,
      [campo]: Math.min(10, Math.max(0, prev[campo] + delta)),
    }));
  };

  const manejarSubidaArchivo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }

    const esPdf = file.name.toLowerCase().endsWith(".pdf");
    if (esPdf) {
      const urlTemporal = URL.createObjectURL(file);
      setPdfPreviewUrl(urlTemporal);
      onPdfChange?.(urlTemporal);
      setPestanaSubida("visor");
    } else {
      onPdfChange?.(null);
      setPestanaSubida("texto");
    }

    setExtrayendoArchivo(true);
    setNombreArchivo(file.name);

    try {
      const fd = new FormData();
      fd.append("archivo", file);

      const res = await fetch("/api/extraer-texto", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || "No se pudo extraer el texto del documento.");
      }

      setForm((prev) => ({
        ...prev,
        tituloPropio: prev.tituloPropio || data.tituloSugerido,
        textoPropio: data.texto,
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al leer el archivo.";
      alert(msg);
      if (!esPdf) {
        setNombreArchivo("");
      }
    } finally {
      setExtrayendoArchivo(false);
      e.target.value = "";
    }
  };

  const limpiarArchivoSubido = () => {
    if (pdfPreviewUrl) {
      URL.revokeObjectURL(pdfPreviewUrl);
      setPdfPreviewUrl(null);
    }
    onPdfChange?.(null);
    setNombreArchivo("");
    setPestanaSubida("visor");
    setForm((prev) => ({ ...prev, tituloPropio: "", textoPropio: "" }));
  };

  const manejarExtraccionOral = async () => {
    const urlLimpia = enlaceOralInput.trim();
    if (!urlLimpia) {
      alert("Pega primero un enlace de YouTube o de un archivo de audio/vídeo, o súbelo desde tu equipo.");
      return;
    }

    setExtrayendoOral(true);
    try {
      const res = await fetch("/api/extraer-oral", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: urlLimpia }),
      });

      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`El servidor devolvió estado ${res.status} al procesar el enlace.`);
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || "No se pudo extraer la transcripción del enlace.");
      }

      setForm((prev) => ({
        ...prev,
        mediaUrl: data.mediaEmbedUrl,
        mediaTipo: data.mediaTipo as MediaTipo,
        tituloPropio: prev.tituloPropio || data.tituloSugerido,
        textoPropio: data.transcripcion || prev.textoPropio || "",
      }));

      if (data.aviso) {
        setPestanaOral("transcripcion");
        alert(data.aviso);
      } else {
        setPestanaOral("reproductor");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Error al procesar el vídeo o audio.";
      alert(msg);
    } finally {
      setExtrayendoOral(false);
    }
  };

  const manejarSubidaArchivoOral = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const urlLocal = URL.createObjectURL(file);
    const esVideo =
      file.type.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv)$/i.test(file.name);

    setExtrayendoOral(true);
    try {
      const archivoParaTranscribir = await comprimirAudioEnNavegador(file);
      const fd = new FormData();
      fd.append(
        "archivo",
        archivoParaTranscribir,
        archivoParaTranscribir === file ? file.name : "audio-comprimido.wav"
      );

      const res = await fetch("/api/extraer-oral", {
        method: "POST",
        body: fd,
      });

      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          `El servidor devolvió estado ${res.status}. Si el audio es muy largo, prueba con un fragmento más corto (máx. 10-12 min).`
        );
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || "No se pudo transcribir el archivo.");
      }

      const tituloSinExtension = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      setEnlaceOralInput(file.name);
      setForm((prev) => ({
        ...prev,
        mediaUrl: urlLocal,
        mediaTipo: esVideo ? "video" : "audio",
        tituloPropio: prev.tituloPropio || tituloSinExtension || data.tituloSugerido,
        textoPropio: data.transcripcion,
      }));
      setPestanaOral("reproductor");
    } catch (err: unknown) {
      URL.revokeObjectURL(urlLocal);
      const msg = err instanceof Error ? err.message : "Error al transcribir el audio.";
      alert(msg);
    } finally {
      setExtrayendoOral(false);
      e.target.value = "";
    }
  };

  const limpiarEnlaceOral = () => {
    if (form.mediaUrl && form.mediaUrl.startsWith("blob:")) {
      URL.revokeObjectURL(form.mediaUrl);
    }
    setEnlaceOralInput("");
    setPestanaOral("reproductor");
    setForm((prev) => ({
      ...prev,
      mediaUrl: undefined,
      mediaTipo: undefined,
      tituloPropio: "",
      textoPropio: "",
    }));
  };

  return (
    <form
      onSubmit={onSubmit}
      className="bg-white rounded-2xl shadow-lg shadow-slate-200/70 border border-slate-200/80 p-6 sm:p-8 space-y-6 print:hidden"
    >
      {/* Selector de Origen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 bg-slate-100 rounded-xl border border-slate-200/80">
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, modoOrigen: "generar" }))}
          className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
            modo === "generar"
              ? "bg-white text-blue-700 shadow-sm ring-1 ring-slate-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          ✨ Generar lectura con IA
        </button>
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, modoOrigen: "subir" }))}
          className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
            modo === "subir"
              ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          📄 Subir documento / texto
        </button>
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, modoOrigen: "oral" }))}
          className={`py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition cursor-pointer ${
            modo === "oral"
              ? "bg-white text-teal-700 shadow-sm ring-1 ring-slate-200"
              : "text-slate-600 hover:text-slate-900"
          }`}
        >
          🎧 Comprensión Oral (Vídeo / Audio)
        </button>
      </div>

      {/* Bloque 1: Nivel y Características */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-blue-100 text-blue-700 flex items-center justify-center text-xs">
            1
          </span>
          {modo === "generar"
            ? "Nivel y estructura del texto"
            : "Nivel del alumnado y dificultad de preguntas"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              Edad / Nivel del alumnado
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
              value={form.edad}
              onChange={(e) => setForm({ ...form, edad: e.target.value })}
            >
              <option>6-7 años (1º-2º Primaria)</option>
              <option>8-9 años (3º-4º Primaria)</option>
              <option>10-11 años (5º-6º Primaria)</option>
              <option>12-14 años (1º-2º ESO)</option>
              <option>15-16 años (3º-4º ESO)</option>
              <option>+17 años (Bachillerato / Adultos)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">
              {modo === "generar"
                ? "Complejidad léxica y sintáctica"
                : "Complejidad de las preguntas"}
            </label>
            <select
              className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
              value={form.dificultad}
              onChange={(e) => setForm({ ...form, dificultad: e.target.value })}
            >
              <option value="Baja (vocabulario sencillo y frases cortas)">
                Baja (vocabulario sencillo / apoyo NEAE)
              </option>
              <option value="Media">Media (estándar del nivel)</option>
              <option value="Alta (léxico rico y sintaxis compleja)">
                Alta (léxico rico y complejo)
              </option>
            </select>
          </div>

          {modo === "generar" && (
            <>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Tipología textual
                </label>
                <select
                  className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-3.5 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
                  value={form.tipoTextoSelect}
                  onChange={(e) => setForm({ ...form, tipoTextoSelect: e.target.value })}
                >
                  <option>Narrativo (cuento o relato)</option>
                  <option>Expositivo / Divulgativo</option>
                  <option>Argumentativo / Opinión</option>
                  <option>Periodístico (noticia o crónica)</option>
                  <option>Instructivo (receta o experimento)</option>
                  <option value="Otro">Otro (especificar formato...)</option>
                </select>
                {form.tipoTextoSelect === "Otro" && (
                  <input
                    type="text"
                    required
                    placeholder="Ej: Carta formal, diálogo teatral, fábula..."
                    className="w-full border border-blue-300 bg-blue-50/50 text-sm rounded-xl px-3.5 py-2.5 mt-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
                    value={form.tipoTextoOtro}
                    onChange={(e) => setForm({ ...form, tipoTextoOtro: e.target.value })}
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Extensión aproximada
                </label>
                <div className="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
                  {[
                    { label: "Corta", sub: "~125 pal.", val: "Corta (100 - 150 palabras)" },
                    { label: "Media", sub: "~300 pal.", val: "Media (250 - 350 palabras)" },
                    { label: "Larga", sub: "~575 pal.", val: "Larga (500 - 650 palabras)" },
                  ].map((op) => {
                    const activo = form.extension === op.val;
                    return (
                      <button
                        type="button"
                        key={op.label}
                        onClick={() => setForm({ ...form, extension: op.val })}
                        className={`py-1.5 px-2 rounded-lg text-center transition-all cursor-pointer ${
                          activo
                            ? "bg-white text-blue-700 shadow-sm font-bold ring-1 ring-slate-200"
                            : "text-slate-600 hover:text-slate-900 font-medium"
                        }`}
                      >
                        <div className="text-xs sm:text-sm">{op.label}</div>
                        <div className="text-[10px] opacity-75">{op.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <hr className="border-slate-100" />

      {/* Bloque 2: Contenido Curricular O Documento Subido O Recurso Oral */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs">
            2
          </span>
          {modo === "oral"
            ? "Enlace o archivo de vídeo / audio (comprensión oral)"
            : modo === "subir"
            ? "Documento o texto propio"
            : "Temática y currículo"}
        </h2>

        {modo === "oral" ? (
          <div className="space-y-4 bg-teal-50/50 border border-teal-200/80 rounded-2xl p-4 sm:p-5">
            <div>
              <div className="text-sm font-bold text-teal-950">
                Pega un enlace de YouTube/URL o sube un archivo de audio o vídeo
              </div>
              <div className="text-xs text-slate-600 mt-0.5">
                Soporta enlaces de <strong>YouTube</strong> (con subtítulos) o archivos locales y enlaces directos{" "}
                <strong>.mp3, .wav, .m4a, .ogg, .mp4, .webm</strong> (se optimizan automáticamente al subir).
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="https://www.youtube.com/watch?v=... o archivo seleccionado"
                className="flex-1 bg-white border border-slate-300 text-slate-800 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 transition"
                value={enlaceOralInput}
                onChange={(e) => setEnlaceOralInput(e.target.value)}
              />
              <button
                type="button"
                disabled={extrayendoOral}
                onClick={manejarExtraccionOral}
                className="px-4 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-600 disabled:bg-slate-400 text-white text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer shrink-0"
              >
                {extrayendoOral ? "⏳ Transcribiendo..." : "🎙️ Extraer enlace"}
              </button>
              <label className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold shadow-xs transition cursor-pointer shrink-0 inline-flex items-center justify-center">
                <span>{extrayendoOral ? "⏳..." : "📂 Subir audio / vídeo"}</span>
                <input
                  type="file"
                  accept="audio/*,video/*,.mp3,.wav,.m4a,.ogg,.mp4,.webm,.mkv"
                  disabled={extrayendoOral}
                  onChange={manejarSubidaArchivoOral}
                  className="hidden"
                />
              </label>
              {form.mediaUrl && (
                <button
                  type="button"
                  onClick={limpiarEnlaceOral}
                  className="px-3 py-2.5 rounded-xl bg-white border border-slate-300 text-xs font-bold text-slate-600 hover:text-rose-700 cursor-pointer"
                >
                  Quitar
                </button>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Título de la actividad oral{" "}
                <span className="text-slate-400 font-normal">
                  (se rellena automáticamente al extraer, puedes editarlo)
                </span>
              </label>
              <input
                type="text"
                placeholder="Ej: Documental sobre el Parque Nacional de Monfragüe"
                className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 transition"
                value={form.tituloPropio || ""}
                onChange={(e) => setForm({ ...form, tituloPropio: e.target.value })}
              />
            </div>

            {form.mediaUrl && (
              <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-teal-200 w-fit">
                <button
                  type="button"
                  onClick={() => setPestanaOral("reproductor")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    pestanaOral === "reproductor"
                      ? "bg-teal-700 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  ▶️ Reproductor embebido
                </button>
                <button
                  type="button"
                  onClick={() => setPestanaOral("transcripcion")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    pestanaOral === "transcripcion"
                      ? "bg-teal-700 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📝 Transcripción extraída ({form.textoPropio?.length || 0} car.)
                </button>
              </div>
            )}

            {form.mediaUrl && pestanaOral === "reproductor" ? (
              <div className="space-y-2">
                {form.mediaTipo === "youtube" && (
                  <div className="w-full aspect-video max-h-[380px] rounded-xl overflow-hidden border border-slate-300 bg-black shadow-inner">
                    <iframe
                      src={form.mediaUrl}
                      title="Vídeo de comprensión oral"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                )}
                {form.mediaTipo === "video" && (
                  <video
                    controls
                    src={form.mediaUrl}
                    className="w-full max-h-[380px] rounded-xl border border-slate-300 bg-black"
                  />
                )}
                {form.mediaTipo === "audio" && (
                  <div className="bg-white border border-teal-200 rounded-xl p-4">
                    <audio controls src={form.mediaUrl} className="w-full" />
                  </div>
                )}
                <p className="text-[11px] text-slate-500">
                  {form.textoPropio
                    ? "La transcripción ya está extraída en segundo plano para generar las preguntas y corregir al alumnado."
                    : "El vídeo está cargado. Pulsa en «Transcripción extraída» para pegar o escribir la transcripción."}
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Transcripción del vídeo o audio <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={6}
                  required
                  placeholder="Aquí aparecerá automáticamente la transcripción extraída del vídeo o audio (también puedes pegarla o revisarla manualmente)..."
                  className="w-full bg-white border border-slate-300 text-slate-800 text-sm leading-relaxed rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-600 transition"
                  value={form.textoPropio || ""}
                  onChange={(e) => setForm({ ...form, textoPropio: e.target.value })}
                />
              </div>
            )}
          </div>
        ) : modo === "subir" ? (
          <div className="space-y-4 bg-indigo-50/40 border border-indigo-200/80 rounded-2xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-indigo-950">
                  Importar archivo o pegar fragmento
                </div>
                <div className="text-xs text-slate-600">
                  Soporta <strong>.pdf</strong> (con visor integrado), <strong>.docx</strong> (Word),{" "}
                  <strong>.txt</strong> y <strong>.md</strong>.
                </div>
              </div>

              <label className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition cursor-pointer">
                <span>
                  {extrayendoArchivo ? "⏳ Extrayendo texto..." : "📂 Subir documento"}
                </span>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt,.md"
                  disabled={extrayendoArchivo}
                  onChange={manejarSubidaArchivo}
                  className="hidden"
                />
              </label>
            </div>

            {nombreArchivo && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                <span>
                  ✓ Archivo cargado: {nombreArchivo}{" "}
                  {extrayendoArchivo && "(extrayendo texto limpio en segundo plano...)"}
                </span>
                <button
                  type="button"
                  onClick={limpiarArchivoSubido}
                  className="text-emerald-900 underline hover:text-rose-700 cursor-pointer"
                >
                  Quitar
                </button>
              </div>
            )}

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Título de la lectura{" "}
                <span className="text-slate-400 font-normal">
                  (opcional, si lo dejas vacío la IA creará uno)
                </span>
              </label>
              <input
                type="text"
                placeholder="Ej: Capítulo 1 de El Lazarillo de Tormes"
                className="w-full bg-white border border-slate-300 text-slate-800 text-sm rounded-xl px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 transition"
                value={form.tituloPropio || ""}
                onChange={(e) => setForm({ ...form, tituloPropio: e.target.value })}
              />
            </div>

            {pdfPreviewUrl && (
              <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-indigo-200/80 w-fit">
                <button
                  type="button"
                  onClick={() => setPestanaSubida("visor")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    pestanaSubida === "visor"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📑 Visor PDF original (con imágenes y diseño)
                </button>
                <button
                  type="button"
                  onClick={() => setPestanaSubida("texto")}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                    pestanaSubida === "texto"
                      ? "bg-indigo-600 text-white shadow-xs"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  📝 Texto extraído depurado ({form.textoPropio?.length || 0} car.)
                </button>
              </div>
            )}

            {pdfPreviewUrl && pestanaSubida === "visor" ? (
              <div className="space-y-2">
                <div className="w-full h-[460px] rounded-xl overflow-hidden border border-slate-300 bg-slate-200 shadow-inner">
                  <iframe
                    src={`${pdfPreviewUrl}#toolbar=1&navpanes=0`}
                    title="Vista previa del PDF original"
                    className="w-full h-full"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Visualizando el documento PDF original. El texto se ha extraído y filtrado en segundo plano para elaborar las preguntas.
                </p>
              </div>
            ) : (
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Texto base para trabajar <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={7}
                  required
                  placeholder="Aquí aparecerá el contenido extraído y depurado de tu PDF/Word, o puedes pegar directamente cualquier texto..."
                  className="w-full bg-white border border-slate-300 text-slate-800 text-sm leading-relaxed rounded-xl p-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-600 transition"
                  value={form.textoPropio || ""}
                  onChange={(e) => setForm({ ...form, textoPropio: e.target.value })}
                />
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="block text-sm font-semibold text-slate-700">
                  Tema principal de la lectura <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        tematica: obtenerTemaAleatorio(prev.tematica),
                      }))
                    }
                    className="text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-2.5 py-1 rounded-lg transition cursor-pointer"
                  >
                    🎲 Otro tema aleatorio
                  </button>
                  {form.tematica && (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, tematica: "" }))}
                      className="text-xs font-medium text-slate-500 hover:text-slate-800 px-2 py-1 rounded-lg transition cursor-pointer"
                    >
                      Limpiar
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                required
                placeholder="Ej: La historia de Extremadura, el cambio climático, un misterio en el instituto..."
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-4 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
                value={form.tematica}
                onChange={(e) => setForm({ ...form, tematica: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Saberes básicos o contenidos relacionados{" "}
                <span className="text-slate-400 font-normal">(opcional)</span>
              </label>
              <input
                type="text"
                placeholder="Ej: Ecosistemas mediterráneos, tiempos verbales del pasado, fracciones..."
                className="w-full bg-slate-50 border border-slate-300 text-slate-800 text-sm rounded-xl px-4 py-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-600 transition"
                value={form.saberes}
                onChange={(e) => setForm({ ...form, saberes: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      <hr className="border-slate-100" />

      {/* Bloque 3: Preguntas de Comprensión + Actividad final de resumen + Bloqueo secuencial */}
      <div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <span className="w-5 h-5 rounded-md bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs">
            3
          </span>
          Batería de preguntas, resumen y modalidad de avance
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200/90 rounded-xl p-3.5">
            <div>
              <div className="text-sm font-semibold text-slate-800">Preguntas Literales</div>
              <div className="text-xs text-slate-500">Información explícita en el contenido</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => ajustarPreguntas("numLiterales", -1)}
                className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition cursor-pointer"
              >
                -
              </button>
              <span className="w-6 text-center font-bold text-slate-800">
                {form.numLiterales}
              </span>
              <button
                type="button"
                onClick={() => ajustarPreguntas("numLiterales", 1)}
                className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition cursor-pointer"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between bg-slate-50 border border-slate-200/90 rounded-xl p-3.5">
            <div>
              <div className="text-sm font-semibold text-slate-800">Preguntas Inferenciales</div>
              <div className="text-xs text-slate-500">Deducción e interpretación</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => ajustarPreguntas("numInferenciales", -1)}
                className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition cursor-pointer"
              >
                -
              </button>
              <span className="w-6 text-center font-bold text-slate-800">
                {form.numInferenciales}
              </span>
              <button
                type="button"
                onClick={() => ajustarPreguntas("numInferenciales", 1)}
                className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 active:scale-95 transition cursor-pointer"
              >
                +
              </button>
            </div>
          </div>
        </div>

        {/* Opción de actividad final: Redacción de resumen */}
        <div className="mt-4 bg-amber-50/50 border border-amber-200/90 rounded-xl p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form.incluirResumen)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    incluirResumen: e.target.checked,
                    minPalabrasResumen: form.minPalabrasResumen || 60,
                  })
                }
                className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  📝 Incluir actividad final: Redacción de resumen
                </div>
                <div className="text-xs text-slate-500">
                  Exige al alumnado redactar una síntesis con un número mínimo de palabras obligatorio
                </div>
              </div>
            </label>

            {form.incluirResumen && (
              <div className="flex items-center gap-2 bg-white border border-amber-200 rounded-lg px-3 py-1.5">
                <label className="text-xs font-bold text-amber-900">
                  Mínimo obligatorio:
                </label>
                <input
                  type="number"
                  min={15}
                  max={500}
                  step={5}
                  value={form.minPalabrasResumen ?? 60}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      minPalabrasResumen: Math.max(10, Number(e.target.value) || 0),
                    })
                  }
                  className="w-20 border border-slate-300 rounded-md px-2 py-1 text-sm font-bold text-center text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                />
                <span className="text-xs font-medium text-slate-600">palabras</span>
              </div>
            )}
          </div>
        </div>

        {/* Opción de configuración docente: Bloqueo secuencial obligatorio */}
        <div className="mt-3 bg-indigo-50/50 border border-indigo-200/90 rounded-xl p-4">
          <label className="flex items-center justify-between gap-3 cursor-pointer">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={bloqueoActivo}
                onChange={(e) =>
                  setForm({
                    ...form,
                    bloqueo_secuencial: e.target.checked,
                  })
                }
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
              />
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  🔒 Bloqueo secuencial obligatorio en el entrenador del alumnado
                </div>
                <div className="text-xs text-slate-500">
                  {bloqueoActivo
                    ? "Activado: el alumnado debe dominar cada pregunta (Comprensión y Expresión) antes de desbloquear la siguiente."
                    : "Desactivado: el alumnado puede responder libremente a todas las preguntas en el orden que prefiera."}
                </div>
              </div>
            </div>
            <span
              className={`text-xs font-extrabold px-3 py-1 rounded-full border shrink-0 ${
                bloqueoActivo
                  ? "bg-indigo-100 text-indigo-900 border-indigo-300"
                  : "bg-slate-100 text-slate-700 border-slate-300"
              }`}
            >
              {bloqueoActivo ? "🔒 Obligatorio" : "🔓 Libre"}
            </span>
          </label>
        </div>
      </div>

      {/* Botón Generar */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={cargando || extrayendoArchivo || extrayendoOral}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3.5 px-6 rounded-xl shadow-md shadow-blue-600/20 transition-all flex items-center justify-center gap-2.5 disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
        >
          {cargando ? (
            <>
              <span className="animate-spin inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full" />
              <span>
                {modo === "oral"
                  ? "Creando preguntas de comprensión oral..."
                  : modo === "subir"
                  ? "Creando preguntas sobre tu texto..."
                  : "Redactando lectura y preguntas..."}
              </span>
              <span className="ml-1 bg-white/20 px-2.5 py-0.5 rounded-md text-xs font-mono">
                {segundosRestantes}s
              </span>
            </>
          ) : (
            <span>
              {modo === "oral"
                ? "🎧 Crear Actividad de Comprensión Oral"
                : modo === "subir"
                ? "🪄 Crear Preguntas a partir de mi Texto"
                : "✨ Generar Actividad de Lectura"}
            </span>
          )}
        </button>
      </div>
    </form>
  );
}
