const URL_RESIDUOS = "https://teachablemachine.withgoogle.com/models/Cq3bknhWc/";
const URL_AUDIO = "https://teachablemachine.withgoogle.com/models/YHWm44_WI/";
const URL_POSES = "https://teachablemachine.withgoogle.com/models/0ZFkP_qyl/";

//selector de secciones 
const panel = nombre => document.querySelector(`[data-panel="${nombre}"]`);

function pintar(lista, preds) {
    preds.sort((a, b) => b.probability - a.probability);
    lista.innerHTML = preds.map(p => {
      const pct = (p.probability * 100).toFixed(0);
      return `<li class="group grid gap-1">
        <div class="flex justify-between text-[.95rem] max-[380px]:text-sm"><b class="font-semibold">${p.className}</b><span class="text-muted tabular-nums">${pct}%</span></div>
        <div class="h-1 overflow-hidden rounded-sm bg-line"><i class="block h-full bg-muted transition-[width] duration-300 group-first:bg-accent" style="width:${pct}%"></i></div>
      </li>`;
    }).join("");
}


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


//residuos
const residuos = panel("residuos");
const estadoResiduos = residuos.querySelector(".estado");
let modeloResiduos;

//funcion para cargar resuidos al modelo 
async function cargarResiduos() {
    try {
      modeloResiduos = await tmImage.load(URL_RESIDUOS + "model.json", URL_RESIDUOS + "metadata.json");
      estadoResiduos.textContent = "Listo. Sube una foto del residuo.";
    } catch (e) {
      estadoResiduos.textContent = "No se pudo cargar el modelo. Revisa la URL.";
    }
}

//ver resultados del modelo
configurarZona(residuos, async vista => {
    if (!modeloResiduos) return;
    estadoResiduos.textContent = "Analizando…";
    pintar(residuos.querySelector(".resultados"), await modeloResiduos.predict(vista));
    estadoResiduos.textContent = "";
});



/* ---- Poses ---- */
const poses = panel("poses");
const estadoPoses = poses.querySelector(".estado");
let modeloPoses;

async function cargarPoses() {
    estadoPoses.textContent = "Cargando modelo…";
    try {
      modeloPoses = await tmPose.load(URL_POSES + "model.json", URL_POSES + "metadata.json");
      estadoPoses.textContent = "Listo. Sube una foto de una persona.";
    } catch (e) {
      estadoPoses.textContent = "No se pudo cargar el modelo. Revisa la URL.";
    }
}

configurarZona(poses, async vista => {
    if (!modeloPoses) return;
    estadoPoses.textContent = "Analizando…";
    // Draw at natural size so PoseNet sees the real proportions, not the cropped preview
    const lienzo = document.createElement("canvas");
    lienzo.width = vista.naturalWidth;
    lienzo.height = vista.naturalHeight;
    lienzo.getContext("2d").drawImage(vista, 0, 0);

    const { pose: esqueleto, posenetOutput } = await modeloPoses.estimatePose(lienzo);
    const lista = poses.querySelector(".resultados");
    if (!esqueleto || esqueleto.score < 0.2) {
      lista.innerHTML = "";
      estadoPoses.textContent = "No se detectó una persona en la imagen.";
      return;
    }
    pintar(lista, await modeloPoses.predict(posenetOutput));
    estadoPoses.textContent = "";
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
const cargas = { residuos: cargarResiduos, audio: cargarAudio, poses: cargarPoses };
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

abrir("residuos");
