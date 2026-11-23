import { NextResponse } from "next/server";
import { Innertube } from "youtubei.js";
import { fetchTranscript } from "youtube-transcript-plus";

export const maxDuration = 60;

function extraerIdYoutube(url) {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtu.be")) {
      return u.pathname.replace("/", "").split("/")[0];
    }
    if (u.hostname.includes("youtube.com")) {
      if (u.pathname.startsWith("/shorts/")) {
        return u.pathname.replace("/shorts/", "").split("/")[0];
      }
      if (u.pathname.startsWith("/embed/")) {
        return u.pathname.replace("/embed/", "").split("/")[0];
      }
      return u.searchParams.get("v");
    }
  } catch {
    return null;
  }
  return null;
}

function decodificarEntidadesHtml(texto) {
  return texto
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .replace(/<[^>]+>/g, " ");
}

function agruparEnParrafos(frases) {
  const limpia = frases
    .map((f) => decodificarEntidadesHtml(String(f || "")).replace(/\s+/g, " ").trim())
    .filter((t) => t && !/^\[.*\]$/.test(t));

  const parrafos = [];
  let actual = "";

  for (const fragmento of limpia) {
    actual = actual ? `${actual} ${fragmento}` : fragmento;
    if (actual.length >= 280 && /[.!?»”"]$/.test(actual)) {
      parrafos.push(actual);
      actual = "";
    }
  }
  if (actual) parrafos.push(actual);
  return parrafos.join("\n\n");
}

async function obtenerTituloYoutube(videoId) {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.title) return data.title;
    }
  } catch {
    // Silencio
  }
  return `Vídeo de YouTube (${videoId})`;
}
async function extraerTranscripcionYoutube(videoId) {
  const tituloSugerido = await obtenerTituloYoutube(videoId);
  const errores = [];

  // VÍA 0 (Prioritaria en Vercel): Supadata API forzando primero español (&lang=es)
  if (process.env.SUPADATA_API_KEY) {
    for (const langParam of ["&lang=es", ""]) {
      try {
        const resSupa = await fetch(
          `https://api.supadata.ai/v1/youtube/transcript?url=https://www.youtube.com/watch?v=${videoId}&text=true${langParam}`,
          {
            headers: { "x-api-key": process.env.SUPADATA_API_KEY },
          }
        );
        if (resSupa.ok) {
          const dataSupa = await resSupa.json();
          const textoCrudo = typeof dataSupa.content === "string" ? dataSupa.content : "";
          const transcripcion = agruparEnParrafos(textoCrudo.split(/(?<=[.!?])\s+/));
          if (transcripcion.length >= 25) {
            return { tituloSugerido, transcripcion };
          }
        } else {
          errores.push(`supadata(${langParam || "default"}:${resSupa.status})`);
        }
      } catch (e) {
        errores.push(`supadata: ${e.message}`);
      }
    }
  }

  // VÍA 1: youtube-transcript-plus (funciona directo en local)
  for (const lang of ["es", undefined]) {
    try {
      const items = await fetchTranscript(videoId, lang ? { lang } : undefined);
      if (Array.isArray(items) && items.length > 0) {
        const transcripcion = agruparEnParrafos(items.map((i) => i.text));
        if (transcripcion.length >= 25) {
          return { tituloSugerido, transcripcion };
        }
      }
    } catch (e) {
      errores.push(`transcript-plus(${lang || "auto"}): ${e.message}`);
    }
  }

  // VÍA 2: youtubei.js con clientes embebidos y móviles
  try {
    const youtube = await Innertube.create({
      lang: "es",
      location: "ES",
      retrieve_player: false,
    });

    for (const cliente of ["TV_EMBEDDED", "WEB_EMBEDDED", "IOS", "ANDROID"]) {
      try {
        const info = await youtube.getBasicInfo(videoId, cliente);
        const tracks = info.captions?.caption_tracks || [];
        if (tracks.length === 0) continue;

        const pista =
          tracks.find((t) => t.language_code === "es" && t.kind !== "asr") ||
          tracks.find((t) => t.language_code?.startsWith("es")) ||
          tracks.find((t) => t.language_code?.startsWith("en")) ||
          tracks[0];

        for (const urlTrack of [`${pista.base_url}&fmt=json3`, pista.base_url]) {
          const resTrack = await fetch(urlTrack);
          if (!resTrack.ok) continue;
          const cuerpo = await resTrack.text();

          let frases = [];
          if (cuerpo.trim().startsWith("{")) {
            const json = JSON.parse(cuerpo);
            frases = (json.events || [])
              .map((ev) => (ev.segs || []).map((s) => s.utf8 || "").join(""))
              .filter(Boolean);
          } else {
            frases = [...cuerpo.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1]);
          }

          const transcripcion = agruparEnParrafos(frases);
          if (transcripcion.length >= 25) {
            return { tituloSugerido, transcripcion };
          }
        }
      } catch (e) {
        errores.push(`innertube(${cliente}): ${e.message}`);
      }
    }
  } catch (e) {
    errores.push(`innertube-init: ${e.message}`);
  }

  // VÍA 3: Extracción directa desde el HTML embebido
  try {
    const resEmbed = await fetch(`https://www.youtube.com/embed/${videoId}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        "Accept-Language": "es-ES,es;q=0.9",
      },
    });
    if (resEmbed.ok) {
      const html = await resEmbed.text();
      const match = html.match(/"captionTracks":(\[.*?\])/);
      if (match) {
        const tracks = JSON.parse(match[1]);
        const pista =
          tracks.find((t) => t.languageCode === "es" && t.kind !== "asr") ||
          tracks.find((t) => t.languageCode?.startsWith("es")) ||
          tracks.find((t) => t.languageCode?.startsWith("en")) ||
          tracks[0];

        if (pista?.baseUrl) {
          const resXml = await fetch(pista.baseUrl);
          const xml = await resXml.text();
          const matches = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)];
          const transcripcion = agruparEnParrafos(matches.map((m) => m[1]));
          if (transcripcion.length >= 25) {
            return { tituloSugerido, transcripcion };
          }
        }
      }
    }
  } catch (e) {
    errores.push(`embed-html: ${e.message}`);
  }

  console.warn("⚠️ [extraer-oral] Detalle de intentos fallidos:", errores);

  return {
    tituloSugerido,
    transcripcion: "",
    aviso:
      "YouTube restringió la descarga automática de subtítulos desde la nube para este vídeo. El vídeo ya está cargado: puedes pegar la transcripción manualmente (en YouTube: Descripción → Mostrar transcripción) o subir el archivo de audio.",
  };
}

async function transcribirBlobConGroq(blob, nombreArchivo) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("Falta GROQ_API_KEY para transcribir archivos de audio/vídeo.");
  }

  if (blob.size > 24 * 1024 * 1024) {
    throw new Error("El archivo supera el límite de 24 MB permitido para transcripción.");
  }

  const fd = new FormData();
  fd.append("file", blob, nombreArchivo);
  fd.append("model", "whisper-large-v3-turbo");
  fd.append("language", "es");
  fd.append("response_format", "verbose_json");

  const resWhisper = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });

  if (!resWhisper.ok) {
    const errTxt = await resWhisper.text();
    throw new Error(`Error al transcribir (${resWhisper.status}): ${errTxt}`);
  }

  const data = await resWhisper.json();
  const segmentos = Array.isArray(data.segments)
    ? data.segments.map((s) => s.text || "")
    : [data.text || ""];

  const transcripcion = agruparEnParrafos(segmentos);
  if (transcripcion.length < 20) {
    throw new Error("No se detectó voz suficiente en el archivo de audio/vídeo.");
  }

  return {
    tituloSugerido: nombreArchivo.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
    transcripcion,
  };
}

export async function POST(request) {
  try {
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const archivo = formData.get("archivo");

      if (!archivo || typeof archivo === "string") {
        return NextResponse.json(
          { error: "No se recibió ningún archivo de audio o vídeo." },
          { status: 400 }
        );
      }

      const nombre = archivo.name || "audio.mp3";
      const esVideo =
        archivo.type?.startsWith("video/") || /\.(mp4|webm|mov|m4v|mkv)$/i.test(nombre);

      const { tituloSugerido, transcripcion } = await transcribirBlobConGroq(archivo, nombre);

      return NextResponse.json({
        mediaTipo: esVideo ? "video" : "audio",
        tituloSugerido,
        transcripcion,
      });
    }

    const { url } = await request.json();
    const urlLimpia = typeof url === "string" ? url.trim() : "";

    if (!urlLimpia) {
      return NextResponse.json(
        { error: "Introduce un enlace válido o sube un archivo de audio/vídeo." },
        { status: 400 }
      );
    }

    const youtubeId = extraerIdYoutube(urlLimpia);

    if (youtubeId) {
      const { tituloSugerido, transcripcion, aviso } = await extraerTranscripcionYoutube(youtubeId);
      return NextResponse.json({
        mediaTipo: "youtube",
        mediaEmbedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}`,
        tituloSugerido,
        transcripcion,
        aviso: aviso || null,
      });
    }

    const resMedia = await fetch(urlLimpia);
    if (!resMedia.ok) {
      throw new Error(`No se pudo descargar el archivo desde el enlace (${resMedia.status}).`);
    }

    const mime = resMedia.headers.get("content-type") || "audio/mpeg";
    const arrayBuffer = await resMedia.arrayBuffer();
    const urlObj = new URL(urlLimpia);
    const nombreArchivo = urlObj.pathname.split("/").pop() || "audio.mp3";
    const blob = new Blob([arrayBuffer], { type: mime });

    const esVideoDirecto = /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(urlLimpia);
    const { tituloSugerido, transcripcion } = await transcribirBlobConGroq(blob, nombreArchivo);

    return NextResponse.json({
      mediaTipo: esVideoDirecto ? "video" : "audio",
      mediaEmbedUrl: urlLimpia,
      tituloSugerido,
      transcripcion,
    });
  } catch (error) {
    console.error("❌ [extraer-oral] Error:", error);
    return NextResponse.json(
      { error: error.message || "No se pudo extraer la transcripción." },
      { status: 500 }
    );
  }
}