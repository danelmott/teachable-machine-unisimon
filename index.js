const URL_IMAGEN = "https://teachablemachine.withgoogle.com/models/Cq3bknhWc/";
const URL_AUDIO = "https://teachablemachine.withgoogle.com/models/YHWm44_WI/";
const URL_POSE = "https://teachablemachine.withgoogle.com/models/0ZFkP_qyl/";

const panel = nombre => document.querySelector(`[data-panel="${nombre}"]`);

// Same result list for the three models: sorted, percentage and bar
function pintar(lista, preds) {
    preds.sort((a, b) => b.probability - a.probability);
    lista.innerHTML = preds.map(p => {
      const pct = (p.probability * 100).toFixed(0);
      return `<li>
        <div class="fila"><b>${p.className}</b><span>${pct}%</span></div>
        <div class="barra"><i style="width:${pct}%"></i></div>
      </li>`;
    }).join("");
}

// Drag & drop / click upload zone shared by the image and pose panels
function configurarZona(seccion, alCargar) {
    const zona = seccion.querySelector(".zona");
    const archivo = zona.querySelector("input");
    const vista = zona.querySelector("img");
    const estado = seccion.querySelector(".estado");

    function mostrar(file) {
      if (!file || !file.type.startsWith("image/")) {
        estado.textContent = "El archivo debe ser una imagen.";
        return;
      }
      vista.src = URL.createObjectURL(file);
      zona.classList.add("con-imagen");
      vista.onload = () => alCargar(vista);
    }

    archivo.addEventListener("change", e => mostrar(e.target.files[0]));

    ["dragenter", "dragover"].forEach(ev =>
    zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add("activa"); }));

    ["dragleave", "drop"].forEach(ev =>
    zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove("activa"); }));

    zona.addEventListener("drop", e => mostrar(e.dataTransfer.files[0]));
}

/* ---- Imagen ---- */
const imagen = panel("imagen");
const estadoImagen = imagen.querySelector(".estado");
let modeloImagen;

async function cargarImagen() {
    try {
      modeloImagen = await tmImage.load(URL_IMAGEN + "model.json", URL_IMAGEN + "metadata.json");
      estadoImagen.textContent = "Listo. Sube una imagen.";
    } catch (e) {
      estadoImagen.textContent = "No se pudo cargar el modelo. Revisa la URL.";
    }
}

configurarZona(imagen, async vista => {
    if (!modeloImagen) return;
    estadoImagen.textContent = "Analizando…";
    pintar(imagen.querySelector(".resultados"), await modeloImagen.predict(vista));
    estadoImagen.textContent = "";
});

/* ---- Pose ---- */
const pose = panel("pose");
const estadoPose = pose.querySelector(".estado");
let modeloPose;

async function cargarPose() {
    estadoPose.textContent = "Cargando modelo…";
    try {
      modeloPose = await tmPose.load(URL_POSE + "model.json", URL_POSE + "metadata.json");
      estadoPose.textContent = "Listo. Sube una foto de una persona.";
    } catch (e) {
      estadoPose.textContent = "No se pudo cargar el modelo. Revisa la URL.";
    }
}

configurarZona(pose, async vista => {
    if (!modeloPose) return;
    estadoPose.textContent = "Analizando…";
    // Draw at natural size so PoseNet sees the real proportions, not the cropped preview
    const lienzo = document.createElement("canvas");
    lienzo.width = vista.naturalWidth;
    lienzo.height = vista.naturalHeight;
    lienzo.getContext("2d").drawImage(vista, 0, 0);

    const { pose: esqueleto, posenetOutput } = await modeloPose.estimatePose(lienzo);
    const lista = pose.querySelector(".resultados");
    if (!esqueleto || esqueleto.score < 0.2) {
      lista.innerHTML = "";
      estadoPose.textContent = "No se detectó una persona en la imagen.";
      return;
    }
    pintar(lista, await modeloPose.predict(posenetOutput));
    estadoPose.textContent = "";
});

/* ---- Audio ---- */
const audio = panel("audio");
const estadoAudio = audio.querySelector(".estado");
const zonaAudio = audio.querySelector(".zona");
const botonAudio = audio.querySelector(".escuchar");
let reconocedor;
let sinSonido;

async function cargarAudio() {
    estadoAudio.textContent = "Cargando modelo…";
    try {
      reconocedor = speechCommands.create("BROWSER_FFT", undefined, URL_AUDIO + "model.json", URL_AUDIO + "metadata.json");
      await reconocedor.ensureModelLoaded();
      botonAudio.disabled = false;
      estadoAudio.textContent = "Listo. Pulsa Escuchar y permite el micrófono.";
    } catch (e) {
      console.error(e);
      estadoAudio.textContent = `No se pudo cargar el modelo de audio (${e.message}).`;
    }
}

async function escuchar() {
    const etiquetas = reconocedor.wordLabels();
    const lista = audio.querySelector(".resultados");
    try {
      await reconocedor.listen(r => {
        clearTimeout(sinSonido);
        estadoAudio.textContent = "Escuchando…";
        pintar(lista, etiquetas.map((className, i) => ({ className, probability: r.scores[i] })));
      }, {
        // Threshold 0 + no suppression: update the bars continuously, like the Teachable Machine preview
        probabilityThreshold: 0,
        suppressionTimeMillis: 0,
        overlapFactor: 0.5,
        invokeCallbackOnNoiseAndUnknown: true
      });
      zonaAudio.classList.add("activa");
      botonAudio.textContent = "Detener";
      estadoAudio.textContent = "Escuchando…";
      // The library silently ignores frames while the microphone delivers no signal
      sinSonido = setTimeout(() => {
        estadoAudio.textContent = "No llega sonido del micrófono. Revisa que esté seleccionado el micrófono correcto y que no esté silenciado.";
      }, 4000);
    } catch (e) {
      console.error(e);
      estadoAudio.textContent = e.name === "NotAllowedError"
        ? "Permiso de micrófono denegado. Actívalo en el candado de la barra de direcciones."
        : `No se pudo acceder al micrófono (${e.name}: ${e.message}).`;
    }
}

async function detener() {
    if (!reconocedor || !reconocedor.isListening()) return;
    clearTimeout(sinSonido);
    await reconocedor.stopListening();
    zonaAudio.classList.remove("activa");
    botonAudio.textContent = "Escuchar";
    estadoAudio.textContent = "Detenido.";
}

botonAudio.addEventListener("click", () => reconocedor.isListening() ? detener() : escuchar());

/* ---- Pestañas ---- */
// Each model is loaded the first time its tab is opened
const cargas = { imagen: cargarImagen, audio: cargarAudio, pose: cargarPose };
const cargados = new Set();

function abrir(nombre) {
    document.querySelectorAll("[data-tab]").forEach(b =>
      b.setAttribute("aria-selected", b.dataset.tab === nombre));
    document.querySelectorAll("[data-panel]").forEach(s =>
      s.hidden = s.dataset.panel !== nombre);
    if (nombre !== "audio") detener();
    if (!cargados.has(nombre)) {
      cargados.add(nombre);
      cargas[nombre]();
    }
}

document.querySelectorAll("[data-tab]").forEach(b =>
  b.addEventListener("click", () => abrir(b.dataset.tab)));

abrir("imagen");
