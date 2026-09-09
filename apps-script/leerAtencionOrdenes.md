# ATENCION ORDENES ya no cabe en una sola lectura

## El síntoma

En **Últimos 30 días → Validaciones pendientes por instalar** el subtítulo terminaba así:

```
sin última agenda (falló: No se pudo leer "ATENCION ORDENES": Código de respuesta: 200.
Mensaje: { "range": "'ATENCION ORDENES'!A1:AJ13281", "majorDimension": "ROWS",
"values": [ [ "Cuenta", "Ticket", "OS", ... ] ] })
```

El panel seguía saliendo (139 pendientes, 398 OS con seguimiento); lo único que se
perdía era la columna de **última agenda**, que es justo lo que aporta esa pestaña. La
vista **Atención de órdenes** sí se caía completa.

## Qué estaba pasando

El detalle raro es que dice **"Código de respuesta: 200"** y enseguida vacía el JSON de
la respuesta, con encabezado y datos correctos. O sea: **la API de Sheets contestó
bien**. El que truena es Apps Script, al convertir esa respuesta en un objeto.

`_leerHojaAPI()` en [Datos.gs](Datos.gs) pedía la pestaña completa de un golpe:

```js
Sheets.Spreadsheets.Values.get(CFG.LIBRO, "'" + nombreHoja + "'")
```

Sin rango, eso trae `'ATENCION ORDENES'!A1:AJ13281` = **13,280 renglones × 36 columnas
≈ 478,000 celdas**. Ese JSON rebasa el límite que Apps Script puede deserializar, y en
lugar de un error legible lanza una excepción genérica con el código HTTP (200, porque
la llamada sí funcionó) y el cuerpo crudo pegado en el mensaje. `_hoja()` la atrapa, la
envuelve en `No se pudo leer "..."` y la manda al navegador tal cual.

No era permiso, ni sesión, ni el nombre de la pestaña: **era el tamaño**. Antes
funcionaba porque la pestaña era más chica; se reemplaza completa cada día y ya llegó a
13,281 renglones.

Es el mismo límite que ya se sorteaba del lado de la escritura: `_subirAtencionOrdenes`
en [Code.gs](Code.gs) escribe en bloques de 2,000 renglones justamente por esto. Lo que
faltaba era la contraparte al **leer**.

## Qué se cambió

Todo en `_leerHojaAPI()`, la única función que lee pestañas. Como `_datos` y `_hoja`
pasan por ella, el arreglo cubre **todas** las hojas (BASE DE DATOS, PLANTILLA, VENTA
TECNICO, OS POR INSTALAR, SEGUIMIENTO VENTAS…), no solo ATENCION ORDENES.

1. **Se lee por bloques de renglones y se concatenan.** El tamaño del bloque se calcula
   por ancho (`CELDAS_POR_BLOQUE / ultimaCol`), para pedir ~150,000 celdas por llamada
   dé igual si la pestaña tiene 10 columnas o 40. Con ATENCION ORDENES son 4 llamadas
   en vez de 1.
2. **Se reponen los renglones vacíos que recorta la API al final de cada bloque**, para
   que el renglón 5,000 de la pestaña siga siendo el 5,000 del arreglo, exactamente
   como cuando se leía de un jalón.
3. **Se resuelve la pestaña con `_obtenerHojaPorNombreOGid()`** (ya existía en Code.gs,
   la usa el panel de subida). Hacía falta el objeto de la hoja para saber hasta qué
   renglón y columna pedir, y de paso el campo "gid o nombre de ATENCION ORDENES" de
   Ajustes ahora también acepta un gid al leer, no solo al subir.
4. **`_indiceALetra()`**, la inversa de `_letraAIndice()` que ya estaba (1 → "A",
   36 → "AJ"), para armar el rango A1.

De pasada, `_hoja()` devolvía `total: -1` con una pestaña vacía; ahora devuelve `0`.

Lo que **no** cambió: `_leerHojaAPI()` recibe lo mismo y devuelve lo mismo (arreglo de
renglones, encabezado en la posición 0). Ningún otro punto de `Datos.gs` se tocó, y el
navegador recibe una respuesta idéntica — `comoTabla()` en [index.html](../index.html)
sigue igual.

## Cómo comprobar que quedó

1. Pega [Datos.gs](Datos.gs) completo sobre tu archivo `Datos` en el editor de Apps
   Script.
2. **Implementar → Administrar implementaciones → ✏️ → Nueva versión → Implementar.**
   No basta con guardar.
3. En la app: **Ajustes → Releer ATENCION ORDENES**.
4. En Últimos 30 días, el subtítulo del panel ya no debe traer `sin última agenda (...)`
   y la columna de última agenda de cada pendiente debe venir llena.
5. La vista **Atención de órdenes** deja de decir "No pude leer ATENCION ORDENES".

## Ojo con lo que viene

Partir la lectura resuelve el tope de deserialización, pero la pestaña sigue creciendo y
todavía hay que mandar esos ~478,000 valores al navegador en un solo JSONP. Cuando
vuelva a apretar, las salidas en orden de menos a más trabajo:

- **Podar la pestaña.** Se reemplaza completa en cada carga; si el CSV de origen se
  pudiera acotar a los últimos ~90 días, el problema desaparece por años.
- **Devolver solo las columnas que se usan.** El HTML localiza las columnas por nombre
  de encabezado (`buscaCol`), así que se pueden mandar menos siempre que vaya también
  su encabezado. De las 36 se ocupan unas 16.
- **Paginar `accion=hoja`.** Aceptar `desde`/`hasta` y que `cargarOrdenes()` pida dos o
  tres pedazos. Es el cambio más grande porque toca los dos lados.
