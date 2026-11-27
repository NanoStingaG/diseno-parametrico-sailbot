# Diseño paramétrico del trimarán · Micro Ruta de la Sal 2027

Herramienta web para diseñar el velero autónomo (trimarán con vela rígida y ala de cola) del equipo.
Al cambiar un parámetro, la aplicación recalcula el equilibrio del barco: velocidad, escora, deriva, ángulo
de ataque de la vela, fuerzas, estabilidad y avisos.

Todo el cálculo se hace en el navegador, en Web Workers (no hay servidor). Los diseños se guardan en el
propio navegador, en archivos JSON o en un enlace que se puede pasar a los compañeros.

## Ventanas (versión 2)

- **Principal**: vistas en planta, perfil y desde popa con las fuerzas a escala; resumen de resultados y
  avisos; curva GZ con los brazos escorantes de la vela (viento actual, racha ×1,4, vela a máxima fuerza y
  en bandera), escora de equilibrio, brazo adrizante restante y área de reserva; balance de fuerzas;
  coeficientes y carga en altura de la vela y la cola.
- **Curvas de diseño**: polar de velocidades, empuje y resistencia frente a la velocidad (y resistencia por
  componentes), inmersión de los patines frente a la escora y al viento, curvas hidrostáticas, polares del
  perfil a los Reynolds de trabajo y sensibilidad (tornado) de la velocidad y del viento de vuelco.
- **Parámetros**: los 34 parámetros de diseño (casco, patines, quilla y bulbo, timón, vela, cola, viento y
  manejo de la vela), la carga del perfil `.dat` y de varias polares (XFOIL o CSV, una por Reynolds).
- **Centro de gravedad**: todas las partidas de peso, con su posición en perfil y planta (área de cada punto
  proporcional a su masa). Vela, cola, contrapeso y bulbo se colocan solos. El CG que sale de aquí es el que
  usa el resto de la herramienta.
- **Resolución**: paneles del VLM, plano imagen, iteraciones del VLM no lineal, origen de las polares,
  paneles e iteraciones del método 2D, Ncrit y secciones hidrostáticas; vista de la malla y tiempos.
- **Optimización**: barrido de un parámetro, mapa de dos parámetros, optimizador (Nelder-Mead con
  variables, rangos, objetivo y restricciones, convergencia, base frente a óptimo y botón para aplicar el
  óptimo) y comparación de variantes.
- **Flujo y teoría**: diagrama del cálculo; cada bloque abre su base teórica con ecuaciones, método
  numérico, hipótesis, límites, referencias y cómo se ha comprobado.

Los valores por defecto son de ejemplo: sustitúyelos por los del barco real.

## Modelo físico (resumen)

- **Polares 2D**: tabla de XFOIL 6.99 del NACA 0012 (10 Reynolds, Ncrit 9), polares cargadas por el usuario,
  o un método de paneles 2D propio (Hess-Smith + capa límite integral: Thwaites, transición eⁿ, Head,
  Squire-Young, acoplamiento por transpiración y pérdida de Kirchhoff) para cualquier perfil `.dat`.
  Interpolación en α y log(Re), y placa plana a ángulos grandes.
- **Vela y cola**: Vortex Lattice no lineal, acoplado franja a franja a las polares viscosas a su propio
  Reynolds (corrección por «decambering»), con plano imagen en el mar y gradiente de viento. Equilibrio de
  momentos vela-cola y margen estático.
- **Hidrostática**: integración por secciones, equilibrio en calado y asiento a cada escora, curva GZ hasta 90°.
- **Agua**: fuerza lateral de quilla, timón y casco (Helmbold y cuerpo esbelto); fricción ITTC-57 con factor de
  forma, olas con la integral de Michell por casco y resistencia inducida.
- **Equilibrio (VPP)**: velocidad a la que la propulsión iguala la resistencia, con escora, deriva y vela en
  equilibrio a la vez; viento de vuelco y brazos escorantes.

La ventana «Flujo y teoría» lo detalla con las ecuaciones y referencias.

## Desarrollo

Requiere Node.js 20.19 o superior.

```bash
npm install      # instala dependencias
npm run dev      # servidor local en http://localhost:5173
npm test         # pruebas del núcleo de cálculo
npm run build    # genera la versión estática en dist/
```

Estructura:

- `src/core/`: cálculo (geometría, hidrostática, polares, paneles 2D, VLM, vela, agua, solver, estudios),
  sin dependencias de la interfaz. `src/core/data/naca0012.ts` contiene la tabla de XFOIL.
- `src/worker.ts`: ejecuta los cálculos en Web Workers para no bloquear la página.
- `src/ui/`: ventanas, vistas y gráficas de React. `src/ui/theory.ts` contiene las fichas de teoría.

## Publicación

El flujo `.github/workflows/deploy.yml` prueba, compila y publica la aplicación en GitHub Pages en cada
push a `main`. Hay que activarlo una vez en *Settings → Pages → Source: GitHub Actions*. En un repositorio
privado, GitHub Pages necesita un plan de pago (Pro, Team o Enterprise); si no se dispone de él, la
carpeta `dist/` generada con `npm run build` se puede servir desde cualquier alojamiento estático.
