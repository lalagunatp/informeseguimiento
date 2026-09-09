/**
 * =============================================
 *  MÓDULO 2 · DATOS + ADMINISTRACIÓN
 *  Reporte de seguimiento · La Laguna
 * =============================================
 *
 *  Este archivo se AGREGA como un segundo archivo .gs
 *  en el mismo proyecto de Apps Script (junto a Código.gs).
 *
 *  INSTALACIÓN:
 *    1. En el editor de Apps Script, haz clic en  +  junto a "Archivos"
 *    2. Selecciona "Script" y nómbralo  Datos
 *    3. Pega todo el contenido de este archivo
 *    4. En Código.gs, agrega los nuevos casos en _manejar (ve las instrucciones al final)
 *    5. IMPORTANTE: habilita Google Sheets API en Servicios (+) si no lo has hecho
 *    6. Implementar → Administrar implementaciones → ✏️ → Nueva versión → Implementar
 *
 *  DEPENDE de Código.gs: usa CFG, _validar, _letraAIndice, _limpiarNum, _normalizar,
 *  _obtenerHoja y _obtenerHojaPorNombreOGid. Los dos archivos viven en el mismo
 *  proyecto, así que se ven entre sí sin importar nada.
 */


// =============================================
//  CONFIGURACIÓN DE DATOS — ajusta si es necesario
// =============================================

var DATOS = {
  // Nombre EXACTO de la pestaña con los 33K+ renglones
  // (como aparece en la cejilla de tu hoja de cálculo)
  HOJA_BASE: 'BASE DE DATOS',

  // Columnas de PLANTILLA/BASE para filtro por alcance
  COL_LIDER:    'AI',   // antes AH
  COL_COACH:    'AJ',   // antes AI
  COL_DIRECTOR: 'AH',   // antes AG
  COL_SUBCANAL: 'I',    // sin cambio (está antes de la L)
  COL_VENDEDOR: 'R',    // antes Q
  COL_NUMVEND:  'V',    // antes U

  // Columnas que la app necesita (las mismas que tu SELECT original)
  COLUMNAS_SELECT: 'A,C,D,E,F,G,H,I,K,L,M,N,O,P,Q,R,S,T,U,W,AA,AB,AC,AD,AE,AF,AG,AH,AI,AJ',

  // Tiempo de caché en segundos (5 min = 300)
  CACHE_SEG: 300,

  // Cuántas celdas se piden por llamada a la API al leer una pestaña.
  // Ve el comentario largo arriba de _leerHojaAPI().
  CELDAS_POR_BLOQUE: 150000,

  // ---- PLANTILLA: para resolver equipos y admin PINs ----
  PLANT_NOMBRE: 'PLANTILLA',
  PLANT_COL_NUMERO: 'D',
  PLANT_COL_NOMBRE: 'E',
  PLANT_COL_PUESTO: 'F',
  PLANT_COL_COACH:  'K',        // nombre del coach / línea directa
  PLANT_COL_RESPONSABLE: 'Z',   // SEGUNDA LR — responsable/líder

  // Puestos que pueden cambiar el PIN de CUALQUIERA
  ADMIN_TODO: 'DIRECTOR DISTRITAL',

  // Puestos que pueden cambiar el PIN de SU equipo
  ADMIN_EQUIPO: 'LIDER VENTAS; LIDER DE VENTAS; GERENTE DE OPERACIONES',
};


// =============================================
//  ACCIÓN: DATOS  —  lectura de la base filtrada
//  Uso: ?accion=datos&token=XXX
// =============================================

function _datos(token, completo) {
  // 1. Validar sesión
  var sesion = _validar(token);
  if (!sesion.ok) return sesion;
  var perfil = sesion.perfil;

  // 2. Leer la hoja con Sheets API v4 (rápido)
  var datos;
  try {
    datos = _leerHojaAPI(DATOS.HOJA_BASE);
  } catch (e) {
    return { ok: false, error: 'No se pudo leer la hoja: ' + e.message };
  }
  if (!datos || datos.length < 2) {
    return { ok: false, error: 'La hoja está vacía o no se encontró.' };
  }

  // 3. Separar encabezados del cuerpo
  var encabezados = datos[0];
  var cuerpo = datos.slice(1);
  var totalOriginal = cuerpo.length;

  // 4. Filtrar por alcance — salvo que pidan la base completa para cruzar
  //    duplicados con otros equipos (Cuentas duplicadas). Nunca se salta el
  //    filtro para alcance 'tecnico': ese perfil solo debe ver su canal técnico,
  //    sin importar lo que mande el cliente.
  var pideCompleto = String(completo) === '1';
  var filtrados = (pideCompleto && perfil.alcance !== 'tecnico')
    ? cuerpo
    : _filtrarBase(cuerpo, perfil, encabezados);

  // 5. Extraer solo las columnas que la app necesita
  var colsSelect = DATOS.COLUMNAS_SELECT.split(',');
  var indices = [];
  for (var i = 0; i < colsSelect.length; i++) {
    indices.push(_letraAIndice(colsSelect[i].trim()));
  }

  var encFinal = [];
  for (var i = 0; i < indices.length; i++) {
    encFinal.push(indices[i] < encabezados.length ? encabezados[indices[i]] : colsSelect[i]);
  }

  var filasFinal = [];
  for (var r = 0; r < filtrados.length; r++) {
    var fila = filtrados[r];
    var nueva = [];
    for (var c = 0; c < indices.length; c++) {
      nueva.push(indices[c] < fila.length ? (fila[indices[c]] != null ? fila[indices[c]] : '') : '');
    }
    filasFinal.push(nueva);
  }

  return {
    ok: true,
    columnas: colsSelect,
    encabezados: encFinal,
    datos: filasFinal,
    total: totalOriginal,
    filtrados: filasFinal.length
  };
}


// =============================================
//  ACCIÓN: HOJA  —  lectura de cualquier pestaña
//  Uso: ?accion=hoja&token=XXX&nombre=RANKING
//  (sin filtro de alcance, para hojas pequeñas)
// =============================================

function _hoja(token, nombre) {
  var sesion = _validar(token);
  if (!sesion.ok) return sesion;

  if (!nombre) return { ok: false, error: 'Falta el nombre de la pestaña.' };

  var datos;
  try {
    datos = _leerHojaAPI(nombre);
  } catch (e) {
    return { ok: false, error: 'No se pudo leer "' + nombre + '": ' + e.message };
  }

  return {
    ok: true,
    encabezados: datos[0] || [],
    datos: datos.slice(1),
    total: Math.max(0, datos.length - 1)
  };
}


// =============================================
//  FILTRADO POR ALCANCE (server-side)
// =============================================

function _filtrarBase(filas, perfil, encabezados) {
  // Si tiene acceso total, devuelve todo
  if (perfil.alcance === 'todo') return filas;

  var iLider    = _letraAIndice(DATOS.COL_LIDER);
  var iCoach    = _letraAIndice(DATOS.COL_COACH);
  var iSubcanal = _letraAIndice(DATOS.COL_SUBCANAL);
  var iVendedor = _letraAIndice(DATOS.COL_VENDEDOR);
  var miNombre  = _normalizar(perfil.nombre);

  if (perfil.alcance === 'tecnico') {
    // Coach de venta técnico: ve todo el canal técnico + su gente directa
    // Primero, encontrar qué coaches son técnicos (de PLANTILLA)
    var coachesTec = _obtenerCoachesTecnicos();

    return filas.filter(function(f) {
      // Si el subcanal es VENTA TECNICO
      if (_normalizar(_celda(f, iSubcanal)).indexOf('TECNICO') >= 0) return true;
      // Si el coach de la fila es un coach técnico
      if (coachesTec.indexOf(_normalizar(_celda(f, iCoach))) >= 0) return true;
      // Si soy yo el coach o líder
      if (_normalizar(_celda(f, iCoach)) === miNombre) return true;
      if (_normalizar(_celda(f, iLider)) === miNombre) return true;
      return false;
    });
  }

  // Líder: ve filas donde es líder, coach, o vendedor (por si es él mismo)
  return filas.filter(function(f) {
    return _normalizar(_celda(f, iLider)) === miNombre ||
           _normalizar(_celda(f, iCoach)) === miNombre ||
           _normalizar(_celda(f, iVendedor)) === miNombre;
  });
}

function _celda(fila, indice) {
  return indice < fila.length ? String(fila[indice] || '') : '';
}

function _obtenerCoachesTecnicos() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('coaches_tec');
  if (cached) return JSON.parse(cached);

  var plantilla = _leerHojaAPI(DATOS.PLANT_NOMBRE);
  var iNom   = _letraAIndice(DATOS.PLANT_COL_NOMBRE);
  var iPue   = _letraAIndice(DATOS.PLANT_COL_PUESTO);
  var iCoach = _letraAIndice(DATOS.PLANT_COL_COACH);

  // Un coach técnico es alguien cuyo puesto contiene "TECNICO" y es jefe de alguien
  var jefes = {};
  for (var i = 1; i < plantilla.length; i++) {
    var coach = _normalizar(_celda(plantilla[i], iCoach));
    if (coach) jefes[coach] = true;
  }

  var coachesTec = [];
  for (var i = 1; i < plantilla.length; i++) {
    var nombre = _normalizar(_celda(plantilla[i], iNom));
    var puesto = _normalizar(_celda(plantilla[i], iPue));
    if (puesto.indexOf('TECNICO') >= 0 && jefes[nombre]) {
      coachesTec.push(nombre);
    }
  }

  cache.put('coaches_tec', JSON.stringify(coachesTec), DATOS.CACHE_SEG);
  return coachesTec;
}


// =============================================
//  LECTURA CON SHEETS API v4  (rápida, en bloques)
// =============================================

// La pestaña se pide POR BLOQUES DE RENGLONES, no de un solo golpe.
//
// Por qué: el servicio avanzado de Sheets contesta bien (código HTTP 200), pero Apps
// Script no logra convertir en objeto una respuesta demasiado grande y lanza una
// excepción genérica con el cuerpo crudo pegado en el mensaje:
//
//   No se pudo leer "ATENCION ORDENES": Código de respuesta: 200. Mensaje:
//   { "range": "'ATENCION ORDENES'!A1:AJ13281", "majorDimension": "ROWS", "values": [...
//
// Eso es lo que le llegaba a la app cuando ATENCION ORDENES pasó de los 13,000
// renglones × 36 columnas. No es permiso, ni sesión, ni el nombre de la pestaña: es el
// tamaño. Pidiendo de a pedazos, cada respuesta cabe holgada y se pegan aquí.
//
// Es el mismo criterio que ya usa _subirAtencionOrdenes() en Código.gs al ESCRIBIR
// (bloques de 2,000 renglones); faltaba la contraparte al LEER.
//
// El bloque se calcula por ancho, para pedir ~150,000 celdas por llamada dé igual si
// la pestaña tiene 10 columnas o 40: así ni las anchas rebasan el límite ni las
// angostas se parten en más llamadas de las necesarias.
//
// Devuelve exactamente lo mismo que antes: arreglo de renglones (cada uno arreglo de
// celdas), incluido el encabezado en la posición 0. Quien la llama no cambia en nada.
function _leerHojaAPI(nombreHoja) {
  // acepta el nombre o el gid, igual que el panel de subida (vive en Código.gs)
  var hoja = _obtenerHojaPorNombreOGid(nombreHoja);
  if (!hoja) throw new Error('no encontré la pestaña "' + nombreHoja + '"');

  var ultimaFila = hoja.getLastRow();
  var ultimaCol  = hoja.getLastColumn();
  if (!ultimaFila || !ultimaCol) return [];

  // comillas simples por si el nombre trae espacios; si trae una comilla, se duplica
  var nombreA1 = "'" + hoja.getName().replace(/'/g, "''") + "'";
  var letraFin = _indiceALetra(ultimaCol);
  var bloque = Math.max(200, Math.floor(DATOS.CELDAS_POR_BLOQUE / ultimaCol));

  var todo = [];
  for (var ini = 1; ini <= ultimaFila; ini += bloque) {
    var fin = Math.min(ini + bloque - 1, ultimaFila);
    var resultado = Sheets.Spreadsheets.Values.get(
      CFG.LIBRO,
      nombreA1 + '!A' + ini + ':' + letraFin + fin
    );
    var vals = resultado.values || [];
    for (var i = 0; i < vals.length; i++) todo.push(vals[i]);

    // La API recorta los renglones vacíos del final de CADA bloque. Se reponen para
    // que el renglón 5,000 de la pestaña siga siendo el 5,000 del arreglo, igual que
    // cuando se leía todo de un jalón.
    for (var h = vals.length; h < (fin - ini + 1); h++) todo.push([]);
  }

  // ese relleno no debe sobrar al final (getLastRow ya apunta al último con contenido,
  // pero si la hoja trae formato sin datos, más vale recortarlo)
  while (todo.length && !todo[todo.length - 1].length) todo.pop();

  return todo;
}

// inversa de _letraAIndice():  1 -> "A",  27 -> "AA",  36 -> "AJ"
function _indiceALetra(n) {
  var s = '';
  while (n > 0) {
    var resto = (n - 1) % 26;
    s = String.fromCharCode(65 + resto) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}


// =============================================
//  ACCIÓN: CAMBIAR PIN  (desde la web, con permisos)
//  Uso: ?accion=cambiarpin&token=XXX&empleado=NUMERO&nuevo_pin=1234
// =============================================

function _cambiarPinAdmin(token, empleado, nuevoPin) {
  // 1. Validar sesión del admin
  var sesion = _validar(token);
  if (!sesion.ok) return sesion;
  var admin = sesion.perfil;

  // 2. Validar datos
  if (!empleado) return { ok: false, error: 'Falta el número de empleado a modificar.' };
  if (!nuevoPin) return { ok: false, error: 'Falta el nuevo PIN.' };
  nuevoPin = String(nuevoPin).trim();
  if (!/^\d{4,6}$/.test(nuevoPin)) {
    return { ok: false, error: 'El PIN debe ser de 4 a 6 dígitos.' };
  }

  // 3. Verificar permisos del admin
  var puestoAdmin = _normalizar(admin.puesto);
  var esAdminTotal = false;
  var esAdminEquipo = false;

  var todoList = DATOS.ADMIN_TODO.split(';');
  for (var i = 0; i < todoList.length; i++) {
    if (puestoAdmin.indexOf(_normalizar(todoList[i])) >= 0) { esAdminTotal = true; break; }
  }

  if (!esAdminTotal) {
    var equipoList = DATOS.ADMIN_EQUIPO.split(';');
    for (var i = 0; i < equipoList.length; i++) {
      if (puestoAdmin.indexOf(_normalizar(equipoList[i])) >= 0) { esAdminEquipo = true; break; }
    }
  }

  if (!esAdminTotal && !esAdminEquipo) {
    return { ok: false, error: 'Tu puesto (' + admin.puesto + ') no tiene permiso para cambiar PINs.' };
  }

  // 4. Buscar al empleado en PLANTILLA
  var hoja = _obtenerHoja(CFG.GID_PLANTILLA);
  if (!hoja) return { ok: false, error: 'No se encontró PLANTILLA.' };

  var datos = hoja.getDataRange().getValues();
  var iNum  = _letraAIndice(CFG.COL_NUMERO);
  var iNom  = _letraAIndice(CFG.COL_NOMBRE);
  var iPin  = _letraAIndice(CFG.COL_PIN);
  var iResp = _letraAIndice(DATOS.PLANT_COL_RESPONSABLE);
  var iCoach = _letraAIndice(DATOS.PLANT_COL_COACH);

  var numBuscado = _limpiarNum(empleado);
  var encontrado = null;
  var filaIdx = -1;

  for (var i = 1; i < datos.length; i++) {
    if (_limpiarNum(datos[i][iNum]) === numBuscado) {
      encontrado = {
        nombre: String(datos[i][iNom] || '').trim(),
        responsable: String(datos[i][iResp] || '').trim(),
        coach: String(datos[i][iCoach] || '').trim()
      };
      filaIdx = i;
      break;
    }
  }

  if (!encontrado) {
    return { ok: false, error: 'No se encontró el empleado ' + numBuscado + ' en PLANTILLA.' };
  }

  // 5. Si es admin de equipo, verificar que el empleado esté en su equipo
  if (esAdminEquipo && !esAdminTotal) {
    var adminNombre = _normalizar(admin.nombre);
    var respEmpleado = _normalizar(encontrado.responsable);
    var coachEmpleado = _normalizar(encontrado.coach);

    if (respEmpleado !== adminNombre && coachEmpleado !== adminNombre) {
      return {
        ok: false,
        error: encontrado.nombre + ' no está en tu equipo. Su responsable es ' +
               encontrado.responsable + ' y su coach es ' + encontrado.coach + '.'
      };
    }
  }

  // 6. Actualizar el PIN
  hoja.getRange(filaIdx + 1, iPin + 1).setValue(nuevoPin);

  return {
    ok: true,
    mensaje: 'PIN actualizado para ' + encontrado.nombre + ' (' + numBuscado + ').'
  };
}


// =============================================
//  ACCIÓN: GENERAR NUEVOS PINs (solo para empleados sin PIN)
//  Uso: ?accion=nuevospins&token=XXX
// =============================================

function _nuevoPinesAdmin(token) {
  var sesion = _validar(token);
  if (!sesion.ok) return sesion;

  // Solo admin total puede generar PINs masivos
  var puestoAdmin = _normalizar(sesion.perfil.puesto);
  var adminList = DATOS.ADMIN_TODO.split(';');
  var esAdmin = false;
  for (var i = 0; i < adminList.length; i++) {
    if (puestoAdmin.indexOf(_normalizar(adminList[i])) >= 0) { esAdmin = true; break; }
  }
  if (!esAdmin) {
    return { ok: false, error: 'Solo el Director Distrital puede generar PINs masivos.' };
  }

  var hoja = _obtenerHoja(CFG.GID_PLANTILLA);
  if (!hoja) return { ok: false, error: 'No se encontró PLANTILLA.' };

  var datos = hoja.getDataRange().getValues();
  var iNum = _letraAIndice(CFG.COL_NUMERO);
  var iPin = _letraAIndice(CFG.COL_PIN);

  var asignados = 0;
  for (var i = 1; i < datos.length; i++) {
    var num = _limpiarNum(datos[i][iNum]);
    if (!num) continue;
    var pinActual = String(datos[i][iPin] || '').trim();
    if (pinActual) continue;

    var nuevoPin = String(1000 + Math.floor(Math.random() * 9000));
    hoja.getRange(i + 1, iPin + 1).setValue(nuevoPin);
    asignados++;
  }

  return {
    ok: true,
    mensaje: 'Se asignaron ' + asignados + ' PINs nuevos (empleados que no tenían).'
  };
}


// =============================================
//  INSTRUCCIONES:  agregar los nuevos casos en Código.gs
// =============================================
//
//  Abre tu archivo Código.gs y busca la función _manejar.
//  Dentro del switch(p.accion), ANTES del "default:", agrega estos casos:
//
//      case 'datos':
//        res = _datos(p.token || '', p.completo || '');
//        break;
//
//      case 'hoja':
//        res = _hoja(p.token || '', p.nombre || '');
//        break;
//
//      case 'cambiarpin':
//        res = _cambiarPinAdmin(p.token || '', p.empleado || '', p.nuevo_pin || '');
//        break;
//
//      case 'nuevospins':
//        res = _nuevoPinesAdmin(p.token || '');
//        break;
//
