export type Field =
  | { kind: 'number'; path: string; label: string; unit?: string; min: number; max: number; step: number; help?: string; sweep?: boolean }
  | { kind: 'bool'; path: string; label: string; help?: string }
  | { kind: 'select'; path: string; label: string; options: { value: string; label: string }[]; help?: string }

export interface Group {
  id: string
  title: string
  fields: Field[]
  note?: string
}

const n = (path: string, label: string, unit: string, min: number, max: number, step: number, help?: string): Field => ({
  kind: 'number',
  path,
  label,
  unit,
  min,
  max,
  step,
  help,
  sweep: true,
})

/** Parámetros de diseño (ventana Parámetros): 34 en total. */
export const GROUPS: Group[] = [
  {
    id: 'hull',
    title: 'Casco central',
    note: 'Casco esbelto simétrico proa-popa: los valores en 3L/4 son iguales a los de L/4 y los extremos acaban en punta.',
    fields: [
      n('hull.L', 'Eslora', 'm', 0.5, 3, 0.01),
      n('hull.B.q1', 'Manga en L/4', 'm', 0.02, 0.6, 0.005),
      n('hull.B.q2', 'Manga en L/2', 'm', 0.02, 0.6, 0.005),
      n('hull.T.q1', 'Calado en L/4', 'm', 0.01, 0.4, 0.005),
      n('hull.T.q2', 'Calado en L/2', 'm', 0.01, 0.4, 0.005),
      n('hull.D.q1', 'Puntal en L/4', 'm', 0.05, 0.6, 0.005),
      n('hull.D.q2', 'Puntal en L/2', 'm', 0.05, 0.6, 0.005),
    ],
  },
  {
    id: 'ama',
    title: 'Patines',
    note: 'La forma de los patines se escala con proporciones fijas para dar el volumen elegido con su eslora.',
    fields: [
      n('ama.y', 'Distancia de crujía al patín', 'm', 0.2, 2, 0.01),
      n('ama.x', 'Posición longitudinal del centro', 'm', 0, 3, 0.01),
      n('ama.z', 'Altura de la quilla del patín', 'm', -0.2, 0.4, 0.005, 'Sobre la línea base del casco central; controla cuánto tocan el agua en reposo'),
      n('ama.L', 'Eslora', 'm', 0.3, 3, 0.01),
      n('ama.targetVolume', 'Volumen de cada patín', 'm³', 0.001, 0.1, 0.0005),
    ],
  },
  {
    id: 'keel',
    title: 'Quilla y bulbo',
    note: 'Perfil NACA 0012 sin flecha. El diámetro del bulbo sale de su masa (plomo) y su longitud.',
    fields: [
      n('keel.span', 'Calado de la quilla', 'm', 0.05, 1.2, 0.005),
      n('keel.rootChord', 'Cuerda en la raíz', 'm', 0.02, 0.6, 0.005),
      n('keel.tipChord', 'Cuerda en la punta', 'm', 0.02, 0.6, 0.005),
      n('keel.x', 'Posición del 1/4 de cuerda', 'm', 0, 3, 0.01),
      { kind: 'bool', path: 'bulb.enabled', label: 'Incluir bulbo' },
      n('bulb.mass', 'Masa del bulbo', 'kg', 0, 20, 0.1),
      n('bulb.length', 'Longitud del bulbo', 'm', 0.05, 0.8, 0.01),
    ],
  },
  {
    id: 'rudder',
    title: 'Timón',
    note: 'Pala rectangular con perfil NACA 0012.',
    fields: [
      n('rudder.span', 'Envergadura', 'm', 0.05, 0.6, 0.005),
      n('rudder.rootChord', 'Cuerda', 'm', 0.02, 0.3, 0.005),
      n('rudder.x', 'Posición del 1/4 de cuerda', 'm', -0.3, 3, 0.01),
    ],
  },
  {
    id: 'sail',
    title: 'Vela rígida',
    note: 'A ras de cubierta, sin flecha ni torsión. El perfil y las polares se cargan abajo.',
    fields: [
      n('sail.rootChord', 'Cuerda inferior', 'm', 0.05, 1.5, 0.005),
      n('sail.tipChord', 'Cuerda superior', 'm', 0.02, 1.5, 0.005),
      n('sail.height', 'Altura', 'm', 0.2, 4, 0.01),
      n('sail.x', 'Posición del eje', 'm', 0, 3, 0.01),
      n('sail.pivot', 'Eje en la cuerda (fracción desde el borde de ataque)', '', 0, 0.6, 0.01),
    ],
  },
  {
    id: 'tail',
    title: 'Ala de cola',
    note: 'Perfil NACA 0012, centrada a 0,30 m sobre la cubierta. Sus masas y el contrapeso están en la ventana Centro de gravedad.',
    fields: [
      n('tail.chord', 'Cuerda', 'm', 0.02, 0.5, 0.005),
      n('tail.span', 'Envergadura', 'm', 0.05, 1.5, 0.01),
      n('tail.arm', 'Brazo desde el eje', 'm', 0.1, 2, 0.01),
    ],
  },
  {
    id: 'env',
    title: 'Viento y manejo de la vela',
    note: 'Viento real a 10 m con perfil logarítmico de mar abierto, entrando por babor.',
    fields: [
      n('env.tws', 'Viento real (TWS)', 'm/s', 0.5, 25, 0.1),
      n('env.twa', 'Ángulo del viento real (TWA)', '°', 20, 180, 1),
      {
        kind: 'select',
        path: 'control.mode',
        label: 'Manejo de la vela',
        options: [
          { value: 'tail', label: 'Ángulo de cola (la vela busca su equilibrio)' },
          { value: 'alpha', label: 'Ángulo de ataque impuesto' },
          { value: 'optimize', label: 'Optimizar velocidad (escora ≤ 20°)' },
        ],
      },
      n('tail.angle', 'Consigna: ángulo de la cola', '°', -30, 30, 0.5),
      n('control.alpha', 'Consigna: ángulo de ataque', '°', -20, 25, 0.5),
    ],
  },
]

/** Parámetros de resolución de los modelos (ventana Resolución). */
export const RESOLUTION: Group[] = [
  {
    id: 'vlm',
    title: 'Vela y cola (VLM)',
    fields: [
      n('numeric.sailSpan', 'Paneles de la vela en altura', '', 4, 40, 1),
      n('numeric.sailChord', 'Paneles de la vela en cuerda', '', 1, 12, 1),
      n('numeric.tailSpan', 'Paneles de la cola en envergadura', '', 2, 16, 1),
      n('numeric.tailChord', 'Paneles de la cola en cuerda', '', 1, 8, 1),
      n('numeric.vlmIter', 'Iteraciones máximas del VLM no lineal', '', 1, 100, 1),
      {
        kind: 'select',
        path: 'numeric.imagePlane',
        label: 'Plano imagen de la vela',
        help: 'Espejo de la vela que impide que el aire atraviese el mar (o la cubierta)',
        options: [
          { value: 'sea', label: 'Superficie del mar (recomendado)' },
          { value: 'deck', label: 'Cubierta (cota optimista)' },
          { value: 'none', label: 'Sin imagen (cota pesimista)' },
        ],
      },
    ],
  },
  {
    id: 'foil',
    title: 'Polares del perfil 2D',
    fields: [
      {
        kind: 'select',
        path: 'numeric.polarSource',
        label: 'Origen de las polares',
        options: [
          { value: 'auto', label: 'Automático: cargadas > tabla XFOIL (NACA 0012) > paneles 2D' },
          { value: 'panel', label: 'Siempre paneles 2D + capa límite (método propio)' },
        ],
      },
      n('numeric.foilPanels', 'Paneles del perfil 2D', '', 40, 300, 10),
      n('numeric.ncrit', 'Criterio de transición Ncrit (eⁿ)', '', 1, 14, 0.5),
      n('numeric.couplingIter', 'Iteraciones del acoplamiento viscoso', '', 0, 30, 1),
    ],
  },
  {
    id: 'hydro',
    title: 'Hidrostática',
    fields: [n('numeric.sections', 'Secciones por casco', '', 20, 160, 2)],
  },
]

export const SWEEP_FIELDS = GROUPS.flatMap((g) =>
  g.fields.filter((f): f is Extract<Field, { kind: 'number' }> => f.kind === 'number' && !!f.sweep).map((f) => ({ ...f, group: g.title })),
)
