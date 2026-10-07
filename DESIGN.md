# Dirección visual — Tierra Austral

Una sola decisión de fondo: **el juego se ve como los materiales del sur**, no como un tablero
genérico. Chapa acanalada, madera de lenga gastada por el viento, esmalte de cartel de ruta,
piedra volcánica. Todo lo demás sale de ahí.

Esto no es decoración: el tema resuelve problemas concretos. Las texturas de terreno hacen que
cada hex se distinga sin depender solo del color (importa para daltonismo), las fichas de número
con aspecto de esmalte se leen mejor sobre terreno texturado que un círculo plano, y las piezas
con volumen se distinguen del tablero cuando la pantalla está a medio metro.

## Paleta

Seis colores base. El fondo **no es negro**: es azul de noche patagónica, frío, para que los
ocres y los rojos de la estepa se vean cálidos contra él.

| Nombre    | Hex       | Para qué                                                   |
| --------- | --------- | ---------------------------------------------------------- |
| `noche`   | `#141C24` | Fondo. Azul apagado, no negro tintado                      |
| `chapa`   | `#26323D` | Paneles, superficies elevadas                              |
| `estepa`  | `#C9A227` | Ocre de pasto seco: lo urgente, tu turno, los bonos        |
| `lenga`   | `#9E2B25` | Rojo de lenga en otoño: peligro, ladrón, el 7              |
| `glaciar` | `#6FA8B6` | Azul de hielo: información, agua, puertos                  |
| `guanaco` | `#E3D5BF` | Texto principal y cartas. Crema tostado, nunca blanco puro |

Los cuatro colores de jugador (que son parte de las reglas) se reafinan dentro de esa familia:
`celeste #5FA8D3`, `bordo #A63446`, `verde #4C8B5B`, `amarillo #E0B93F`.

Cada recurso tiene además su propio tono cálido (`RESOURCE_TONE`), que es con el que se pinta su
nombre y su ficha en el comercio. **La lana es verde pastizal, no crema**: el color del recurso es
el del campo del que sale, y un crema sobre panel oscuro se lee gris — que es lo que ya es el
mineral.

## Tipografía

Dos familias, las dos de **Omnibus-Type, un taller tipográfico de Buenos Aires**. No es un
guiño: son tipografías pensadas para señalética y pantalla, que es exactamente lo que este
juego necesita.

- **Chivo** para títulos, números de hex, puntajes y dados. Es una grotesca de cartel: pesada,
  angosta, con números de una sola mirada.
- **Asap** para todo lo demás. Humanista de esquinas redondeadas, pensada para leerse chica en
  pantalla, que es donde vive el 90% de esta interfaz.

Escala: 11 / 13 / 15 / 20 / 32 / 52. Los números del tablero y los puntajes van en Chivo con
`font-variant-numeric: tabular-nums`, para que no bailen cuando cambian.

## Materiales

- **Terreno**: cada hex lleva un patrón SVG propio, sutil, del material que representa — troncos
  finos en el bosque, surcos en los campos, punteado de arcilla en las colinas, pasto inclinado
  por el viento en el pastizal, curvas de nivel en la montaña. Sin imágenes: patrones SVG, que
  pesan nada y escalan.
- **Puertos**: el círculo va sobre la **perpendicular al punto medio de su arista**, no sobre la
  dirección del centro del tablero. No son lo mismo: para tres de los nueve puertos esas dos
  direcciones difieren 49°, lo suficiente para que el círculo se corra contra uno de los dos
  vértices y se trague esa pata entera. Las patas son madera clara sobre un filo oscuro, y los
  puertos se dibujan **encima** del terreno.

- **Ícono de recurso en cada hex**: el mismo dibujo que la carta de ese recurso, **grabado** —
  una copia oscura corrida un pelo hacia abajo debajo de una clara—, de un cuarto del hex y
  arriba de la ficha. El número dice cada cuánto; el ícono dice de qué, que hasta ahora era un
  color que había que haber aprendido. Grabado y no dibujado porque está hecho de los mismos dos
  tonos que el terreno, y por eso sobrevive a los seis sin necesitar una caja alrededor. El
  desierto lleva un sol: dejarlo vacío se lee como un ícono que no cargó.

  **Un solo dibujo por recurso, en `ResourceGlyph.tsx`.** Antes las cartas tenían SVG y todo lo
  demás —puertos, costos, avisos— usaba emojis, así que el juego hablaba dos idiomas visuales y
  el segundo se veía distinto en cada sistema operativo.

  **Siluetas llenas, no línea.** La primera versión eran trazos finos: un dibujo técnico, preciso,
  frío y casi invisible al tamaño al que se usan de verdad. Un juego de mesa quiere la **forma** de
  la cosa, como la tiene una pieza de madera. Todo va en `currentColor` con el detalle interno a
  menor opacidad del mismo color, y eso es lo que deja que un solo dibujo haga los dos trabajos:
  pintado en su tono cálido (`RESOURCE_TONE`) en una carta o una ficha de comercio, y grabado en un
  hex como dos copias corridas de oscuro y claro.

- **Fichas de número**: discos de esmalte. Crema, anillo fino oscuro, una sombra interior que
  las despega del terreno. El 6 y el 8 en rojo lenga, como siempre.
- **Piezas**: casas con techo a dos aguas y un costado más oscuro, ciudades con **una torre
  almenada** al lado del cuerpo, caminos con un bisel. Dos tonos por pieza alcanzan para dar
  volumen sin gradientes.

  Dos decisiones que salieron de mirarlas sobre los seis terrenos (`?sprites=1`):

  - **Se distinguen por silueta, no por tamaño.** Dos casas de distinto tamaño son dos casas; una
    torre contra un techo es otro edificio incluso a seis píxeles de alto. Por eso la ciudad lleva
    torre y almenas y no simplemente más cuerpo.
  - **Cada pieza se dibuja tres veces: halo oscuro, cuerpo, filo claro fino.** Un solo contorno no
    alcanza para seis terrenos — uno oscuro desaparece en el bosque y uno claro en el desierto —, y
    el caso que lo forzó fue el verde sobre el pastizal. El halo además hace de sombra proyectada.
    Todo escala con una sola constante (`SCALE` en `Pieces.tsx`), hoy en 1,45.

- **Cartas**: papel crema con el borde del color del recurso y la ilustración pintada del recurso,
  a 76×104 px. Antes medían 50×68 y el dibujo era la miniatura de una miniatura, cuando la mano es
  lo que más mirás en un turno. La banda de la mano sale del alto de la carta, así que las dos no
  se pueden desfasar; el tablero paga unos 40 px de alto por el cambio.

- **Dos familias de arte por recurso, a propósito.** Las **ilustraciones pintadas**
  (`public/recursos/*.webp`, unos 20 kB cada una, recortadas y con el fondo sacado) van donde hay
  lugar para verlas: cartas, fichas de comercio, costos. Lo que las hace funcionar es el sombreado,
  que es justo lo que SVG hace peor. Los **dibujos** de `ResourceGlyph.tsx` se quedan donde la
  imagen tiene que ser chica o monocroma: el ícono del hex es un cuarto de hex y tiene que
  sobrevivir grabado en seis terrenos, y una ilustración detallada a ese tamaño es barro.

## Jerarquía de pantalla

El panel derecho estaba apilado sin orden. De arriba hacia abajo, por urgencia:

```
┌─────────────────────────────┐
│ QUÉ TENGO QUE HACER         │  banner + acciones del turno
├─────────────────────────────┤
│ JUGADORES                   │  puntos, bonos, cartas, ruta
├─────────────────────────────┤
│ [Comercio] [Chat] [Registro]│  solapas: lo que no es urgente
└─────────────────────────────┘
      la mano va abajo, sobre el tablero, abanicada
```

La mano deja el panel y pasa a ser **cartas abanicadas sobre el borde inferior del tablero**,
que es donde uno mira cuando piensa qué construir.

## Movimiento

Una sola regla: el movimiento explica algo que cambió. Los dados caen, las cartas viajan de
dónde salieron hacia quién las recibió, el borde late cuando es tu turno. Nada de entradas
animadas por sección ni transiciones en cada hover. Hay un control de velocidad y "sin
animaciones" es una opción de primera clase.

## Lo que evitamos a propósito

- Fondo crema con serif de alto contraste: es el default de todo tablero digital.
- Un solo acento saturado sobre negro: acá el color viene en familia (ocre, lenga, glaciar).
- Cards redondeadas idénticas para todo: el radio distingue jerarquía (tablero 0, paneles 6px,
  cartas 10px).
- Mayúsculas espaciadas como etiqueta de cada sección; las secciones se distinguen por peso y
  espacio.
