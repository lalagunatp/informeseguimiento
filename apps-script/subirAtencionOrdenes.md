# Falta pegar esto en el Apps Script del proxy

La app ya manda la carga de **ATENCION ORDENES**, pero el proxy todavía no conoce la
acción. Mientras no se pegue esto, el botón "Reemplazar ATENCION ORDENES con este
archivo" va a contestar que la acción no existe. Nada se rompe ni se borra: la app
avisa el error y ya.

Cada hoja subible tiene su propia acción en el proxy (`subirBaseDatos`,
`subirVentaTecnico`, `subirOsPorInstalar`); falta la de esta.

## Qué manda la app

`POST` como formulario (`application/x-www-form-urlencoded`), leído con `e.parameter`
igual que las demás:

| parámetro    | contenido                                                              |
|--------------|------------------------------------------------------------------------|
| `accion`     | `subirAtencionOrdenes`                                                 |
| `token`      | el token de sesión                                                     |
| `pestana`    | nombre o gid de la pestaña (lo que esté en Ajustes; por omisión `ATENCION ORDENES`) |
| `filaInicio` | primer renglón de datos, 1-based (con encabezado en la fila 1 llega `2`) |
| `filas`      | JSON: arreglo de arreglos, ya sin el encabezado                        |

Y espera de vuelta `{ ok: true, filas: <cuántos renglones quedaron> }`, o
`{ ok: false, error: "..." }`.

## Permiso

Los mismos que suben OS por instalar: los puestos con acceso `os` (Gerente de
Operaciones, Supervisor de Planta Interna, Coordinador PE, Analista de Atención a
Clientes). La app ya lo checa antes de mostrar el panel, pero **el proxy tiene que
volver a checarlo**, porque la validación de la app es solo de interfaz.

## Código

Pega la función y engancha la acción en el router (donde ya se atiende
`subirOsPorInstalar`). Los dos puntos marcados con `<-- ENGANCHAR` deben usar los
mismos helpers que ya tiene `subirOsPorInstalar`, no hace falta inventar nada nuevo.

```js
function subirAtencionOrdenes(e) {
  // <-- ENGANCHAR: la misma validación de sesión y de permiso "os" que usa
  // subirOsPorInstalar. Si allá se llama de otro modo, cámbialo aquí igual.
  var sesion = _sesionDe(e.parameter.token);
  if (!sesion || !sesion.ok) return { ok: false, expirado: true, error: 'La sesión expiró' };
  if (sesion.acceso !== 'os') return { ok: false, error: 'Tu puesto no puede subir esta hoja' };

  var destino = String(e.parameter.pestana || 'ATENCION ORDENES').trim();
  var filaInicio = Number(e.parameter.filaInicio || 2);
  var filas = JSON.parse(e.parameter.filas || '[]');
  if (!filas.length) return { ok: false, error: 'No llegaron renglones' };

  var libro = SpreadsheetApp.openById(ID_LIBRO);   // el mismo ID que usan las demás acciones
  var hoja = /^\d+$/.test(destino) ? _hojaPorGid(libro, destino) : libro.getSheetByName(destino);
  if (!hoja) return { ok: false, error: 'No encontré la pestaña ' + destino };

  var ancho = filas.reduce(function (m, f) { return Math.max(m, f.length); }, 0);
  filas.forEach(function (f) { while (f.length < ancho) f.push(''); });

  // borra lo que había debajo del encabezado y escribe lo nuevo
  var ultima = hoja.getLastRow();
  if (ultima >= filaInicio) {
    hoja.getRange(filaInicio, 1, ultima - filaInicio + 1, hoja.getLastColumn()).clearContent();
  }
  if (hoja.getMaxRows() < filaInicio + filas.length - 1) {
    hoja.insertRowsAfter(hoja.getMaxRows(), filaInicio + filas.length - 1 - hoja.getMaxRows());
  }
  if (hoja.getMaxColumns() < ancho) {
    hoja.insertColumnsAfter(hoja.getMaxColumns(), ancho - hoja.getMaxColumns());
  }
  hoja.getRange(filaInicio, 1, filas.length, ancho).setValues(filas);
  SpreadsheetApp.flush();

  // <-- ENGANCHAR: el mismo registro de "última carga" que hacen las otras acciones,
  // para que salga en el menú. La app lee la propiedad atencionOrdenes.
  _registraCarga('atencionOrdenes', sesion);

  return { ok: true, filas: filas.length };
}
```

En `accion: "ultimasCargas"` hay que devolver también `atencionOrdenes` (mismo formato
que `osPorInstalar`: `{ fecha, numero, nombre, puesto }`). Si no se agrega, la app no
falla: solo dirá "sin registro todavía".

## Ojo con el tamaño

El archivo de atención de órdenes trae del orden de **10,000 renglones × 36 columnas**
(unos 5 MB de JSON, ~358,000 celdas). El POST pasa, pero un `setValues` de ese tamaño
se acerca al límite de 6 minutos de ejecución de Apps Script. Si truena por tiempo, hay
que partir la escritura en bloques (por ejemplo de 2,000 renglones) y que la app mande
la carga por partes; eso ya requiere cambiar el contrato de los dos lados.
