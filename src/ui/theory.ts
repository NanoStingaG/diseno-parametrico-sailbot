/**
 * Contenido de la ventana «Flujo de cálculo y teoría». Cada bloque del diagrama tiene su ficha:
 * qué hace, ecuaciones (KaTeX entre $…$ o $$…$$), cómo se resuelve numéricamente, hipótesis,
 * límites de validez, referencias y cómo se ha comprobado.
 * Párrafos separados por una línea en blanco; las líneas que empiezan por «- » forman listas.
 */

export interface TheoryBlock {
  id: string
  title: string
  /** posición en el diagrama (columna, fila) */
  col: number
  row: number
  summary: string
  sections: { h: string; body: string }[]
  refs: string[]
  validation: string
}

export const EDGES: [string, string][] = [
  ['entrada', 'geometria'],
  ['entrada', 'masas'],
  ['entrada', 'viento'],
  ['geometria', 'masas'],
  ['geometria', 'hidro'],
  ['masas', 'hidro'],
  ['geometria', 'agua'],
  ['geometria', 'resistencia'],
  ['foil2d', 'polares'],
  ['polares', 'vlm'],
  ['viento', 'vlm'],
  ['vlm', 'cola'],
  ['hidro', 'vpp'],
  ['agua', 'vpp'],
  ['resistencia', 'vpp'],
  ['cola', 'vpp'],
  ['vpp', 'estabilidad'],
  ['hidro', 'estabilidad'],
  ['vpp', 'estudios'],
  ['estabilidad', 'estudios'],
]

const r = String.raw

export const BLOCKS: TheoryBlock[] = [
  {
    id: 'entrada',
    title: 'Parámetros y valores fijos',
    col: 0,
    row: 1.8,
    summary: 'Los 34 parámetros de diseño, las partidas de peso y los ajustes de resolución; el resto se fija.',
    sections: [
      {
        h: 'Qué entra',
        body: r`El diseño se describe con 34 parámetros (ventana Parámetros): 7 del casco central, 5 de los patines, 7 de quilla y bulbo, 3 del timón, 5 de la vela, 3 de la cola y la condición de viento con el modo de manejo de la vela y su consigna. Las partidas de peso están en la ventana Centro de gravedad y los parámetros numéricos en la ventana Resolución.

Antes de cualquier cálculo, la función applyFixed impone los valores que ya no se editan, de forma que un diseño antiguo (JSON o enlace) se calcula igual que uno nuevo:
- Cascos simétricos proa-popa (valores en 3L/4 iguales a L/4) y sección con exponente $n = 2$ (semielipse).
- Patines definidos por volumen: su manga y calado se escalan con un único factor $s$ hasta que el volumen total del patín es el elegido (bisección sobre $s$).
- Quilla y timón con perfil NACA 0012 ($t/c = 0{,}12$), sin flecha; timón rectangular.
- Bulbo centrado bajo la punta de la quilla. Su diámetro sale de la masa de plomo y la longitud, tratándolo como un esferoide prolato: $$V_b = \frac{m_b}{\rho_{Pb}} = \frac{\pi}{6} L_b D_b^2 \;\Rightarrow\; D_b = \sqrt{\frac{6\, m_b}{\pi\, \rho_{Pb}\, L_b}},\qquad \rho_{Pb} = 11\,340\ \mathrm{kg/m^3}.$$
- Vela a ras de cubierta, sin flecha ni torsión; cola NACA 0012 con su pie a 0,30 m sobre la cubierta.
- Atmósfera y mar: $\rho_{aire} = 1{,}225$, $\rho_{agua} = 1025\ \mathrm{kg/m^3}$, $\nu_{aire} = 1{,}5\cdot10^{-5}$, $\nu_{agua} = 1{,}19\cdot10^{-6}\ \mathrm{m^2/s}$; perfil de viento logarítmico con $z_{ref} = 10$ m y $z_0 = 0{,}2$ mm.
- Resistencia aerodinámica de cascos y equipos $C_D A = 0{,}04\ \mathrm{m^2}$ a 0,30 m sobre la línea base; factor de calibración de la resistencia 1.`,
      },
      {
        h: 'Sistema de referencia',
        body: r`Ejes del barco: $x$ hacia proa desde la popa del casco central, $y$ positiva a estribor, $z$ hacia arriba desde la quilla del casco central. El viento real entra por babor con ángulo TWA medido desde la proa. La escora $\varphi$ es positiva hacia estribor (sotavento).`,
      },
      {
        h: 'Hipótesis generales',
        body: r`- Régimen estacionario en aguas tranquilas: sin olas, sin dinámica ni aceleraciones.
- Sólidos rígidos; el timón va a 0° (la guiñada se supone equilibrada).
- Los patines y el casco central no interfieren hidrodinámicamente.`,
      },
    ],
    refs: ['Larsson, L., Eliasson, R. E. y Orych, M. (2014). Principles of Yacht Design, 4.ª ed. Adlard Coles.'],
    validation: r`El análisis completo del diseño base se ejecuta en los tests (solver.test.ts y robust.test.ts) con varios vientos, ángulos y los tres modos de manejo, comprobando que todos los resultados son finitos y físicamente coherentes.`,
  },
  {
    id: 'geometria',
    title: 'Geometría de cascos y apéndices',
    col: 1,
    row: 0.6,
    summary: 'Formas de los tres cascos por estaciones, apéndices trapeciales, bulbo y vela.',
    sections: [
      {
        h: 'Cascos',
        body: r`Cada casco se define con su eslora $L$ y la manga $B$, el calado $T$ y el puntal $D$ en $L/4$ y $L/2$ (y en $3L/4$ por simetría). En los extremos $B = T = 0$. Entre estaciones se interpola con splines cúbicos monótonos PCHIP (Fritsch y Carlson), que no producen oscilaciones ni valores negativos entre puntos.

La sección bajo la flotación de diseño es una superelipse de semimanga $b = B/2$ y calado $T$: $$\left(\frac{|y|}{b}\right)^{n} + \left(\frac{T - z}{T}\right)^{n} = 1,\qquad n = 2,$$ y por encima de $z = T$ los costados son verticales hasta el puntal $D$. La quilla del casco sube hacia los extremos: $z_{quilla}(x) = T_{max} - T(x)$.`,
      },
      {
        h: 'Apéndices',
        body: r`Quilla y timón son alas trapeciales con perfil NACA 0012. Superficie $S = \tfrac{1}{2}(c_r + c_t)\,b$. El área de una sección NACA de 4 cifras simétrica es $A \approx 0{,}685\,t\,c^2$, que integrada en envergadura da el volumen sumergido y su centro. La superficie mojada se toma como $2{,}04\,S$ (las dos caras más la curvatura del perfil). El bulbo es un esferoide prolato de superficie $$S_b = 2\pi b^2\left(1 + \frac{a}{b\,e}\arcsin e\right),\quad e = \sqrt{1 - b^2/a^2},\ a = L_b/2,\ b = D_b/2.$$`,
      },
      {
        h: 'Vela y cola',
        body: r`La vela es un ala trapecial vertical de cuerdas inferior y superior dadas, que gira alrededor de un eje situado a una fracción de la cuerda desde el borde de ataque. La cola es un ala rectangular unida al eje por un brazo, con un ángulo de calado respecto a la vela. Se calcula también la envolvente de eslora con la vela girando.`,
      },
    ],
    refs: ['Fritsch, F. N. y Carlson, R. E. (1980). Monotone piecewise cubic interpolation. SIAM J. Numer. Anal. 17(2), 238–246.', 'Abbott, I. H. y von Doenhoff, A. E. (1959). Theory of Wing Sections. Dover.'],
    validation: r`hydro.test.ts compara el volumen de cascos de sección semielíptica con la integral analítica.`,
  },
  {
    id: 'masas',
    title: 'Masas y centro de gravedad',
    col: 1,
    row: 1.8,
    summary: 'Suma de partidas de peso; vela, cola, contrapeso y bulbo se colocan solos.',
    sections: [
      {
        h: 'Cálculo',
        body: r`Desplazamiento y centro de gravedad: $$\Delta = \sum_i m_i,\qquad \mathbf{G} = \frac{1}{\Delta}\sum_i m_i\,\mathbf{r}_i .$$ A las partidas introducidas se añaden automáticamente la vela (en su eje, a la altura de su CG sobre la cubierta), la cola (en el extremo del brazo, a media envergadura), el contrapeso (por delante del eje) y el bulbo (bajo la punta de la quilla).`,
      },
      {
        h: 'Equilibrio de masas del conjunto que gira',
        body: r`El conjunto vela-cola-contrapeso gira libremente en su eje. Si su CG no está en el eje, al escorar aparece un par de gravedad que desorienta la vela: $$M_{grav} = m_{conj}\, e\, g\, \sin\varphi \cos\theta_c,\qquad e = \frac{m_v x_v + m_t\, l_t - m_{cp}\, l_{cp}}{m_{conj}},$$ con $x_v$ la posición del CG de la vela respecto al eje (a 0,4 de la cuerda media), $l_t$ el brazo de la cola, $l_{cp}$ el del contrapeso y $\theta_c$ el ángulo de la cuerda respecto a crujía. La ventana Centro de gravedad indica el contrapeso que anula $e$.`,
      },
    ],
    refs: ['Larsson, L., Eliasson, R. E. y Orych, M. (2014). Principles of Yacht Design, cap. 6.'],
    validation: r`El desplazamiento obtenido en el equilibrio hidrostático coincide con la masa total (hydro.test.ts: $\rho V = \Delta$ con error < 1 %).`,
  },
  {
    id: 'hidro',
    title: 'Hidrostática y curva GZ',
    col: 2,
    row: 0,
    summary: 'Volumen sumergido por secciones a cualquier escora y asiento; equilibrio y GZ hasta 90°.',
    sections: [
      {
        h: 'Integración por secciones',
        body: r`Cada casco se divide en $N$ secciones transversales (ventana Resolución). Para una postura $(\varphi, \theta, h)$ —escora, asiento y altura de la flotación en $x_{ref} = L/2$— cada polígono de sección se transforma a ejes tierra y se recorta con el plano del agua (Sutherland-Hodgman). Su área y centroide dan $$V = \sum_k A_k\,\Delta x,\qquad \mathbf{B} = \frac{1}{V}\sum_k A_k\,\mathbf{c}_k\,\Delta x ,$$ más los volúmenes de quilla, timón y bulbo, que se consideran siempre sumergidos. La longitud mojada del contorno recortado da la superficie mojada de cada casco.`,
      },
      {
        h: 'Equilibrio y GZ',
        body: r`Para cada escora $\varphi$ se buscan $h$ y $\theta$ tales que $$\rho\, V(\varphi,\theta,h) = \Delta,\qquad x_B(\varphi,\theta,h) = x_G \text{ (en ejes tierra)},$$ con dos métodos de Brent anidados (hundimiento dentro de asiento). El brazo adrizante es la distancia horizontal entre $\mathbf{B}$ y $\mathbf{G}$ en ejes tierra, y el momento adrizante $RM = \Delta\, g\, GZ$. La curva se calcula de 0 a 90° cada 3° (5° en barridos). El GM inicial se obtiene de la pendiente en el origen, $GM \approx GZ(\varphi)/\sin\varphi$ a ángulo pequeño.

Se marcan los ángulos característicos del trimarán: salida del patín de barlovento, inmersión total del patín de sotavento, salida del casco central y ángulo de estabilidad nula. La reserva de flotabilidad de cada patín es $\rho V_{patín}/\Delta$.`,
      },
      {
        h: 'Hipótesis y límites',
        body: r`- Hidrostática pura: no incluye la sustentación dinámica ni el cambio de flotación por la ola propia.
- Las cubiertas son estancas: más allá del puntal el casco se trata como cerrado.
- Las curvas hidrostáticas de la ventana Curvas añaden masa en el CG (de 0,6 a 1,6 veces el desplazamiento) manteniendo $\mathbf{G}$.`,
      },
    ],
    refs: [
      'Biran, A. y López-Pulido, R. (2014). Ship Hydrostatics and Stability, 2.ª ed. Butterworth-Heinemann.',
      'Sutherland, I. E. y Hodgman, G. W. (1974). Reentrant polygon clipping. Comm. ACM 17(1), 32–42.',
      'Brent, R. P. (1973). Algorithms for Minimization without Derivatives. Prentice-Hall.',
    ],
    validation: r`hydro.test.ts: volumen de cascos de sección rectangular y semielíptica frente a la solución analítica, y equilibrio del diseño base con $\rho V = \Delta$ y $GZ(0) \approx 0$.`,
  },
  {
    id: 'viento',
    title: 'Viento real y aparente',
    col: 0,
    row: 5.1,
    summary: 'Perfil logarítmico del viento real y viento aparente en cada altura de la vela.',
    sections: [
      {
        h: 'Gradiente de viento',
        body: r`El viento real se da a $z_{ref} = 10$ m y se reparte en altura con la capa límite atmosférica neutra sobre mar abierto: $$V_T(z) = V_{T,ref}\,\frac{\ln(z/z_0)}{\ln(z_{ref}/z_0)},\qquad z_0 = 2\cdot10^{-4}\ \mathrm{m}.$$ A la altura de la vela de un barco pequeño (0,2–2 m) el viento es un 65–85 % del de referencia, lo que importa mucho para la fuerza y el centro vélico.`,
      },
      {
        h: 'Viento aparente',
        body: r`En cada altura sobre la cubierta $z_d$, con el barco a velocidad $V$, deriva $\lambda$ y escora $\varphi$, el flujo relativo en ejes del barco es $$u_x = -V_T\cos\beta_T - V\cos\lambda,\qquad u_y = \left(V_T\sin\beta_T - V\sin\lambda\right)\cos\varphi ,$$ con $V_T$ evaluado a la altura real sobre el agua $z = (f + z_d)\cos\varphi$ ($f$: francobordo en el palo). El factor $\cos\varphi$ proyecta el viento sobre el plano de la vela escorada. Así cada franja de la vela ve su propia velocidad y dirección (torsión del viento aparente).`,
      },
    ],
    refs: ['Det Norske Veritas (2010). DNV-RP-C205 Environmental conditions and environmental loads, §2.3.', 'Fossati, F. (2009). Aero-hydrodynamics and the Performance of Sailing Yachts. Adlard Coles, cap. 2.'],
    validation: r`Se comprueba indirectamente: el VLM con viento uniforme reproduce las soluciones de referencia (vlm.test.ts) y el perfil logarítmico sólo cambia la velocidad local de cada franja.`,
  },
  {
    id: 'foil2d',
    title: 'Paneles 2D con capa límite',
    col: 1,
    row: 3.6,
    summary: 'Método propio para cualquier perfil cargado: Hess-Smith, Thwaites, eⁿ, Head y Squire-Young.',
    sections: [
      {
        h: 'Flujo potencial (Hess-Smith)',
        body: r`El contorno se reparte en $N$ paneles rectos (espaciado en coseno por longitud de arco, ventana Resolución). Cada panel lleva una fuente de intensidad constante $q_j$ y todos un vórtice común $\gamma$. Se impone tangencia en el punto medio de cada panel y la condición de Kutta de igual velocidad tangencial en los dos paneles del borde de salida: $$\sum_j A^n_{ij} q_j + \gamma\sum_j B^n_{ij} + \mathbf{U}_\infty\!\cdot\mathbf{n}_i = v_{n,i},\qquad V_{t,1} + V_{t,N} = 0 ,$$ un sistema de $N+1$ ecuaciones. $v_{n,i}$ es la transpiración del acoplamiento viscoso (cero en flujo potencial). $C_p = 1 - V_t^2$; integrando la presión se obtienen $c_l$ y $c_m$ respecto a $c/4$.`,
      },
      {
        h: 'Capa límite laminar y transición',
        body: r`Desde el punto de remanso, en cada cara se integra el método de Thwaites: $$\theta^2 = \frac{0{,}45\,\nu}{U_e^6}\int_0^s U_e^5\,ds,\qquad \lambda = \frac{\theta^2}{\nu}\frac{dU_e}{ds},$$ con las correlaciones de Cebeci y Bradshaw para $H(\lambda)$ y $\ell(\lambda)$. La transición se predice con el método $e^N$ en la forma envolvente de Drela y Giles: $$\frac{d\tilde n}{d Re_\theta} = 0{,}01\sqrt{\left[2{,}4H - 3{,}7 + 2{,}5\tanh(1{,}5H - 4{,}65)\right]^2 + 0{,}25},$$ activa a partir de $Re_{\theta,0}(H)$; transición cuando $\tilde n = N_{crit}$ (9 por defecto, mar abierto con poca turbulencia) o si la laminar se separa ($\lambda < -0{,}09$).`,
      },
      {
        h: 'Capa límite turbulenta y resistencia',
        body: r`La turbulenta se integra con el método de entrada de Head y la fricción de Ludwieg-Tillmann: $$\frac{d\theta}{ds} = \frac{C_f}{2} - (H + 2)\frac{\theta}{U_e}\frac{dU_e}{ds},\qquad \frac{1}{U_e}\frac{d(U_e\theta H_1)}{ds} = 0{,}0306\,(H_1 - 3)^{-0{,}6169},$$ $$C_f = 0{,}246\cdot10^{-0{,}678H}\,Re_\theta^{-0{,}268}.$$ Hay separación turbulenta cuando $H > 2{,}4$. La resistencia de perfil se obtiene en el borde de salida con la fórmula de Squire y Young: $$c_d = 2\,\theta_{TE}\left(U_{e,TE}\right)^{(H_{TE}+5)/2},$$ sumando las dos caras.`,
      },
      {
        h: 'Acoplamiento viscoso y pérdida',
        body: r`El espesor de desplazamiento modifica el flujo potencial mediante una velocidad de transpiración $v_n = d(U_e\,\delta^*)/ds$, que se vuelve a introducir en el sistema de paneles. El acoplamiento directo es inestable cerca de la separación, así que se itera con relajación fuerte (0,25), suavizado de 3 puntos y límite de $\pm0{,}2$, y se trunca en pocas iteraciones (4 por defecto, ventana Resolución): calibrado frente a XFOIL, ese número reproduce mejor la reducción de pendiente que la convergencia completa, que tiende a sobrecorregir un 10 %.

La pérdida por separación del borde de salida se modela con la teoría de Kirchhoff: si la turbulenta se separa en $x_s/c$ en la cara de succión, $$c_l = c_{l,ad}\left(\frac{1 + \sqrt{f}}{2}\right)^2,\qquad f = x_s/c ,$$ con una resistencia de presión $\Delta c_d = |c_n\, k\,\sin\alpha|\,(1 - \sqrt f)$ y un desplazamiento del centro de presión hacia el borde de salida. Más allá del último ángulo calculado se mezcla con la placa plana (ver Polares 2D).`,
      },
      {
        h: 'Límites',
        body: r`- No reproduce las burbujas de separación laminar de forma completa: por debajo de $Re \approx 2\cdot10^5$ XFOIL predice un $c_l$ no lineal a ángulos pequeños que este método integral no capta.
- El $c_{l,max}$ y la post-pérdida son aproximados (modelo de Kirchhoff con punto de separación de Head).
- Por eso, para el NACA 0012 se usa por defecto la tabla de XFOIL, y este método queda para perfiles cargados sin polares y como comparación.`,
      },
    ],
    refs: [
      'Hess, J. L. y Smith, A. M. O. (1967). Calculation of potential flow about arbitrary bodies. Prog. Aerospace Sci. 8, 1–138.',
      'Katz, J. y Plotkin, A. (2001). Low-Speed Aerodynamics, 2.ª ed. Cambridge University Press, cap. 11.',
      'Thwaites, B. (1949). Approximate calculation of the laminar boundary layer. Aeronaut. Q. 1, 245–280.',
      'Cebeci, T. y Bradshaw, P. (1977). Momentum Transfer in Boundary Layers. Hemisphere.',
      'Drela, M. y Giles, M. B. (1987). Viscous-inviscid analysis of transonic and low Reynolds number airfoils. AIAA J. 25(10), 1347–1355.',
      'Head, M. R. (1958). Entrainment in the turbulent boundary layer. ARC R&M 3152.',
      'Squire, H. B. y Young, A. D. (1938). The calculation of the profile drag of aerofoils. ARC R&M 1838.',
      'Moran, J. (1984). An Introduction to Theoretical and Computational Aerodynamics. Wiley, cap. 4 y 7.',
    ],
    validation: r`foil2d.test.ts: (1) en flujo potencial $c_l(0) = 0$ y la pendiente del NACA 0012 está entre 6,0 y 7,2 /rad (teoría de perfil grueso: $2\pi(1 + 0{,}77\,t/c) \approx 6{,}86$); (2) frente a XFOIL a $Re = 5\cdot10^5$ y $10^6$, entre 2° y 10°, el $c_l$ queda dentro de un 15 % (+0,03) y el $c_d$ entre 0,5 y 1,8 veces el de XFOIL. En la práctica el $c_l$ sale un 2–16 % por debajo y el $c_d$ hasta un 35 % por encima cerca de la pérdida.`,
  },
  {
    id: 'polares',
    title: 'Polares 2D por Reynolds',
    col: 2,
    row: 3.6,
    summary: 'Tabla XFOIL del NACA 0012, polares cargadas o del método de paneles, interpoladas en α y Re.',
    sections: [
      {
        h: 'Fuentes',
        body: r`La vela usa, por orden: (1) las polares cargadas por el usuario (ficheros de XFOIL o CSV con columnas alfa, CL, CD y opcionalmente CM, una por Reynolds); (2) si el perfil es el NACA 0012, la tabla incluida, calculada con XFOIL 6.99 con 160 paneles, transición libre $N_{crit} = 9$, de 0 a 22° cada 0,5° y diez Reynolds entre $2\cdot10^4$ y $10^6$; (3) en otro caso, las polares del método de paneles 2D a esos mismos Reynolds. La cola, NACA 0012, usa la tabla XFOIL. La ventana Resolución puede forzar el método de paneles para todo.`,
      },
      {
        h: 'Interpolación',
        body: r`Para un ángulo $\alpha$ y un Reynolds $Re$ se interpola linealmente en $\alpha$ dentro de cada tabla y después linealmente en $\log Re$ entre las dos tablas vecinas (fuera del rango se usa la más cercana). Un perfil simétrico se completa por simetría: $c_l(-\alpha) = -c_l(\alpha)$, $c_d(-\alpha) = c_d(\alpha)$, $c_m(-\alpha) = -c_m(\alpha)$.

Más allá del último punto de la tabla se mezcla progresivamente con la placa plana a ángulos grandes (Lindenburg): $$c_n = \frac{2\sin\alpha}{0{,}56 + 0{,}44\,|\sin\alpha|},\qquad c_l = c_n\cos\alpha,\qquad c_d = c_{d0} + |c_n\sin\alpha| ,$$ con el centro de presión pasando de $c/4$ a $c/2$ a 90°. Esto da un comportamiento acotado en pérdida profunda y en la vela en bandera con viento de través.`,
      },
      {
        h: 'Aviso sobre el Reynolds bajo',
        body: r`A los Reynolds de la cola ($\sim 3\cdot10^4$) el NACA 0012 tiene en XFOIL una zona muerta: entre 0 y unos 3° la sustentación es casi nula (burbuja laminar). Eso hace muy sensible el equilibrio vela-cola a ángulos de cola pequeños. Por eso el ángulo de cola por defecto es 10°.`,
      },
    ],
    refs: [
      'Drela, M. (1989). XFOIL: an analysis and design system for low Reynolds number airfoils. En Low Reynolds Number Aerodynamics, Springer, 1–12.',
      'Lindenburg, C. (2003). Investigation into rotor blade aerodynamics. ECN-C-03-025.',
      'Viterna, L. A. y Corrigan, R. D. (1982). Fixed pitch rotor performance of large HAWTs. NASA CP-2230.',
    ],
    validation: r`foil2d.test.ts: simetría de la tabla, interpolación en Re acotada entre las tablas vecinas, transición a la placa plana a 60° y lectura e interpolación de polares cargadas.`,
  },
  {
    id: 'vlm',
    title: 'VLM no lineal (vela y cola)',
    col: 3,
    row: 3.6,
    summary: 'Vortex Lattice con plano imagen, acoplado franja a franja a las polares viscosas.',
    sections: [
      {
        h: 'Vortex Lattice',
        body: r`Vela y cola se resuelven juntas como superficies sustentadoras planas. Cada superficie se divide en paneles (espaciado en coseno en altura, uniforme en cuerda); cada panel lleva un vórtice de herradura con el segmento ligado en su 1/4 de cuerda y estelas rectas, y un punto de control en su 3/4. La velocidad inducida por cada segmento rectilíneo sale de Biot-Savart: $$\mathbf{v} = \frac{\Gamma}{4\pi}\,\frac{\mathbf{r}_1\times\mathbf{r}_2}{|\mathbf{r}_1\times\mathbf{r}_2|^2}\,\mathbf{r}_0\cdot\left(\frac{\mathbf{r}_1}{r_1} - \frac{\mathbf{r}_2}{r_2}\right).$$ La condición de no penetración en los puntos de control da el sistema lineal $\mathbf{A}\,\boldsymbol\Gamma = -\mathbf{U}\cdot\mathbf{n}$, que se factoriza (LU) una sola vez por geometría.

El plano imagen (ventana Resolución) añade una copia reflejada de todos los vórtices respecto a la superficie del mar o la cubierta, de modo que el flujo no atraviesa ese plano. Las fuerzas por franja salen de Kutta-Joukowski, $\mathbf{F} = \rho\,\mathbf{U}\times\boldsymbol\Gamma\,\Delta z$, con la velocidad local del perfil de viento, y la resistencia inducida se calcula en el plano de Trefftz con la circulación neta de cada tramo de estela: $$D_i = \frac{\rho}{2}\sum_k \Gamma_k\, w_k\, \Delta s_k .$$`,
      },
      {
        h: 'Acoplamiento no lineal con las polares',
        body: r`El VLM es lineal y no ve el espesor, la viscosidad ni la pérdida. Para incluirlos se usa la corrección por «decambering» (variante del método de van Dam y de los métodos α): en cada franja se busca un ángulo de corrección $\Delta_j$ tal que la sustentación del VLM coincida con la de la polar 2D viscosa al ángulo efectivo de esa franja y a su propio Reynolds: $$\alpha_{ef,j} = \frac{c_{l,VLM,j}}{2\pi} - \Delta_j,\qquad c_{l,VLM,j}(\boldsymbol\Delta) = c_{l,2D}\!\left(\alpha_{ef,j},\ Re_j\right),\qquad Re_j = \frac{U_j\, c_j}{\nu}.$$ El término independiente del VLM se modifica como $-U\sin(\alpha_{geo} - \Delta_j)$. Se itera desde $\Delta = 0$ (arranque en frío, para que el resultado no dependa de cálculos anteriores) con relajación 0,6 y una actualización secante por franja, hasta que el residuo es menor que $3\cdot10^{-3}$ o se alcanza el máximo de iteraciones (ventana Resolución). La resistencia de perfil de cada franja es $q\,c\,\Delta z\,c_d(\alpha_{ef}, Re)$ y el momento de perfil $q\,c^2\Delta z\,c_m$.`,
      },
      {
        h: 'Hipótesis y límites',
        body: r`- Superficies planas, sin espesor en el VLM; el espesor entra a través de la polar 2D.
- Estela recta y alineada con el flujo libre: válido mientras no haya separación masiva.
- En pérdida profunda la solución del acoplamiento puede no ser única; el arranque en frío elige la rama continua desde la sustentación adherida.
- La interferencia entre la vela y los cascos se limita al plano imagen.`,
      },
    ],
    refs: [
      'Katz, J. y Plotkin, A. (2001). Low-Speed Aerodynamics, 2.ª ed. Cambridge University Press, cap. 12.',
      'Bertin, J. J. y Cummings, R. M. (2014). Aerodynamics for Engineers, 6.ª ed. Pearson, cap. 7.',
      'van Dam, C. P. (2002). The aerodynamic design of multi-element high-lift systems for transport airplanes. Prog. Aerospace Sci. 38, 101–144.',
      'Gallay, S. y Laurendeau, E. (2015). Nonlinear generalized lifting-line coupling algorithms for pre/poststall flows. AIAA J. 53(7), 1784–1792.',
      'Drela, M. (2014). Flight Vehicle Aerodynamics. MIT Press, cap. 5–6.',
    ],
    validation: r`vlm.test.ts: ala rectangular de alargamiento 6 con $C_{L\alpha}$ entre 4,0 y 4,7 /rad (referencia ≈ 4,3) y eficiencia de Oswald entre 0,85 y 1,03; semiala con imagen igual al ala completa; ala trapecial de estrechamiento 0,4 con $e > 0{,}95$. sailnl.test.ts: el acoplamiento no lineal converge, es determinista, reproduce la caída de $C_L$ en pérdida y mantiene la pendiente 3D en régimen lineal.`,
  },
  {
    id: 'cola',
    title: 'Equilibrio vela-cola',
    col: 3,
    row: 2.45,
    summary: 'Ángulo de ataque al que se anula el momento respecto al eje para un ángulo de cola dado.',
    sections: [
      {
        h: 'Condición de equilibrio',
        body: r`La vela es libre de girar en su eje; la cola la orienta. Para un ángulo de cola $\delta$ y el flujo aparente, el ángulo de ataque de la vela es el que anula el momento total respecto al eje (aerodinámico más gravedad del conjunto): $$M(\alpha;\delta) = M_{aero}(\alpha,\delta) + M_{grav}(\varphi) = 0 .$$ Se resuelve con un atajo secante desde la solución anterior y, si no basta, con una búsqueda direccional: desde la estimación se avanza en el sentido en que el momento hace girar la vela (paso 0,5° que se duplica, hasta ±40°) hasta acotar una raíz, que se refina con Brent. Así se elige la raíz físicamente alcanzable (la primera estable en el sentido del giro).`,
      },
      {
        h: 'Estabilidad y margen',
        body: r`El equilibrio es estable si $\partial M/\partial\alpha < 0$. El margen estático se expresa como la distancia del punto neutro por detrás del eje, en % de la cuerda media: $$\text{margen} = -\frac{\partial M/\partial\alpha}{\partial L/\partial\alpha\;\bar c}\times 100 .$$ Si la cola trabaja en pérdida o no se encuentra equilibrio, el margen no tiene sentido y se muestra «—».`,
      },
      {
        h: 'Modos de manejo',
        body: r`- Ángulo de cola: la vela busca su equilibrio (barco real).
- Ángulo de ataque impuesto: se fija $\alpha$ directamente (útil para estudiar la vela).
- Optimizar velocidad: se busca el $\alpha$ de máxima velocidad (sección áurea) con escora ≤ 20° y sin pérdida, y después el ángulo de cola que lo produce.`,
      },
    ],
    refs: [
      'Elkaim, G. H. (2008). System identification-based control of an unmanned autonomous wind-propelled catamaran. Control Eng. Practice 17(1), 158–169.',
      'Etkin, B. y Reid, L. D. (1996). Dynamics of Flight: Stability and Control, 3.ª ed. Wiley, cap. 2 (margen estático).',
    ],
    validation: r`El test de robustez (robust.test.ts) resuelve el equilibrio en varios vientos y ángulos; la curva «ángulo de cola → α» de la ventana Principal permite ver la zona muerta de la cola a Reynolds bajo.`,
  },
  {
    id: 'agua',
    title: 'Fuerzas laterales del agua',
    col: 2,
    row: 1.1,
    summary: 'Quilla, timón y casco como alas de alargamiento bajo; downwash de la quilla sobre el timón.',
    sections: [
      {
        h: 'Sustentación de los apéndices',
        body: r`Quilla y timón se tratan como alas con el casco como plano imagen (alargamiento efectivo doble, $AR = 2b^2/S$), con la pendiente de Helmbold para alargamiento bajo: $$C_{L\alpha} = \frac{2\pi\,AR}{2 + \sqrt{AR^2 + 4}} .$$ El ángulo de ataque efectivo con escora es $\alpha_k = \arctan(\tan\lambda\cos\varphi)$. El timón trabaja en el downwash de la quilla, $\alpha_r = \alpha_k(1 - \varepsilon)$ con $\varepsilon = 2C_{L\alpha,k}/(\pi AR_k)$ (máximo 0,6). El casco aporta una fuerza lateral de cuerpo esbelto con área $L\,T$ y pendiente $\pi T/L$ (Jones). La resistencia inducida de quilla y timón es $D_i = L^2/(q\,\pi\,AR\,e\,S)$ con $e = 0{,}9$.`,
      },
      {
        h: 'Uso en el equilibrio',
        body: r`La fuerza lateral total del agua debe igualar la lateral aerodinámica; de ahí sale la deriva $\lambda$. El centro de resistencia lateral (CLR) es la media ponderada de los centros de presión (a 0,42 de la envergadura de cada apéndice) y da el brazo del momento escorante. Los patines no aportan fuerza lateral.`,
      },
    ],
    refs: [
      'Helmbold, H. B. (1942). Der unverwundene Ellipsenflügel als tragende Wirbelfläche. Jahrbuch der Deutschen Luftfahrtforschung.',
      'Jones, R. T. (1946). Properties of low-aspect-ratio pointed wings at speeds below and above the speed of sound. NACA Report 835.',
      'Whicker, L. F. y Fehlner, L. F. (1958). Free-stream characteristics of a family of low-aspect-ratio all-movable control surfaces. DTMB Report 933.',
    ],
    validation: r`La fórmula de Helmbold coincide con la teoría de línea sustentadora para alargamiento grande y con la de ala esbelta ($\pi AR/2$) para alargamiento pequeño; el test del solver comprueba que la deriva resultante es positiva y pequeña.`,
  },
  {
    id: 'resistencia',
    title: 'Resistencia al avance',
    col: 2,
    row: 2.2,
    summary: 'Fricción ITTC-57 con factor de forma, olas con Michell por casco, apéndices e inducida.',
    sections: [
      {
        h: 'Fricción y forma',
        body: r`Para cada casco con su estado de inmersión real a la escora de equilibrio (superficie mojada $S$, eslora en la flotación $L_{WL}$, sección máxima $A_x$): $$R_F = \tfrac12\rho V^2 S\, C_F(Re)\,(1 + k),\qquad C_F = \frac{0{,}075}{(\log_{10}Re - 2)^2},\qquad Re = \frac{V L_{WL}}{\nu},$$ con el factor de forma de Hoerner para cuerpos esbeltos $1 + k = 1 + 1{,}5(d/L)^{3/2} + 7(d/L)^3$, donde $d = \sqrt{8A_x/\pi}$ es el diámetro equivalente de la sección sumergida máxima. Quilla, timón y bulbo usan su cuerda o longitud y el factor de forma de perfil $1 + 2t/c + 60(t/c)^4$.`,
      },
      {
        h: 'Olas: integral de Michell',
        body: r`La resistencia por olas de cada casco esbelto se calcula con la integral de Michell (1898) a partir de su semimanga $f(x,z)$ en la flotación de adrizado: $$R_W = \frac{4\rho g^2}{\pi U^2}\int_1^\infty \left(P^2 + Q^2\right)\frac{\lambda^2}{\sqrt{\lambda^2 - 1}}\,d\lambda,$$ $$P + iQ = \iint \frac{\partial f}{\partial x}\, e^{-\lambda^2 k_0 z}\, e^{i\lambda k_0 x}\,dx\,dz,\qquad k_0 = g/U^2 ,$$ integrando con el cambio $\lambda = \cosh t$ para eliminar la singularidad. Se tabula una vez frente a la velocidad y, con escora, se escala con el cuadrado de la relación de volúmenes sumergidos. No se incluye la interferencia entre cascos.`,
      },
      {
        h: 'Límites',
        body: r`- Michell supone casco delgado y flujo no viscoso; es fiable para $Fn < 0{,}5$ en cascos esbeltos ($L/B > 8$). Fuera de ese rango se avisa.
- No hay resistencia añadida en olas ni por escora más allá del cambio de inmersión.`,
      },
    ],
    refs: [
      'ITTC (1957). Recommended procedures: friction line ITTC-1957.',
      'Hoerner, S. F. (1965). Fluid-Dynamic Drag. Hoerner Fluid Dynamics, cap. 6.',
      'Michell, J. H. (1898). The wave resistance of a ship. Phil. Mag. 45, 106–123.',
      'Tuck, E. O. (1989). The wave resistance formula of J. H. Michell (1898) and its significance to recent research in ship hydrodynamics. J. Austral. Math. Soc. B 30, 365–377.',
    ],
    validation: r`michell.test.ts: casco Wigley ($B/L = 0{,}1$, $T/L = 0{,}0625$) con coeficiente de olas en $Fn = 0{,}3$ del orden de los valores publicados de Michell ($0{,}5$–$3\cdot10^{-3}$).`,
  },
  {
    id: 'vpp',
    title: 'Equilibrio de navegación (VPP)',
    col: 4,
    row: 1.6,
    summary: 'Velocidad a la que el empuje iguala la resistencia, con deriva, escora y vela en equilibrio.',
    sections: [
      {
        h: 'Ecuaciones',
        body: r`Se resuelven a la vez el equilibrio de fuerzas en $x$ y en $y$, el de momentos de escora y el de la vela: $$F_{x,aero}(V,\lambda,\varphi,\alpha) = R(V,\varphi,\lambda),\qquad F_{y,aero} = F_{y,agua}(V,\lambda,\varphi),$$ $$M_{esc} = F_{y,vela}\,(z_{CE} - z_{CLR}) + F_{y,cascos}\,(z_w - z_{CLR}) = RM(\varphi),\qquad M_{eje}(\alpha) = 0 .$$`,
      },
      {
        h: 'Algoritmo',
        body: r`- Bucle interno a velocidad fija: con la deriva y la escora actuales se calcula el viento aparente, el equilibrio vela-cola y las fuerzas de la vela; la deriva se obtiene de la fuerza lateral y la escora invirtiendo la curva de momento adrizante. Se itera con relajación 0,6 hasta cambios menores que $10^{-4}$ rad.
- Bucle externo: método de Brent sobre la velocidad para anular $F_x - R$ (tolerancia $10^{-3}$ m/s), acotando primero el intervalo. Si a velocidad casi nula la vela no vence la resistencia, el barco no avanza.
- Si el momento escorante supera el adrizante máximo, el barco vuelca en esa condición.
- Al final se comprueba el asiento con el momento de cabeceo del empuje y el francobordo en proa del casco central y del patín de sotavento.`,
      },
    ],
    refs: [
      'Kerwin, J. E. (1978). A velocity prediction program for ocean racing yachts. MIT Report 78-11.',
      'Larsson, L., Eliasson, R. E. y Orych, M. (2014). Principles of Yacht Design, cap. 12.',
      'Brent, R. P. (1973). Algorithms for Minimization without Derivatives. Prentice-Hall.',
    ],
    validation: r`solver.test.ts y robust.test.ts: el equilibrio converge en todos los casos ensayados, el empuje iguala la resistencia en la solución y la escora coincide con la que da la curva de brazos escorantes (studies.test.ts, ±1,5°).`,
  },
  {
    id: 'estabilidad',
    title: 'Brazos escorantes y vuelco',
    col: 5,
    row: 0.9,
    summary: 'Curva GZ frente a los brazos de la vela en cuatro casos y viento de vuelco.',
    sections: [
      {
        h: 'Brazos escorantes',
        body: r`A cada escora $\varphi$ de la curva GZ se recalcula la fuerza de la vela con la velocidad y la deriva de la solución, y se convierte en brazo: $$a(\varphi) = \frac{M_{esc}(\varphi)}{\Delta\, g}.$$ Casos: viento actual; racha ($V_T\times1{,}4$) con el mismo ángulo de ataque; vela al ángulo de máxima fuerza escorante; vela en bandera ($\alpha = 0$). El equilibrio es el primer corte $GZ = a$; el brazo adrizante restante es $GZ - a$, y su máximo indica cuánto momento extra admite el barco antes de volcar. El área entre las dos curvas desde el equilibrio hasta el segundo corte (ángulo límite) es la reserva de energía frente a una racha, en $\mathrm{m\cdot rad}$, como en los criterios de viento de la IMO.`,
      },
      {
        h: 'Viento de vuelco',
        body: r`Sin arrancada y con viento de través, el viento de vuelco es aquel cuyo momento escorante máximo iguala el adrizante máximo. Como el momento escala aproximadamente con $V_T^2$ pero las polares dependen de Re, se itera un punto fijo $$V_{T,k+1} = V_{T,k}\sqrt{\frac{RM_{max}}{M_{esc}(V_{T,k})}}$$ desde 10 m/s. «Trimada» toma la máxima fuerza aerodinámica total orientada de costado (peor caso); «en bandera» la vela a $\alpha = 0$ más la resistencia de cascos y equipos.`,
      },
    ],
    refs: [
      'IMO (2008). International Code on Intact Stability (2008 IS Code), parte A, §2.3 (criterio meteorológico).',
      'ISO 12217-2:2022. Small craft — Stability and buoyancy assessment and categorization — Part 2: Sailing boats.',
      'Deakin, B. (1991). The development of stability standards for UK sailing vessels. RINA Trans. 133.',
    ],
    validation: r`studies.test.ts: el equilibrio de la curva de brazos con el viento actual coincide con la escora del VPP (±1,5°), la racha escora más y la vela en bandera menos, y el brazo restante es positivo.`,
  },
  {
    id: 'estudios',
    title: 'Curvas, sensibilidad y optimización',
    col: 5,
    row: 2.4,
    summary: 'Polar de velocidades, barridos, mapas, sensibilidad y optimizador Nelder-Mead.',
    sections: [
      {
        h: 'Curvas de diseño',
        body: r`La polar de velocidades resuelve el VPP de 30° a 180° cada 15° para varios vientos. Las curvas de empuje y resistencia resuelven el equilibrio lateral a velocidad impuesta; su cruce es la velocidad de equilibrio. La inmersión de los patines sale de la curva GZ (frente a la escora) y del VPP (frente al viento).`,
      },
      {
        h: 'Sensibilidad',
        body: r`Cada parámetro de diseño se varía $\pm10$ % con el resto fijo y se mide el cambio relativo de la velocidad y del viento de vuelco: $$S_i^\pm = \frac{y(p_i(1\pm0{,}1)) - y(p_i)}{y(p_i)}\times100 .$$ El gráfico de tornado ordena los parámetros por su efecto sobre la velocidad.`,
      },
      {
        h: 'Optimización',
        body: r`El optimizador maximiza la velocidad (en la condición actual o la media de varias) con restricciones de escora, viento de vuelco, reserva del patín y margen vela-cola, impuestas como penalizaciones: $$J(\mathbf{x}) = \bar V(\mathbf{x}) - \sum_j \frac{\max(0,\,g_j(\mathbf{x}))}{s_j} - 5\,[\text{vuelca}] .$$ Las variables se normalizan a $[0,1]$ dentro de su rango y se usa el método simplex de Nelder-Mead (reflexión 1, expansión 2, contracción 0,5, encogimiento 0,5), que no necesita derivadas, adecuado para una función con pequeños saltos numéricos. Se detiene por número de evaluaciones o cuando el simplex se reduce por debajo de $10^{-3}$. Es un óptimo local: conviene repetirlo desde otros diseños.`,
      },
    ],
    refs: [
      'Nelder, J. A. y Mead, R. (1965). A simplex method for function minimization. Computer J. 7(4), 308–313.',
      'Saltelli, A. et al. (2008). Global Sensitivity Analysis: The Primer. Wiley, cap. 1.',
    ],
    validation: r`studies.test.ts: polar de velocidades con velocidad positiva de través, sensibilidad con el signo físico esperado (más altura de vela, menos viento de vuelco) y optimizador que no empeora la base y respeta los rangos.`,
  },
]
