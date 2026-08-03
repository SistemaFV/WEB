"""
Procesa los logos de clientes y regenera el carrusel de la pagina.

Para sumar un cliente basta con dejar su imagen en esta carpeta y hacer push:
el flujo de GitHub Actions corre este script, genera la version publicable y
reescribe el bloque de logos en index.html. No hay que editar nada a mano.

Que hace con cada archivo, en automatico:

  fondo claro y uniforme  -> se recorta y queda transparente, en sus colores
  fondo oscuro y uniforme -> se conserva como placa redondeada, porque la
                             marca es clara y sin placa desapareceria sobre
                             el fondo claro de la pagina
  fondo no uniforme       -> es una fotografia con el logo encima; se deja tal
                             cual dentro de una placa redondeada

El fondo se detecta por relleno desde los bordes, no por color global: asi un
blanco interior del logo -el contrachapado de una letra, por ejemplo- no se
vuelve un agujero transparente.

Uso:  python procesar_logos.py
"""

import json
import os
import re
import unicodedata

import numpy as np
from PIL import Image, ImageDraw

AQUI = os.path.dirname(os.path.abspath(__file__))
SALIDA = os.path.join(AQUI, "procesados")
INDEX = os.path.abspath(os.path.join(AQUI, "..", "..", "..", "index.html"))
MANIFIESTO = os.path.join(AQUI, "logos.json")

CAJA = (420, 150)          # caja comun: iguala el peso optico de cada logo
MARGEN_PLACA = 16          # aire dentro de la placa redondeada
RADIO_PLACA = 22
UMBRAL_RELLENO = 46        # tolerancia de color al recortar el fondo
VARIANZA_FOTO = 34         # sobre esto, el borde no es un color plano

EXTENSIONES = (".png", ".jpg", ".jpeg", ".webp")
IGNORAR_DIRS = {"procesados", "mono"}

# Nombres para el atributo alt. Si un archivo no esta aca se deduce del
# nombre, asi que un cliente nuevo funciona sin tocar el script.
NOMBRES = {
    "ByS_Hormigones": "B&S Hormigones",
    "auter": "Auter Automática y Regulación",
    "grenergy": "Grenergy",
    "iSiete": "iSiete Constructora",
    "independencia": "Constructora Independencia",
    "malpo": "Malpo Constructora e Inmobiliaria",
    "nuevos_aires": "Constructora Nuevos Aires",
    "rahuen": "Rahuen Constructora",
    "saurias": "Constructora Suarias",
    "sigdo_koopers": "Sigdo Koppers",
}

# Texto de cierre del carrusel, tratado como un logo mas.
CIERRE = "Entre otros colaboradores"


def nombre_visible(clave: str) -> str:
    if clave in NOMBRES:
        return NOMBRES[clave]
    limpio = re.sub(r"[_-]+", " ", clave).strip()
    return limpio[:1].upper() + limpio[1:]


def luminancia(c) -> float:
    return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]


def analizar_borde(im: Image.Image):
    """Color y dispersion del marco exterior: dice si el fondo es plano."""
    a = np.asarray(im.convert("RGB")).astype(float)
    borde = np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]])
    return np.median(borde, axis=0), float(borde.std(axis=0).mean())


def recortar_fondo(im: Image.Image, tolerancia: int) -> Image.Image:
    """Vuelve transparente el fondo conectado a los bordes.

    Se usa relleno por difusion desde las cuatro esquinas en vez de comparar
    contra un color global, para no perforar zonas del mismo color que esten
    dentro del logo.
    """
    rgb = im.convert("RGB")
    marca = (1, 254, 3)  # color testigo, improbable en un logo real
    trabajo = rgb.copy()
    w, h = trabajo.size
    for semilla in [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]:
        ImageDraw.floodfill(trabajo, semilla, marca, thresh=tolerancia)

    es_fondo = (np.asarray(trabajo) == np.array(marca)).all(axis=2)

    salida = np.dstack([
        np.asarray(rgb).astype(np.uint8),
        np.where(es_fondo, 0, 255).astype(np.uint8),
    ])
    return Image.fromarray(salida, "RGBA")


def placa(im: Image.Image, color) -> Image.Image:
    """Monta la imagen sobre un rectangulo redondeado del color dado."""
    ancho = im.width + MARGEN_PLACA * 2
    alto = im.height + MARGEN_PLACA * 2
    fondo = Image.new("RGBA", (ancho, alto), (0, 0, 0, 0))
    mascara = Image.new("L", (ancho * 4, alto * 4), 0)
    ImageDraw.Draw(mascara).rounded_rectangle(
        [0, 0, ancho * 4 - 1, alto * 4 - 1], radius=RADIO_PLACA * 4, fill=255
    )
    mascara = mascara.resize((ancho, alto), Image.LANCZOS)
    fondo.paste(Image.new("RGBA", (ancho, alto), tuple(color) + (255,)), (0, 0))
    fondo.putalpha(mascara)
    fondo.alpha_composite(im, (MARGEN_PLACA, MARGEN_PLACA))
    return fondo


def encajar(im: Image.Image) -> Image.Image:
    caja = im.getbbox()
    if caja:
        im = im.crop(caja)
    cw, ch = CAJA
    escala = min(cw / im.width, ch / im.height)
    im = im.resize((max(1, round(im.width * escala)),
                    max(1, round(im.height * escala))), Image.LANCZOS)
    lienzo = Image.new("RGBA", CAJA, (0, 0, 0, 0))
    lienzo.paste(im, ((cw - im.width) // 2, (ch - im.height) // 2))
    return lienzo


def procesar(ruta: str):
    original = Image.open(ruta)
    im = original.convert("RGBA")

    # Un PNG que ya trae transparencia util viene listo: se respeta.
    if np.asarray(im)[:, :, 3].min() < 250:
        return encajar(im), "alfa propio"

    color_borde, dispersion = analizar_borde(im)

    if dispersion > VARIANZA_FOTO:
        # Fotografia: no hay fondo que recortar sin romper la imagen.
        return encajar(placa(im, (18, 20, 24))), "foto sobre placa"

    recortado = recortar_fondo(im, UMBRAL_RELLENO)

    if luminancia(color_borde) < 128:
        # Fondo oscuro: la marca es clara y necesita conservar su placa, o
        # desaparece sobre el fondo claro de la pagina.
        caja = recortado.getbbox()
        if caja:
            recortado = recortado.crop(caja)
        return encajar(placa(recortado, color_borde.astype(int))), "placa oscura"

    return encajar(recortado), "fondo recortado"


def guardar_si_cambio(im: Image.Image, destino: str) -> bool:
    """Escribe el PNG solo si su contenido visual cambió.

    Comparar los bytes del archivo no sirve: dos versiones de Pillow comprimen
    distinto y producen archivos diferentes para la misma imagen. Sin esta
    comprobación, cada ejecución en un entorno distinto al anterior reescribe
    los diez logos y genera un commit de binarios que no cambia nada.
    Se comparan los píxeles.
    """
    if os.path.exists(destino):
        try:
            with Image.open(destino) as previo:
                if previo.size == im.size and previo.mode == im.mode:
                    if np.array_equal(np.asarray(previo), np.asarray(im)):
                        return False
        except Exception:
            pass  # ilegible o corrupto: se reescribe
    im.save(destino, optimize=True)
    return True


def bloque_html(entradas) -> str:
    filas = []
    for pasada in (False, True):
        for e in entradas:
            oculto = ' aria-hidden="true"' if pasada else ""
            alt = "" if pasada else e["nombre"]
            filas.append(
                f'              <li class="logo-item"{oculto}>\n'
                f'                <img src="assets/img/logo_clientes/procesados/{e["archivo"]}"\n'
                f'                     alt="{alt}" width="{CAJA[0]}" height="{CAJA[1]}"\n'
                f'                     loading="lazy" decoding="async" />\n'
                f"              </li>"
            )
        filas.append(
            f'              <li class="logo-item logo-item--texto"{" aria-hidden=\"true\"" if pasada else ""}>'
            f"{CIERRE}</li>"
        )
    return "\n".join(filas)


def main():
    os.makedirs(SALIDA, exist_ok=True)

    archivos = sorted(
        f for f in os.listdir(AQUI)
        if f.lower().endswith(EXTENSIONES) and os.path.isfile(os.path.join(AQUI, f))
    )

    entradas = []
    escritos = 0
    for archivo in archivos:
        clave = os.path.splitext(archivo)[0]
        im, criterio = procesar(os.path.join(AQUI, archivo))
        destino = clave + ".png"
        cambio = guardar_si_cambio(im, os.path.join(SALIDA, destino))
        escritos += cambio
        entradas.append({"archivo": destino, "nombre": nombre_visible(clave)})
        print(f"  {archivo:26} -> {destino:26} ({criterio})"
              f"{'' if cambio else '  [sin cambios]'}")

    print(f"\n{escritos} de {len(entradas)} imagenes reescritas.")

    # Se ordenan por nombre visible para que el carrusel sea estable entre
    # ejecuciones y el diff del commit sea limpio.
    entradas.sort(key=lambda e: unicodedata.normalize("NFKD", e["nombre"]).lower())

    with open(MANIFIESTO, "w", encoding="utf-8") as fh:
        json.dump(entradas, fh, ensure_ascii=False, indent=2)

    html = open(INDEX, encoding="utf-8").read()
    nuevo, n = re.subn(
        r"<!-- LOGOS:INICIO -->.*?<!-- LOGOS:FIN -->",
        lambda _: ("<!-- LOGOS:INICIO -->\n"
                   + bloque_html(entradas)
                   + "\n              <!-- LOGOS:FIN -->"),
        html,
        flags=re.S,
    )
    if n != 1:
        raise SystemExit("No se encontraron los marcadores LOGOS:INICIO / LOGOS:FIN")

    if nuevo != html:
        open(INDEX, "w", encoding="utf-8", newline="\n").write(nuevo)
        print(f"\nindex.html actualizado con {len(entradas)} logos.")
    else:
        print(f"\nSin cambios: {len(entradas)} logos ya estaban al dia.")


if __name__ == "__main__":
    main()
