# Diseño paramétrico del trimarán · Micro Ruta de la Sal 2027

Herramienta web para diseñar el velero autónomo (trimarán con vela rígida y ala de cola) del equipo.
Se cambian los parámetros en el panel de la izquierda y la aplicación recalcula al momento el equilibrio
del barco: velocidad, escora, deriva, ángulo de ataque de la vela, fuerzas, estabilidad y avisos.

Todo el cálculo se hace en el navegador (no hay servidor). Los diseños se guardan en el propio navegador,
en archivos JSON o en un enlace que se puede pasar a los compañeros.

## Uso

- **Panel izquierdo**: parámetros agrupados (casco central, patines, quilla y bulbo, timón, vela rígida,
  cola, masas, viento y control, modelo numérico). Los campos en gris dependen de otros (por ejemplo, la
  manga en 3L/4 cuando la simetría proa‑popa está activada).
- **Centro**: vistas en planta, perfil y desde popa con las fuerzas dibujadas a escala, y pestañas con
  el balance de fuerzas, la curva de estabilidad, la vela y la cola, el desglose de masas, los barridos
  de un parámetro, la comparación de diseños y la descripción del modelo.
- **Derecha**: resultados principales y avisos (eslora máxima, viento de vuelco, patín sumergido, vela en
  pérdida, cola inestable, etc.).
- **Barra superior**: guardar y cargar JSON, copiar un enlace con el diseño completo, exportar CSV,
  añadir el diseño actual a la comparación y restablecer los valores por defecto.

Los valores por defecto son de ejemplo: sustitúyelos por los del barco real.

### Perfil y polar de la vela

Por defecto la vela usa un NACA 0012. En el grupo «Vela rígida» se puede cargar un perfil en formato
Selig o Lednicer (`.dat`) y una polar 2D en CSV (`alfa, cl, cd`) o en el formato de salida de XFOIL. Si hay
polar, se usa para la pendiente, la resistencia de perfil y la pérdida de cada franja.

## Modelo físico (resumen)

- **Casco y patines**: cascos esbeltos simétricos definidos por manga, calado y puntal en L/4, L/2 y 3L/4,
  con extremos en punta; secciones superelípticas bajo la flotación de diseño.
- **Hidrostática**: integración por secciones con recorte de polígonos; equilibrio en calado y asiento para
  cada escora; curva GZ de 0 a 90°.
- **Vela y cola**: vortex lattice con herraduras, distribución en coseno y plano imagen en la superficie
  del mar (o en cubierta, o sin imagen). Resistencia inducida en el plano de Trefftz y corrección viscosa
  por franjas. Viento real con perfil logarítmico (referencia a 10 m).
- **Control de la vela**: equilibrio de momentos de la vela libre con la cola (ángulo de cola fijo),
  ángulo de ataque impuesto, u optimización del ángulo para la máxima velocidad.
- **Agua**: fuerza lateral de quilla, timón y casco (Helmbold y cuerpo esbelto); resistencia de fricción
  ITTC‑57 con factor de forma, resistencia por olas con la integral de Michell para cada casco y
  resistencia inducida de los apéndices.
- **Equilibrio (VPP)**: velocidad en la que la propulsión iguala la resistencia, con la escora y la deriva
  resueltas a la vez; comprobación de asiento con el empuje de la vela.

Hipótesis y limitaciones: flujo estacionario en agua tranquila, sin interferencia entre cascos ni balance
de guiñada, sin readrizado. La pestaña «Modelo» de la aplicación lo detalla.

## Desarrollo

Requiere Node.js 20.19 o superior.

```bash
npm install      # instala dependencias
npm run dev      # servidor local en http://localhost:5173
npm test         # pruebas del núcleo de cálculo (VLM, Michell, hidrostática, solver)
npm run build    # genera la versión estática en dist/
```

Estructura:

- `src/core/`: cálculo (geometría, hidrostática, VLM, vela, agua, solver) sin dependencias de la interfaz.
- `src/worker.ts`: ejecuta el cálculo en un Web Worker para no bloquear la página.
- `src/ui/`: componentes de React (panel de parámetros, vistas, gráficas, barridos y comparación).

## Publicación

El flujo `.github/workflows/deploy.yml` prueba, compila y publica la aplicación en GitHub Pages en cada
push a `main`. Hay que activarlo una vez en *Settings → Pages → Source: GitHub Actions*. En un repositorio
privado, GitHub Pages necesita un plan de pago (Pro, Team o Enterprise); si no se dispone de él, la
carpeta `dist/` generada con `npm run build` se puede servir desde cualquier alojamiento estático.
