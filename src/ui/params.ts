export type Field =
  | { kind: 'number'; path: string; label: string; unit?: string; min: number; max: number; step: number; help?: string; sweep?: boolean }
  | { kind: 'bool'; path: string; label: string; help?: string }
  | { kind: 'select'; path: string; label: string; options: { value: string; label: string }[]; help?: string }

export interface Group {
  id: string
  title: string
  fields: Field[]
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

const stations = (prefix: string, what: string, max: number) => [
  n(`${prefix}.q1`, `${what} en L/4`, 'm', 0, max, 0.005),
  n(`${prefix}.q2`, `${what} en L/2`, 'm', 0, max, 0.005),
  n(`${prefix}.q3`, `${what} en 3L/4`, 'm', 0, max, 0.005),
]

export const GROUPS: Group[] = [
  {
    id: 'hull',
    title: 'Casco central',
    fields: [
      n('hull.L', 'Eslora', 'm', 0.5, 3, 0.01),
      ...stations('hull.B', 'Manga', 0.6),
      ...stations('hull.T', 'Calado', 0.4),
      ...stations('hull.D', 'Puntal', 0.6),
      n('hull.n', 'Exponente de la sección', '', 0.6, 6, 0.1, '2 = semielíptica, menor = en V, mayor = en U'),
      { kind: 'bool', path: 'hull.symmetric', label: 'Simetría proa-popa (3L/4 = L/4)' },
    ],
  },
  {
    id: 'ama',
    title: 'Patines',
    fields: [
      n('ama.y', 'Distancia de crujía al patín', 'm', 0.2, 2, 0.01),
      n('ama.x', 'Posición longitudinal del centro', 'm', 0, 3, 0.01),
      n('ama.z', 'Altura de la quilla del patín', 'm', -0.2, 0.4, 0.005, 'Sobre la línea base del casco central'),
      n('ama.L', 'Eslora', 'm', 0.3, 3, 0.01),
      { kind: 'bool', path: 'ama.volumeMode', label: 'Definir por volumen objetivo' },
      n('ama.targetVolume', 'Volumen objetivo de cada patín', 'm³', 0.001, 0.1, 0.0005),
      ...stations('ama.B', 'Manga', 0.4),
      ...stations('ama.T', 'Calado', 0.3),
      ...stations('ama.D', 'Puntal', 0.5),
      n('ama.n', 'Exponente de la sección', '', 0.6, 6, 0.1),
      { kind: 'bool', path: 'ama.symmetric', label: 'Simetría proa-popa (3L/4 = L/4)' },
    ],
  },
  {
    id: 'keel',
    title: 'Quilla y bulbo',
    fields: [
      n('keel.span', 'Calado de la quilla', 'm', 0.05, 1.2, 0.005),
      n('keel.rootChord', 'Cuerda en la raíz', 'm', 0.02, 0.6, 0.005),
      n('keel.tipChord', 'Cuerda en la punta', 'm', 0.02, 0.6, 0.005),
      n('keel.thickness', 'Espesor relativo t/c', '', 0.06, 0.24, 0.01),
      n('keel.x', 'Posición del 1/4 de cuerda', 'm', 0, 3, 0.01),
      n('keel.sweep', 'Flecha', '°', -10, 45, 1),
      { kind: 'bool', path: 'bulb.enabled', label: 'Incluir bulbo' },
      n('bulb.mass', 'Masa del bulbo', 'kg', 0, 20, 0.1),
      n('bulb.length', 'Longitud del bulbo', 'm', 0.05, 0.8, 0.01),
      n('bulb.diameter', 'Diámetro del bulbo', 'm', 0.01, 0.2, 0.005),
      n('bulb.dx', 'Desplazamiento longitudinal del bulbo', 'm', -0.3, 0.3, 0.01),
    ],
  },
  {
    id: 'rudder',
    title: 'Timón',
    fields: [
      n('rudder.span', 'Envergadura', 'm', 0.05, 0.6, 0.005),
      n('rudder.rootChord', 'Cuerda en la raíz', 'm', 0.02, 0.3, 0.005),
      n('rudder.tipChord', 'Cuerda en la punta', 'm', 0.02, 0.3, 0.005),
      n('rudder.thickness', 'Espesor relativo t/c', '', 0.06, 0.24, 0.01),
      n('rudder.x', 'Posición del 1/4 de cuerda', 'm', -0.3, 3, 0.01),
    ],
  },
  {
    id: 'sail',
    title: 'Vela rígida',
    fields: [
      n('sail.rootChord', 'Cuerda inferior', 'm', 0.05, 1.5, 0.005),
      n('sail.tipChord', 'Cuerda superior', 'm', 0.02, 1.5, 0.005),
      n('sail.height', 'Altura', 'm', 0.2, 4, 0.01),
      n('sail.gap', 'Holgura sobre cubierta', 'm', 0, 0.3, 0.005),
      n('sail.x', 'Posición del eje', 'm', 0, 3, 0.01),
      n('sail.pivot', 'Eje en la cuerda (fracción)', '', 0, 0.6, 0.01),
      n('sail.sweep', 'Flecha del borde de ataque', '°', -10, 30, 1),
      n('sail.twist', 'Torsión en punta', '°', -10, 10, 0.5),
      n('sail.thickness', 'Espesor relativo t/c', '', 0.06, 0.24, 0.01),
      n('sail.mass', 'Masa de la vela', 'kg', 0, 10, 0.05),
      n('sail.cgHeight', 'Altura del CG de la vela', 'm', 0, 3, 0.01),
      n('sail.clMax', 'CL máximo 2D (sin polar)', '', 0.4, 1.6, 0.05),
    ],
  },
  {
    id: 'tail',
    title: 'Ala de cola',
    fields: [
      n('tail.angle', 'Ángulo de la cola', '°', -30, 30, 0.5, 'Consigna con la que se maneja la vela'),
      n('tail.chord', 'Cuerda', 'm', 0, 0.5, 0.005),
      n('tail.span', 'Envergadura', 'm', 0, 1.5, 0.01),
      n('tail.arm', 'Brazo desde el eje', 'm', 0.1, 2, 0.01),
      n('tail.height', 'Altura sobre cubierta', 'm', 0, 2, 0.01),
      n('tail.thickness', 'Espesor relativo t/c', '', 0.06, 0.24, 0.01),
      n('tail.mass', 'Masa de la cola', 'kg', 0, 3, 0.01),
      n('tail.counterweight', 'Masa del contrapeso', 'kg', 0, 5, 0.01),
      n('tail.counterweightArm', 'Brazo del contrapeso (a proa del eje)', 'm', 0, 1.5, 0.01),
      n('tail.clMax', 'CL máximo de la cola', '', 0.3, 1.4, 0.05),
    ],
  },
  {
    id: 'env',
    title: 'Viento y manejo',
    fields: [
      n('env.tws', 'Viento real (TWS)', 'm/s', 0.5, 25, 0.1),
      n('env.twa', 'Ángulo del viento real (TWA, por babor)', '°', 20, 180, 1),
      {
        kind: 'select',
        path: 'control.mode',
        label: 'Manejo de la vela',
        options: [
          { value: 'tail', label: 'Ángulo de cola (la vela busca su equilibrio)' },
          { value: 'alpha', label: 'Ángulo de ataque impuesto' },
          { value: 'optimize', label: 'Optimizar velocidad' },
        ],
      },
      n('control.alpha', 'Ángulo de ataque impuesto', '°', -20, 25, 0.5),
      n('control.maxHeel', 'Escora máxima al optimizar', '°', 1, 40, 1),
      { kind: 'bool', path: 'env.gradient', label: 'Gradiente de viento (ley logarítmica)' },
      n('env.zRef', 'Altura de referencia del viento', 'm', 1, 20, 0.5),
      n('env.z0', 'Rugosidad z₀', 'm', 0.00001, 0.01, 0.00001),
      n('env.route', 'Distancia de la ruta', 'MN', 1, 200, 1),
    ],
  },
  {
    id: 'model',
    title: 'Modelo y límites',
    fields: [
      {
        kind: 'select',
        path: 'numeric.imagePlane',
        label: 'Plano imagen de la vela',
        options: [
          { value: 'sea', label: 'Superficie del mar (recomendado)' },
          { value: 'deck', label: 'Cubierta (cota superior)' },
          { value: 'none', label: 'Sin imagen (cota inferior)' },
        ],
      },
      n('numeric.sailSpan', 'Paneles de la vela en altura', '', 6, 40, 1),
      n('numeric.sailChord', 'Paneles de la vela en cuerda', '', 2, 12, 1),
      n('numeric.tailSpan', 'Paneles de la cola en envergadura', '', 2, 16, 1),
      n('numeric.tailChord', 'Paneles de la cola en cuerda', '', 1, 8, 1),
      n('numeric.sections', 'Secciones hidrostáticas por casco', '', 20, 120, 2),
      n('resistanceFactor', 'Factor de calibración de resistencia', '', 0.5, 2, 0.05),
      n('windageCdA', 'CdA de cascos y equipos', 'm²', 0, 0.3, 0.005),
      n('windageZ', 'Altura del centro de esa resistencia', 'm', 0, 1, 0.01),
      n('env.rhoAir', 'Densidad del aire', 'kg/m³', 1.1, 1.3, 0.005),
      n('env.rhoWater', 'Densidad del agua', 'kg/m³', 1000, 1030, 1),
      n('limits.loaMax', 'Eslora máxima del reglamento', 'm', 1, 5, 0.01),
      n('limits.minSpeedKn', 'Velocidad media mínima', 'nudos', 0, 3, 0.1),
      n('limits.amaReserveMin', 'Reserva mínima del patín (aviso)', '%', 0, 300, 5),
      n('limits.maxHeelWarn', 'Escora de aviso', '°', 1, 60, 1),
    ],
  },
]

export const SWEEP_FIELDS = GROUPS.flatMap((g) =>
  g.fields.filter((f): f is Extract<Field, { kind: 'number' }> => f.kind === 'number' && !!f.sweep && !f.path.startsWith('numeric.')).map((f) => ({ ...f, group: g.title })),
)
