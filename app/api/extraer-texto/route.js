import { NextResponse } from "next/server";
import mammoth from "mammoth";
import PDFParser from "pdf2json";

function limpiarYReconstruirPdf(pdfData) {
  const pages = pdfData?.Pages || [];
  if (pages.length === 0) return "";

  const textoPorPagina = pages.map((page) => {
    const pageHeight = page.Height || 50;
    const textos = page.Texts || [];

    // 1. Extraer fragmentos con coordenadas y filtrar encabezados/pies de página extremos
    const fragmentos = textos
      .map((t) => {
        const raw = (t.R || [])
          .map((r) => {
            try {
              return decodeURIComponent(r.T || "");
            } catch {
              return r.T || "";
            }
          })
          .join("");
        return {
          x: t.x || 0,
          y: t.y || 0,
          text: raw,
        };
      })
      .filter((f) => f.text.trim().length > 0)
      .filter((f) => {
        // Descarta franjas típicas de encabezado (6% superior) y pie de página (6% inferior)
        const enMargenSuperior = f.y < pageHeight * 0.06;
        const enMargenInferior = f.y > pageHeight * 0.93;
        return !enMargenSuperior && !enMargenInferior;
      });

    // 2. Ordenar por coordenada vertical (y) y luego horizontal (x)
    fragmentos.sort((a, b) => {
      if (Math.abs(a.y - b.y) < 0.35) {
        return a.x - b.x;
      }
      return a.y - b.y;
    });

    // 3. Agrupar fragmentos en líneas visuales
    const lineas = [];
    for (const frag of fragmentos) {
      const ultima = lineas[lineas.length - 1];
      if (ultima && Math.abs(ultima.y - frag.y) < 0.35) {
        const necesitaEspacio =
          !ultima.texto.endsWith(" ") &&
          !frag.text.startsWith(" ") &&
          !/^[,.;:!?)\]»”]/.test(frag.text.trim());
        ultima.texto += (necesitaEspacio ? " " : "") + frag.text;
      } else {
        lineas.push({ y: frag.y, texto: frag.text });
      }
    }

    // 4. Filtrar líneas residuales (números de página aislados) y reconstruir párrafos
    const parrafos = [];
    let parrafoActual = "";
    let yAnterior = null;

    for (const linea of lineas) {
      const limpia = linea.texto.replace(/\s+/g, " ").trim();
      if (!limpia) continue;

      // Ignora números de página sueltos tipo "1", "- 2 -", "Página 3", "3 de 10"
      if (/^[-–—]?\s*(p[aá]g(ina)?\.?\s*)?\d+(\s*(\/|de)\s*\d+)?\s*[-–—]?$/i.test(limpia)) {
        continue;
      }

      const saltoGrande = yAnterior !== null && linea.y - yAnterior > 1.45;
      const terminaOracion = /[.!?»”"]$/.test(parrafoActual);
      const empiezaMayuscula = /^[A-ZÁÉÍÓÚÑ¡¿«"“]/.test(limpia);

      if (!parrafoActual) {
        parrafoActual = limpia;
      } else if (saltoGrande && (terminaOracion || empiezaMayuscula)) {
        parrafos.push(parrafoActual);
        parrafoActual = limpia;
      } else if (parrafoActual.endsWith("-") && /^[a-záéíóúñ]/.test(limpia)) {
        // Une palabras cortadas por guion al final de línea
        parrafoActual = parrafoActual.slice(0, -1) + limpia;
      } else {
        parrafoActual += " " + limpia;
      }

      yAnterior = linea.y;
    }

    if (parrafoActual) {
      parrafos.push(parrafoActual);
    }

    return parrafos.join("\n\n");
  });

  return textoPorPagina
    .filter(Boolean)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extraerTextoDePdf(buffer) {
  return new Promise((resolve, reject) => {
    const pdfParser = new PDFParser(null, 1);

    pdfParser.on("pdfParser_dataError", (errData) => {
      reject(new Error(errData?.parserError || "Error interno al leer el PDF."));
    });

    pdfParser.on("pdfParser_dataReady", (pdfData) => {
      const textoDepurado = limpiarYReconstruirPdf(pdfData);
      if (textoDepurado.length >= 40) {
        resolve(textoDepurado);
      } else {
        // Respaldo por si el PDF tiene coordenadas atípicas
        resolve(pdfParser.getRawTextContent() || "");
      }
    });

    pdfParser.parseBuffer(buffer);
  });
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const archivo = formData.get("archivo");

    if (!archivo) {
      return NextResponse.json(
        { error: "No se ha recibido ningún archivo." },
        { status: 400 }
      );
    }

    const nombre = archivo.name.toLowerCase();
    const arrayBuffer = await archivo.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    let textoExtraido = "";

    if (nombre.endsWith(".txt") || nombre.endsWith(".md")) {
      textoExtraido = buffer.toString("utf-8");
    } else if (nombre.endsWith(".docx")) {
      const resultado = await mammoth.extractRawText({ buffer });
      textoExtraido = resultado.value;
    } else if (nombre.endsWith(".pdf")) {
      textoExtraido = await extraerTextoDePdf(buffer);
    } else {
      return NextResponse.json(
        { error: "Formato no soportado. Usa PDF, DOCX, TXT o MD." },
        { status: 400 }
      );
    }

    const textoLimpio = textoExtraido
      .replace(/----------------Page \(\d+\) Break----------------/g, "\n\n")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (textoLimpio.length < 40) {
      return NextResponse.json(
        {
          error:
            "El documento parece estar vacío o es un PDF escaneado como imagen sin texto seleccionable.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      tituloSugerido: archivo.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " "),
      texto: textoLimpio,
    });
  } catch (error) {
    console.error("❌ [extraer-texto] Error:", error);
    return NextResponse.json(
      { error: "No se pudo leer el archivo: " + error.message },
      { status: 500 }
    );
  }
}