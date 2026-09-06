/**
 * =============================================
 *  CÓDIGO PRINCIPAL · AUTENTICACIÓN + ROUTING
 *  Reporte de seguimiento · La Laguna
 * =============================================
 */


// =============================================
//  CONFIGURACIÓN — ajusta estos valores
// =============================================

var CFG = {
  // ID de tu libro de Google Sheets (el que ya usas)
  LIBRO: '1Ph5T-m-Lkbdw1LBq-9wIIMW6C8bljOG1t5GfZQhNZ2o',

  // gid numérico de la pestaña PLANTILLA
  GID_PLANTILLA: 913334386,

  // Columnas de PLANTILLA (pon la LETRA de cada columna)
  COL_NUMERO: 'D',    // Número de empleado
  COL_NOMBRE: 'E',    // Nombre completo
  COL_PUESTO: 'F',    // Puesto
  COL_PIN:    'AB',   // Columna de PINs
  // (las columnas AC y AD las administra Pin.gs: PIN TEMPORAL y PIN ANTERIOR)

  // Puestos con acceso TOTAL al reporte (separados por ;)
  PUESTOS_TOTAL: 'DIRECTOR DISTRITAL; COACH DE VENTAS TECNICO; LIDER VENTAS; LIDER DE VENTAS',

  // Puestos que SOLO ven la vista de Seguimiento OS (separados por ;)
  PUESTOS_OS: 'ANALISTA DE ATENCION A CLIENTES; GERENTE DE OPERACIONES; SUPERVISOR DE PLANTA INTERNA; COORDINADOR PE'
};


// =============================================
//  PUNTO DE ENTRADA — recibe todas las peticiones
// =============================================

function doGet(e)  { return _manejar(e); }
function doPost(e) { return _manejar(e); }

function _manejar(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var res;

  try {
    switch (p.accion) {

      // ---- AUTENTICACIÓN ----
      case 'login':
        res = _login(p.numero || '', p.pin || '');
        break;

      case 'validar':
        res = _validar(p.token || '');
        break;

      // ---- DATOS (Módulo 2 — archivo Datos.gs) ----
      case 'datos':
        res = _datos(p.token || '', p.completo || '');
        break;

      case 'hoja':
        res = _hoja(p.token || '', p.nombre || '');
        break;

      // ---- SUBIR / REEMPLAZAR VENTA TECNICO ----
      case 'subirVentaTecnico':
        res = _subirVentaTecnico(p.token || '', p.libro || '', p.pestana || '', p.colLlave || '', p.colClave || '', p.filas || '');
        break;

      // ---- SUBIR SOLO LO NUEVO A VENTA TECNICO (y quitar lo duplicado viejo) ----
      case 'subirVentaTecnicoNuevo':
        res = _subirVentaTecnicoNuevo(p.token || '', p.libro || '', p.pestana || '', p.colLlave || '', p.colClave || '', p.filas || '');
        break;

      // ---- SUBIR / REEMPLAZAR OS POR INSTALAR ----
      case 'subirOsPorInstalar':
        res = _subirOsPorInstalar(p.token || '', p.pestana || '', p.filaInicio || '', p.filas || '');
        break;

      // ---- SUBIR / REEMPLAZAR ATENCION ORDENES ----
      case 'subirAtencionOrdenes':
        res = _subirAtencionOrdenes(p.token || '', p.pestana || '', p.filaInicio || '', p.filas || '');
        break;

      // ---- SUBIR LO NUEVO A BASE DE DATOS (y quitar lo duplicado viejo) ----
      case 'subirBaseDatos':
        res = _subirBaseDatos(p.token || '', p.colLlave || 'Q', p.filas || '');
        break;

      // ---- ÚLTIMA VEZ QUE SE REEMPLAZÓ CADA HOJA ----
      case 'ultimasCargas':
        res = _ultimasCargas(p.token || '');
        break;

      // ---- ADMINISTRACIÓN DE PINs ----
      case 'cambiarpin':
        res = _cambiarPinAdmin(p.token || '', p.empleado || '', p.nuevo_pin || '');
        break;

      case 'nuevospins':
        res = _nuevoPinesAdmin(p.token || '');
        break;

      // ---- PIN PROPIO (Módulo 3 — archivo Pin.gs) ----
      case 'micambiopin':
        res = _cambiarMiPin(p.token || '', p.pin_actual || '', p.nuevo_pin || '');
        break;

      case 'resetpin':
        res = _resetPin(p.token || '', p.empleado || '');
        break;

      default:
        res = { ok: false, error: 'Acción no reconocida. Acciones válidas: login, validar, datos, hoja, subirVentaTecnico, subirVentaTecnicoNuevo, subirOsPorInstalar, subirAtencionOrdenes, subirBaseDatos, ultimasCargas, cambiarpin, nuevospins, micambiopin, resetpin' };
    }
  } catch (err) {
    res = { ok: false, error: 'Error interno: ' + err.message };
  }

  // Soporte JSONP: si viene ?callback=nombre, envuelve la respuesta
  var json = JSON.stringify(res);

  if (p.callback) {
    return ContentService
      .createTextOutput(p.callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}


// =============================================
//  LOGIN
// =============================================

function _login(numero, pin) {
  if (!numero) return { ok: false, error: 'Captura tu número de empleado.' };
  if (!pin)    return { ok: false, error: 'Captura tu PIN.' };
  if (!CFG.COL_PIN) {
    return { ok: false, error: 'El administrador no ha configurado la columna de PIN en el servidor.' };
  }

  var num       = _limpiarNum(numero);
  var pinLimpio = String(pin).trim();

  var hoja = _obtenerHoja(CFG.GID_PLANTILLA);
  if (!hoja) return { ok: false, error: 'No se encontró la pestaña PLANTILLA.' };

  var datos = hoja.getDataRange().getValues();

  var iNum = _letraAIndice(CFG.COL_NUMERO);
  var iNom = _letraAIndice(CFG.COL_NOMBRE);
  var iPue = _letraAIndice(CFG.COL_PUESTO);
  var iPin = _letraAIndice(CFG.COL_PIN);
  var iTemp = _letraAIndice(PINCFG.COL_TEMPORAL);

  var persona = null;
  for (var i = 1; i < datos.length; i++) {
    if (_limpiarNum(datos[i][iNum]) === num) {
      persona = {
        numero:       num,
        nombre:       String(datos[i][iNom] || '').trim(),
        puesto:       String(datos[i][iPue] || '').trim(),
        pinGuardado:  String(datos[i][iPin] || '').trim(),
        temporal:     _esTemporal(iTemp < datos[i].length ? datos[i][iTemp] : '')
      };
      break;
    }
  }

  if (!persona) {
    return { ok: false, error: 'Ese número no está en la plantilla.' };
  }

  if (!persona.pinGuardado) {
    return { ok: false, error: 'No tienes PIN asignado. Contacta al administrador.' };
  }
  if (persona.pinGuardado !== pinLimpio) {
    return { ok: false, error: 'PIN incorrecto.' };
  }

  var acceso = _determinarAcceso(persona.puesto);
  if (!acceso) {
    return {
      ok: false,
      error: 'Tu puesto (' + (persona.puesto || 'sin puesto') + ') no tiene acceso a este reporte.'
    };
  }

  var alcance = _determinarAlcance(persona.puesto, acceso);

  var token  = Utilities.getUuid();
  var perfil = {
    numero:  persona.numero,
    nombre:  persona.nombre,
    puesto:  persona.puesto,
    acceso:  acceso,
    alcance: alcance
  };

  CacheService.getScriptCache().put(
    'tok_' + token,
    JSON.stringify(perfil),
    21600
  );

  return {
    ok:               true,
    token:            token,
    perfil:           perfil,
    cambio_requerido: persona.temporal,
    mensaje:          'Bienvenido, ' + persona.nombre + ' · ' + persona.puesto
  };
}


// =============================================
//  VALIDAR TOKEN
// =============================================

function _validar(token) {
  if (!token) return { ok: false, error: 'Falta el token.', expirado: true };

  var datos = CacheService.getScriptCache().get('tok_' + token);
  if (!datos) {
    return { ok: false, error: 'Tu sesión expiró. Vuelve a entrar.', expirado: true };
  }

  return { ok: true, perfil: JSON.parse(datos) };
}


// =============================================
//  LÓGICA DE ACCESO / ALCANCE
// =============================================

function _normalizar(s) {
  return String(s || '').trim().toUpperCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function _determinarAcceso(puesto) {
  var p = _normalizar(puesto);

  var total = CFG.PUESTOS_TOTAL.split(';');
  for (var i = 0; i < total.length; i++) {
    var t = _normalizar(total[i]);
    if (!t) continue;
    if (p.indexOf(t) >= 0 || t.indexOf(p) >= 0) return 'total';
  }

  var os = CFG.PUESTOS_OS.split(';');
  for (var j = 0; j < os.length; j++) {
    var o = _normalizar(os[j]);
    if (!o) continue;
    if (p.indexOf(o) >= 0 || o.indexOf(p) >= 0) return 'os';
  }

  return '';
}

function _determinarAlcance(puesto, acceso) {
  if (acceso === 'os') return 'todo';

  var p = _normalizar(puesto);
  if (p.indexOf('DIRECTOR') >= 0)                            return 'todo';
  if (p.indexOf('COACH') >= 0 && p.indexOf('TECNICO') >= 0) return 'tecnico';
  if (p.indexOf('LIDER') >= 0)                               return 'lider';
  return 'todo';
}


// =============================================
//  UTILIDADES
// =============================================

function _limpiarNum(v) {
  if (v === null || v === undefined) return '';
  var s = String(v).trim();
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  return s.toUpperCase();
}

function _letraAIndice(letra) {
  var l = String(letra).toUpperCase().trim();
  var idx = 0;
  for (var i = 0; i < l.length; i++) {
    idx = idx * 26 + (l.charCodeAt(i) - 64);
  }
  return idx - 1;
}

function _obtenerHoja(gid) {
  var libro = SpreadsheetApp.openById(CFG.LIBRO);
  var hojas = libro.getSheets();
  var numGid = Number(gid);
  for (var i = 0; i < hojas.length; i++) {
    if (hojas[i].getSheetId() === numGid) return hojas[i];
  }
  return null;
}


// =============================================
//  SUBIR / REEMPLAZAR VENTA TECNICO
// =============================================

// como _obtenerHoja(gid), pero permite un libro distinto al CFG.LIBRO (venta técnico
// puede vivir en otro archivo, según lo que el usuario tenga configurado en el HTML)
function _obtenerHojaDe(libroId, gid) {
  var libro = SpreadsheetApp.openById(libroId || CFG.LIBRO);
  var hojas = libro.getSheets();
  var numGid = Number(gid);
  for (var i = 0; i < hojas.length; i++) {
    if (hojas[i].getSheetId() === numGid) return hojas[i];
  }
  return null;
}

function _subirVentaTecnico(token, libro, pestana, colLlave, colClave, filasJson) {
  var v = _validar(token);
  if (!v.ok) return v;   // sesión inválida o expirada: mismo mensaje que ya usas

  // solo el número de empleado 65068028, sin importar su puesto — verificación real,
  // no solo la del HTML (que cualquiera podría saltarse desde el navegador)
  if (_limpiarNum(v.perfil.numero) !== '65068028') {
    return { ok: false, error: 'No tienes permiso para reemplazar datos.' };
  }

  if (!pestana) return { ok: false, error: 'Falta la pestaña destino.' };

  var filas;
  try {
    filas = JSON.parse(filasJson || '[]');
  } catch (e) {
    return { ok: false, error: 'Los renglones no llegaron en un formato válido.' };
  }
  if (!filas.length) return { ok: false, error: 'No hay renglones que subir.' };

  var hoja = _obtenerHojaDe(libro, pestana);
  if (!hoja) return { ok: false, error: 'No se encontró la pestaña destino (revisa el gid).' };

  // el archivo se exporta con las mismas columnas que ya tiene la pestaña, así que
  // se sustituye completo (no solo las columnas llave/clave: si se escribieran solo
  // esas dos, el resto de las columnas se quedaría con los datos del día anterior y
  // los renglones quedarían cruzados)
  var iLlave = _letraAIndice(colLlave || 'E');
  var iClave = _letraAIndice(colClave || 'F');

  var anchoNuevo = 0;
  for (var i = 0; i < filas.length; i++) {
    if (filas[i].length > anchoNuevo) anchoNuevo = filas[i].length;
  }
  if (anchoNuevo <= iLlave || anchoNuevo <= iClave) {
    return { ok: false, error: 'El archivo trae ' + anchoNuevo + ' columna(s); no alcanza para las columnas ' + colLlave + ' y ' + colClave + '.' };
  }
  for (var j = 0; j < filas.length; j++) {
    while (filas[j].length < anchoNuevo) filas[j].push('');
  }

  var ancho = Math.max(anchoNuevo, hoja.getLastColumn());

  // borra todo lo que hay hoy debajo del encabezado, en todo el ancho de la hoja
  // (por si el archivo nuevo trae menos columnas que las que ya había)
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila > 1) {
    hoja.getRange(2, 1, ultimaFila - 1, ancho).clearContent();
  }

  hoja.getRange(2, 1, filas.length, anchoNuevo).setValues(filas);

  _registrarCarga('ventaTecnico', v.perfil);
  return { ok: true, filas: filas.length, columnas: anchoNuevo };
}


// =============================================
//  SUBIR SOLO LO NUEVO A VENTA TECNICO
//  (agrega arriba y borra lo duplicado viejo)
// =============================================

// Igual que _subirBaseDatos(), pero sobre la pestaña VENTA TECNICO y con la
// oportunidad (columna E por omisión) como llave: el archivo entra hasta arriba,
// debajo del encabezado, y enseguida se BORRAN los renglones viejos que traigan
// esa misma oportunidad. Lo que no venga en el archivo no se toca, así se puede
// subir un pedazo del reporte en lugar del reporte completo.
function _subirVentaTecnicoNuevo(token, libro, pestana, colLlave, colClave, filasJson) {
  var v = _validar(token);
  if (!v.ok) return v;

  // mismo permiso que el reemplazo completo: solo el número 65068028
  if (_limpiarNum(v.perfil.numero) !== '65068028') {
    return { ok: false, error: 'No tienes permiso para actualizar VENTA TECNICO.' };
  }

  if (!pestana) return { ok: false, error: 'Falta la pestaña destino.' };

  var filas;
  try {
    filas = JSON.parse(filasJson || '[]');
  } catch (e) {
    return { ok: false, error: 'Los renglones no llegaron en un formato válido.' };
  }
  if (!filas.length) return { ok: false, error: 'No hay renglones que subir.' };

  var libroId = libro || CFG.LIBRO;
  var hoja = _obtenerHojaDe(libroId, pestana);
  if (!hoja) return { ok: false, error: 'No se encontró la pestaña destino (revisa el gid).' };

  var iLlave = _letraAIndice(colLlave || 'E');
  var iClave = _letraAIndice(colClave || 'F');
  if (iLlave < 0) return { ok: false, error: 'La columna llave no es válida.' };

  // todos los renglones al mismo ancho
  var ancho = 0;
  for (var i = 0; i < filas.length; i++) {
    if (filas[i].length > ancho) ancho = filas[i].length;
  }
  if (ancho <= iLlave || ancho <= iClave) {
    return { ok: false, error: 'El archivo trae ' + ancho + ' columna(s); no alcanza para las columnas ' + (colLlave || 'E') + ' y ' + (colClave || 'F') + '.' };
  }
  if (ancho > hoja.getMaxColumns()) {
    return { ok: false, error: 'El archivo trae ' + ancho + ' columnas y la hoja solo tiene ' + hoja.getMaxColumns() + '.' };
  }

  // 1) llaves del archivo; si una oportunidad viene repetida dentro del mismo
  //    archivo se queda la primera (la de más arriba) y se ignoran las siguientes
  var vistas = {};
  var nuevas = [];
  var repetidasArchivo = 0;
  for (var f = 0; f < filas.length; f++) {
    var fila = filas[f];
    while (fila.length < ancho) fila.push('');
    var k = _llaveBase(fila[iLlave]);
    if (k) {
      if (vistas[k]) { repetidasArchivo++; continue; }
      vistas[k] = true;
    }
    nuevas.push(fila);
  }

  // 2) qué renglones viejos hay que borrar: los que traen una llave del archivo
  var ultimaFila = hoja.getLastRow();
  var borrar = [];   // números de renglón en la hoja (base 1)
  if (ultimaFila > 1) {
    var llavesHoja = hoja.getRange(2, iLlave + 1, ultimaFila - 1, 1).getValues();
    for (var r = 0; r < llavesHoja.length; r++) {
      var kh = _llaveBase(llavesHoja[r][0]);
      if (kh && vistas[kh]) borrar.push(r + 2);
    }
  }

  var sheetId = hoja.getSheetId();

  // 3) borrar de abajo hacia arriba, agrupando renglones contiguos en un solo
  //    request; así los índices de los de arriba siguen siendo válidos
  if (borrar.length) {
    var bloques = [];
    var fin = borrar[borrar.length - 1];
    var ini = fin;
    for (var b = borrar.length - 2; b >= 0; b--) {
      if (borrar[b] === ini - 1) { ini = borrar[b]; continue; }
      bloques.push([ini, fin]);
      fin = borrar[b];
      ini = fin;
    }
    bloques.push([ini, fin]);   // bloques ya quedan de abajo hacia arriba

    var peticiones = [];
    for (var q = 0; q < bloques.length; q++) {
      peticiones.push({
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: bloques[q][0] - 1,   // base 0
            endIndex: bloques[q][1]          // exclusivo
          }
        }
      });
    }
    for (var t = 0; t < peticiones.length; t += 500) {
      Sheets.Spreadsheets.batchUpdate({ requests: peticiones.slice(t, t + 500) }, libroId);
    }
  }

  // 4) abrir hueco hasta arriba (justo debajo del encabezado) y escribir lo nuevo
  Sheets.Spreadsheets.batchUpdate({
    requests: [{
      insertDimension: {
        range: { sheetId: sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 1 + nuevas.length },
        inheritFromBefore: false
      }
    }]
  }, libroId);

  // USER_ENTERED = se interpreta igual que si lo pegaras a mano (fechas y números
  // quedan como fechas y números, no como texto)
  Sheets.Spreadsheets.Values.update(
    { values: nuevas },
    libroId,
    "'" + hoja.getName().replace(/'/g, "''") + "'!A2",
    { valueInputOption: 'USER_ENTERED' }
  );

  _registrarCarga('ventaTecnico', v.perfil);

  return {
    ok: true,
    agregados: nuevas.length,
    eliminados: borrar.length,
    repetidasArchivo: repetidasArchivo,
    total: Math.max(0, ultimaFila - 1 - borrar.length) + nuevas.length
  };
}


// =============================================
//  SUBIR / REEMPLAZAR OS POR INSTALAR
// =============================================

// solo Gerente de Operaciones, Supervisor de Planta Interna, Coordinador PE y
// Analista de Atención a Clientes — el mismo "acceso: os" que ya calcula
// _determinarAcceso() al hacer login, así que no hay que repetir la lista de puestos
function _subirOsPorInstalar(token, gid, filaInicioStr, filasJson) {
  var v = _validar(token);
  if (!v.ok) return v;

  if (v.perfil.acceso !== 'os') {
    return { ok: false, error: 'No tienes permiso para reemplazar datos.' };
  }

  if (!gid) return { ok: false, error: 'Falta la pestaña destino.' };

  var filaInicio = Number(filaInicioStr) || 0;
  if (!filaInicio || filaInicio < 2) {
    return { ok: false, error: 'No se pudo determinar dónde empiezan los datos (falta el encabezado).' };
  }

  var filas;
  try {
    filas = JSON.parse(filasJson || '[]');
  } catch (e) {
    return { ok: false, error: 'Los renglones no llegaron en un formato válido.' };
  }
  if (!filas.length) return { ok: false, error: 'No hay renglones que subir.' };

  var hoja = _obtenerHojaDe('', gid);
  if (!hoja) return { ok: false, error: 'No se encontró la pestaña destino (revisa el gid).' };

  var anchoNuevo = filas[0].length;
  var anchoHoja = hoja.getLastColumn();
  var ancho = Math.max(anchoNuevo, anchoHoja);

  // borra todo lo que hay hoy debajo del encabezado, en todo el ancho de la hoja
  // (por si el archivo nuevo trae menos columnas que las que ya había)
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila >= filaInicio) {
    hoja.getRange(filaInicio, 1, ultimaFila - filaInicio + 1, ancho).clearContent();
  }

  hoja.getRange(filaInicio, 1, filas.length, anchoNuevo).setValues(filas);

  _registrarCarga('osPorInstalar', v.perfil);
  return { ok: true, filas: filas.length };
}


// =============================================
//  SUBIR / REEMPLAZAR ATENCION ORDENES
// =============================================

// Como _obtenerHojaDe(), pero acepta el gid numérico O el nombre de la pestaña: la app
// manda "ATENCION ORDENES" por omisión, y solo manda gid si alguien lo capturó en
// Ajustes de la fuente.
function _obtenerHojaPorNombreOGid(destino) {
  var d = String(destino || '').trim();
  if (!d) return null;

  var libro = SpreadsheetApp.openById(CFG.LIBRO);

  if (/^\d+$/.test(d)) {
    var hojas = libro.getSheets();
    var numGid = Number(d);
    for (var i = 0; i < hojas.length; i++) {
      if (hojas[i].getSheetId() === numGid) return hojas[i];
    }
    return null;
  }

  // por nombre, sin distinguir acentos ni mayúsculas
  var porNombre = libro.getSheetByName(d);
  if (porNombre) return porNombre;

  var buscado = _normalizar(d);
  var todas = libro.getSheets();
  for (var j = 0; j < todas.length; j++) {
    if (_normalizar(todas[j].getName()) === buscado) return todas[j];
  }
  return null;
}

// Mismos puestos que OS por instalar (acceso "os").
//
// A diferencia de las otras hojas, esta trae del orden de 10,000 renglones por 36
// columnas. Por eso NO se escribe de un solo golpe:
//   · se usa Sheets.Spreadsheets.Values.update con USER_ENTERED, para que las fechas
//     ("04/09/2026 11:29") queden como fechas de verdad y no como texto — si quedaran
//     como texto, la pestaña se ordenaría mal y el reporte leería los días al revés;
//   · se manda en bloques de 2,000 renglones, porque un solo request con 360,000
//     celdas se acerca al límite de tamaño de la API y al de 6 minutos de ejecución.
function _subirAtencionOrdenes(token, destino, filaInicioStr, filasJson) {
  var v = _validar(token);
  if (!v.ok) return v;

  if (v.perfil.acceso !== 'os') {
    return { ok: false, error: 'No tienes permiso para reemplazar datos.' };
  }

  if (!destino) destino = 'ATENCION ORDENES';

  var filaInicio = Number(filaInicioStr) || 0;
  if (!filaInicio || filaInicio < 2) {
    return { ok: false, error: 'No se pudo determinar dónde empiezan los datos (falta el encabezado).' };
  }

  var filas;
  try {
    filas = JSON.parse(filasJson || '[]');
  } catch (e) {
    return { ok: false, error: 'Los renglones no llegaron en un formato válido.' };
  }
  if (!filas.length) return { ok: false, error: 'No hay renglones que subir.' };

  var hoja = _obtenerHojaPorNombreOGid(destino);
  if (!hoja) return { ok: false, error: 'No se encontró la pestaña "' + destino + '" (revisa el nombre o el gid en Ajustes de la fuente).' };

  // todos los renglones al mismo ancho
  var anchoNuevo = 0;
  for (var i = 0; i < filas.length; i++) {
    if (filas[i].length > anchoNuevo) anchoNuevo = filas[i].length;
  }
  if (!anchoNuevo) return { ok: false, error: 'Los renglones llegaron vacíos.' };
  for (var j = 0; j < filas.length; j++) {
    while (filas[j].length < anchoNuevo) filas[j].push('');
  }

  // la hoja tiene que tener lugar para lo nuevo
  var ultimaNecesaria = filaInicio + filas.length - 1;
  if (hoja.getMaxRows() < ultimaNecesaria) {
    hoja.insertRowsAfter(hoja.getMaxRows(), ultimaNecesaria - hoja.getMaxRows());
  }
  if (hoja.getMaxColumns() < anchoNuevo) {
    hoja.insertColumnsAfter(hoja.getMaxColumns(), anchoNuevo - hoja.getMaxColumns());
  }

  // borra lo que hay hoy debajo del encabezado, en todo el ancho de la hoja (por si el
  // archivo nuevo trae menos columnas que las que ya había)
  var ancho = Math.max(anchoNuevo, hoja.getLastColumn());
  var ultimaFila = hoja.getLastRow();
  if (ultimaFila >= filaInicio) {
    hoja.getRange(filaInicio, 1, ultimaFila - filaInicio + 1, ancho).clearContent();
  }
  SpreadsheetApp.flush();

  // el nombre va entre comillas simples en la notación A1; si el nombre trae una
  // comilla simple, se duplica
  var nombreA1 = "'" + hoja.getName().replace(/'/g, "''") + "'";

  var BLOQUE = 2000;
  for (var b = 0; b < filas.length; b += BLOQUE) {
    var trozo = filas.slice(b, b + BLOQUE);
    Sheets.Spreadsheets.Values.update(
      { values: trozo },
      CFG.LIBRO,
      nombreA1 + '!A' + (filaInicio + b),
      { valueInputOption: 'USER_ENTERED' }
    );
  }

  _registrarCarga('atencionOrdenes', v.perfil);
  return { ok: true, filas: filas.length, columnas: anchoNuevo };
}


// =============================================
//  SUBIR LO NUEVO A BASE DE DATOS
//  (agrega arriba y borra lo duplicado viejo)
// =============================================

// A diferencia de las otras dos hojas, aquí NO se reemplaza todo. El archivo del día
// entra hasta arriba (debajo del encabezado) y enseguida se BORRAN los renglones
// viejos que traigan la misma oportunidad. Todo lo demás de la base queda intacto:
// no se reescribe ni un renglón que no venga en el archivo, justamente para no
// arriesgar que una fecha o un número se reinterprete al volverlo a escribir.

// llave para comparar oportunidades: sin espacios, comas ni guiones, y sin el ".0"
// que a veces deja Sheets al leer un número
function _llaveBase(v) {
  return _limpiarNum(v).replace(/[^0-9A-Z]/g, '');
}

function _subirBaseDatos(token, colLlave, filasJson) {
  var v = _validar(token);
  if (!v.ok) return v;

  // Director Distrital o el número 65068028 — verificación real en el servidor,
  // no solo la del HTML (que cualquiera podría saltarse desde el navegador)
  var esDirector = _normalizar(v.perfil.puesto).indexOf('DIRECTOR DISTRITAL') >= 0;
  if (!esDirector && _limpiarNum(v.perfil.numero) !== '65068028') {
    return { ok: false, error: 'No tienes permiso para actualizar BASE DE DATOS.' };
  }

  var filas;
  try {
    filas = JSON.parse(filasJson || '[]');
  } catch (e) {
    return { ok: false, error: 'Los renglones no llegaron en un formato válido.' };
  }
  if (!filas.length) return { ok: false, error: 'No hay renglones que subir.' };

  var iLlave = _letraAIndice(colLlave || 'Q');
  if (iLlave < 0) return { ok: false, error: 'La columna llave no es válida.' };

  var hoja = SpreadsheetApp.openById(CFG.LIBRO).getSheetByName(DATOS.HOJA_BASE);
  if (!hoja) return { ok: false, error: 'No se encontró la pestaña "' + DATOS.HOJA_BASE + '".' };

  // el archivo no puede ser más ancho que la hoja
  var ancho = 0;
  for (var i = 0; i < filas.length; i++) {
    if (filas[i].length > ancho) ancho = filas[i].length;
  }
  if (ancho <= iLlave) {
    return { ok: false, error: 'El archivo solo trae ' + ancho + ' columna(s) y la llave va en la ' + colLlave + '.' };
  }
  if (ancho > hoja.getMaxColumns()) {
    return { ok: false, error: 'El archivo trae ' + ancho + ' columnas y la hoja solo tiene ' + hoja.getMaxColumns() + '.' };
  }

  // 1) llaves del archivo; si viene repetida dentro del mismo archivo se queda la
  //    primera (la de más arriba) y se ignoran las siguientes
  var vistas = {};
  var nuevas = [];
  var repetidasArchivo = 0;
  for (var f = 0; f < filas.length; f++) {
    var fila = filas[f];
    while (fila.length < ancho) fila.push('');
    var k = _llaveBase(fila[iLlave]);
    if (k) {
      if (vistas[k]) { repetidasArchivo++; continue; }
      vistas[k] = true;
    }
    nuevas.push(fila);
  }

  // 2) qué renglones viejos hay que borrar: los que traen una llave del archivo
  var ultimaFila = hoja.getLastRow();
  var borrar = [];   // números de renglón en la hoja (base 1)
  if (ultimaFila > 1) {
    var llavesHoja = hoja.getRange(2, iLlave + 1, ultimaFila - 1, 1).getValues();
    for (var r = 0; r < llavesHoja.length; r++) {
      var kh = _llaveBase(llavesHoja[r][0]);
      if (kh && vistas[kh]) borrar.push(r + 2);
    }
  }

  var sheetId = hoja.getSheetId();

  // 3) borrar de abajo hacia arriba, agrupando renglones contiguos en un solo
  //    request; así los índices de los de arriba siguen siendo válidos
  if (borrar.length) {
    var bloques = [];
    var fin = borrar[borrar.length - 1];
    var ini = fin;
    for (var b = borrar.length - 2; b >= 0; b--) {
      if (borrar[b] === ini - 1) { ini = borrar[b]; continue; }
      bloques.push([ini, fin]);
      fin = borrar[b];
      ini = fin;
    }
    bloques.push([ini, fin]);   // bloques ya quedan de abajo hacia arriba

    var peticiones = [];
    for (var q = 0; q < bloques.length; q++) {
      peticiones.push({
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: 'ROWS',
            startIndex: bloques[q][0] - 1,   // base 0
            endIndex: bloques[q][1]          // exclusivo
          }
        }
      });
    }
    // en tandas, por si un día son muchísimos bloques sueltos
    for (var t = 0; t < peticiones.length; t += 500) {
      Sheets.Spreadsheets.batchUpdate({ requests: peticiones.slice(t, t + 500) }, CFG.LIBRO);
    }
  }

  // 4) abrir hueco hasta arriba (justo debajo del encabezado) y escribir lo nuevo
  Sheets.Spreadsheets.batchUpdate({
    requests: [{
      insertDimension: {
        range: { sheetId: sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 1 + nuevas.length },
        inheritFromBefore: false
      }
    }]
  }, CFG.LIBRO);

  // USER_ENTERED = se interpreta igual que si lo pegaras a mano (fechas y números
  // quedan como fechas y números, no como texto)
  Sheets.Spreadsheets.Values.update(
    { values: nuevas },
    CFG.LIBRO,
    "'" + DATOS.HOJA_BASE + "'!A2",
    { valueInputOption: 'USER_ENTERED' }
  );

  _registrarCarga('baseDatos', v.perfil);

  return {
    ok: true,
    agregados: nuevas.length,
    eliminados: borrar.length,
    repetidasArchivo: repetidasArchivo,
    total: Math.max(0, ultimaFila - 1 - borrar.length) + nuevas.length
  };
}


// =============================================
//  ÚLTIMA VEZ QUE SE REEMPLAZÓ CADA HOJA
// =============================================

// se guarda en PropertiesService (a diferencia del token, esto debe durar para
// siempre, no solo unas horas)
function _registrarCarga(clave, perfil) {
  var props = PropertiesService.getScriptProperties();
  var info = {
    fecha:  new Date().toISOString(),
    numero: perfil.numero,
    nombre: perfil.nombre,
    puesto: perfil.puesto
  };
  props.setProperty('carga_' + clave, JSON.stringify(info));
}

function _ultimasCargas(token) {
  var v = _validar(token);
  if (!v.ok) return v;

  var props = PropertiesService.getScriptProperties();
  function leer(clave) {
    var raw = props.getProperty('carga_' + clave);
    return raw ? JSON.parse(raw) : null;
  }

  return {
    ok: true,
    baseDatos:       leer('baseDatos'),
    ventaTecnico:    leer('ventaTecnico'),
    osPorInstalar:   leer('osPorInstalar'),
    atencionOrdenes: leer('atencionOrdenes')
  };
}


// =============================================
//  NOTA: el generador de PINs se movió a Pin.gs
//  Usa  inicializarPINs()  desde ese archivo.
// =============================================
