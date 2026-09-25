/**
 * =============================================
 *  PLANES SEMANALES (compromisos de la app Día a día)
 *  Reporte de seguimiento · La Laguna
 * =============================================
 *
 * El Reporte comercial compara lo real contra lo que cada coach se comprometió en su
 * Plan semanal. Ese plan no vive en BASE LA LAGUNA sino en el libro de la app Día a
 * día (pestaña PLAN), así que se lee aquí con el mismo token del reporte.
 *
 * Quién ve qué: el Director todo el distrito; un Líder solo su propio plan y el de los
 * coaches que le reportan (PLANTILLA, columna K). Cualquier otro puesto no recibe nada.
 */

var PLANES = {
  // libro de la app Día a día (el mismo SPREADSHEET_ID de su apps-script.gs)
  LIBRO_APP: '1jMrhZMQRqXQRD6VrEUJ0JcWT5dK599BwLYzAOBnmPv4',
  HOJA: 'PLAN',
  // PLANTILLA: nombre (E) y a quién reporta (K)
  COL_NOMBRE_PLANT: 'E',
  COL_JEFE_PLANT: 'K'
};

// desde / hasta: 'aaaa-mm-dd' (lunes de la primera y de la última semana que se quieren)
function _planes(token, desde, hasta) {
  var sesion = _validar(token);
  if (!sesion.ok) return sesion;

  var perfil = sesion.perfil;
  var puesto = _normalizar(perfil.puesto);
  var esDirector = puesto.indexOf('DIRECTOR') >= 0;
  var esLider = puesto.indexOf('LIDER') >= 0;
  if (!esDirector && !esLider) {
    return { ok: false, error: 'El reporte comercial es solo para Director y líderes.' };
  }

  var hoja;
  try {
    hoja = SpreadsheetApp.openById(PLANES.LIBRO_APP).getSheetByName(PLANES.HOJA);
  } catch (e) {
    return { ok: false, error: 'No se pudo abrir el libro de la app Día a día: ' + e.message };
  }
  if (!hoja) return { ok: false, error: 'No encontré la pestaña ' + PLANES.HOJA + ' en el libro de la app.' };

  var datos = hoja.getDataRange().getDisplayValues();
  if (!datos.length) return { ok: true, encabezados: [], datos: [] };
  var enc = datos[0];
  var iIni = enc.indexOf('Semana inicio');
  var iReg = enc.indexOf('Registrado por');
  if (iIni < 0 || iReg < 0) return { ok: false, error: 'La pestaña PLAN no trae las columnas "Semana inicio" y "Registrado por".' };

  var filas = datos.slice(1).filter(function (r) {
    var f = _fechaIso(r[iIni]);
    if (!f) return false;
    if (desde && f < desde) return false;
    if (hasta && f > hasta) return false;
    r[iIni] = f;   // siempre viaja como aaaa-mm-dd
    return true;
  });

  if (!esDirector) {
    var equipo = _equipoDeLider(perfil.nombre);
    filas = filas.filter(function (r) { return equipo[_normalizar(r[iReg])] === true; });
  }

  return { ok: true, encabezados: enc, datos: filas };
}

// 'aaaa-mm-dd' tal cual, o 'd/m/aaaa' convertido; cualquier otra cosa se descarta
function _fechaIso(v) {
  var s = String(v || '').trim();
  var iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return iso[1] + '-' + iso[2] + '-' + iso[3];
  var dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (dmy) return dmy[3] + '-' + ('0' + dmy[2]).slice(-2) + '-' + ('0' + dmy[1]).slice(-2);
  return '';
}

// el líder y los coaches que le reportan, como {NOMBRE NORMALIZADO: true}
function _equipoDeLider(nombreLider) {
  var yo = _normalizar(nombreLider);
  var equipo = {};
  equipo[yo] = true;
  var hoja = _obtenerHoja(CFG.GID_PLANTILLA);
  if (!hoja) return equipo;
  var filas = hoja.getDataRange().getDisplayValues();
  var iNom = _letraAIndice(PLANES.COL_NOMBRE_PLANT);
  var iJefe = _letraAIndice(PLANES.COL_JEFE_PLANT);
  filas.forEach(function (r) {
    if (_normalizar(r[iJefe]) === yo && r[iNom]) equipo[_normalizar(r[iNom])] = true;
  });
  return equipo;
}
