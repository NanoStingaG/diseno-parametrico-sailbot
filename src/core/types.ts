// Tipos del modelo de diseño del trimarán.
// Sistema de referencia (cuerpo): x hacia proa desde la popa del casco central,
// y positiva hacia estribor desde crujía, z hacia arriba desde la línea base
// (punto más bajo de la quilla del casco central). Sistema levógiro: los signos
// de escora y momentos se definen explícitamente en cada módulo.

/** Tres estaciones (L/4, L/2, 3L/4). */
export interface Stations {
  q1: number
  q2: number
  q3: number
}

export interface HullShape {
  /** Eslora (m) */
  L: number
  /** Manga en L/4, L/2, 3L/4 (m) */
  B: Stations
  /** Calado de la forma en L/4, L/2, 3L/4 (m), desde la quilla hasta la flotación de diseño */
  T: Stations
  /** Puntal en L/4, L/2, 3L/4 (m), altura de cubierta sobre la quilla */
  D: Stations
  /** Exponente de la superelipse de la sección bajo la flotación de diseño */
  n: number
  /** Simetría proa-popa: si es true, q3 = q1 */
  symmetric: boolean
}

export interface OutriggerParams extends HullShape {
  /** Distancia de crujía al eje del patín (m) */
  y: number
  /** Posición longitudinal del centro del patín respecto a la popa del casco central (m) */
  x: number
  /** Altura de la quilla del patín (punto más bajo) sobre la línea base (m) */
  z: number
  /** Modo de definición: dimensiones o volumen objetivo */
  volumeMode: boolean
  /** Volumen objetivo de cada patín (m³), sólo en volumeMode */
  targetVolume: number
}

export interface FoilAppendage {
  /** Envergadura / calado bajo el casco (m) */
  span: number
  /** Cuerda en la raíz (m) */
  rootChord: number
  /** Cuerda en la punta (m) */
  tipChord: number
  /** Espesor relativo t/c */
  thickness: number
  /** Posición longitudinal del 1/4 de cuerda en la raíz (m) */
  x: number
  /** Flecha del 1/4 de cuerda (grados) */
  sweep: number
}

export interface BulbParams {
  enabled: boolean
  mass: number
  length: number
  diameter: number
  /** Posición longitudinal del centro del bulbo respecto al 1/4 de cuerda de la punta de la quilla (m) */
  dx: number
}

export interface SailParams {
  /** Cuerda inferior (m) */
  rootChord: number
  /** Cuerda superior (m) */
  tipChord: number
  /** Altura (m) */
  height: number
  /** Holgura entre el pie de la vela y la cubierta (m) */
  gap: number
  /** Posición longitudinal del eje de giro (m) */
  x: number
  /** Posición del eje en la cuerda (fracción, 0 = borde de ataque) */
  pivot: number
  /** Flecha del borde de ataque (grados) */
  sweep: number
  /** Torsión de punta (grados, positiva reduce el ángulo de ataque en la punta) */
  twist: number
  /** Espesor relativo del perfil t/c */
  thickness: number
  /** Nombre del perfil */
  profileName: string
  /** Masa de la vela (kg) */
  mass: number
  /** Altura del CG de la vela sobre la cubierta (m) */
  cgHeight: number
  /** CL máximo 2D sin polar */
  clMax: number
}

export interface TailParams {
  chord: number
  span: number
  /** Distancia del eje de giro al 1/4 de cuerda de la cola (m) */
  arm: number
  /** Altura de la parte inferior de la cola sobre la cubierta (m) */
  height: number
  /** Espesor relativo del perfil t/c */
  thickness: number
  /** Ángulo de la cola respecto a la vela (grados) */
  angle: number
  /** Masa de la cola (kg) */
  mass: number
  /** Masa del contrapeso (kg) */
  counterweight: number
  /** Distancia del contrapeso por delante del eje (m) */
  counterweightArm: number
  /** CL máximo conservador de la cola */
  clMax: number
}

export interface MassItem {
  name: string
  mass: number
  x: number
  y: number
  z: number
}

export interface MassParams {
  /** Modo simple: masa total + CG */
  simple: boolean
  total: number
  cg: { x: number; y: number; z: number }
  items: MassItem[]
}

export type ImagePlane = 'sea' | 'deck' | 'none'
export type SailControl = 'tail' | 'alpha' | 'optimize'

export interface EnvParams {
  /** Velocidad del viento real a la altura de referencia (m/s) */
  tws: number
  /** Ángulo del viento real respecto a la proa (grados); viento por babor */
  twa: number
  zRef: number
  z0: number
  gradient: boolean
  rhoAir: number
  rhoWater: number
  nuAir: number
  nuWater: number
  /** Distancia de la ruta (MN) */
  route: number
}

export interface ControlParams {
  mode: SailControl
  /** Ángulo de ataque impuesto (grados), modo 'alpha' */
  alpha: number
  /** Escora máxima admisible para optimizar (grados) */
  maxHeel: number
  /** Inmersión máxima del patín de sotavento para optimizar (fracción del volumen) */
  maxAmaImmersion: number
}

export interface NumericParams {
  sailSpan: number
  sailChord: number
  tailSpan: number
  tailChord: number
  sections: number
  imagePlane: ImagePlane
}

export interface Polar2D {
  /** Puntos (alpha grados, cl, cd) */
  points: { alpha: number; cl: number; cd: number }[]
  reynolds?: number
}

export interface LimitParams {
  loaMax: number
  minSpeedKn: number
  /** Umbral de aviso de reserva de flotabilidad del patín (% del desplazamiento) */
  amaReserveMin: number
  maxHeelWarn: number
}

export interface Design {
  name: string
  hull: HullShape
  ama: OutriggerParams
  keel: FoilAppendage
  bulb: BulbParams
  rudder: FoilAppendage
  sail: SailParams
  tail: TailParams
  mass: MassParams
  env: EnvParams
  control: ControlParams
  numeric: NumericParams
  limits: LimitParams
  /** Coeficiente de calibración de la resistencia */
  resistanceFactor: number
  /** CdA de cascos, brazos y equipos expuestos al viento (m²) */
  windageCdA: number
  /** Altura del centro de la resistencia aerodinámica de cascos sobre la línea base (m) */
  windageZ: number
  sailPolar?: Polar2D
  /** Coordenadas del perfil cargado (para dibujarlo) */
  sailProfile?: { x: number; y: number }[]
}
