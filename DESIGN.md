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
- **Fichas de número**: discos de esmalte. Crema, anillo fino oscuro, una sombra interior que
  las despega del terreno. El 6 y el 8 en rojo lenga, como siempre.
- **Piezas**: casas con techo a dos aguas y un costado más oscuro, ciudades con un segundo
  cuerpo, caminos con un bisel. Dos tonos por pieza alcanzan para dar volumen sin gradientes.
- **Cartas**: papel crema con el borde del color del recurso y una ilustración simple en SVG.

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
