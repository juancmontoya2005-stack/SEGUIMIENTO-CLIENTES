(function(){
  var SCRIPT_SOURCE = document.currentScript.textContent;
  var APP_TITLE = "Seguimiento EMCALI";


  function escapeHtml(s){
    return String(s===null||s===undefined?'':s).replace(/[&<>"']/g, function(ch){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
    });
  }
  function uid(){
    if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }
  function todayISO(){
    var d = new Date();
    var off = d.getTimezoneOffset();
    var local = new Date(d.getTime() - off*60000);
    return local.toISOString().slice(0,10);
  }
  function formatDateHuman(iso){
    if(!iso) return '';
    var parts = iso.split('-');
    if(parts.length!==3) return iso;
    var meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    var m = parseInt(parts[1],10)-1;
    return parts[2] + ' ' + (meses[m]||parts[1]) + ' ' + parts[0];
  }
  function addDaysISO(iso, days){
    if(!iso) return '';
    var d = new Date(iso+'T00:00:00');
    if(isNaN(d.getTime())) return '';
    d.setDate(d.getDate()+days);
    var y=d.getFullYear(), m=d.getMonth()+1, day=d.getDate();
    return y+'-'+(m<10?'0':'')+m+'-'+(day<10?'0':'')+day;
  }

  var MESES_OPTIONS = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
  function mesIndex(mes){
    return MESES_OPTIONS.indexOf(String(mes||'').toUpperCase().trim());
  }

  var STATUS_META = {
    critica:      { label:'Irregularidad detectada', chipClass:'chip-critica',      varName:'critical' },
    reprogramar:  { label:'Para reprogramar',         chipClass:'chip-reprogramar',  varName:'warning-fill' },
    seguimiento:  { label:'En seguimiento',           chipClass:'chip-seguimiento',  varName:'serious' },
    cerrado:      { label:'Cerrado / realizada',      chipClass:'chip-cerrado',      varName:'good' }
  };
  var STATUS_ORDER = ['critica','reprogramar','seguimiento','cerrado'];

  function computeStatus(c){
    var obs = String(c.observacion||'').toUpperCase();
    var seg = String(c.seguimiento||'').toUpperCase();
    var irregular = /ACOMETIDA DERIVADA|L[IÍ]NEA DIRECTA|DERIVAD|ANOMAL|FRAUDE|CLANDESTIN|PUENTE|IRREGULARIDAD|NO AUTORIZAD|ALTERAD|MANIPULAD/.test(obs);
    if(irregular) return 'critica';
    var pendiente = /REPROGRAMA|NO SE REALIZ|NO REALIZAD/.test(obs) || /PENDIENTE|REPROGRAMA/.test(seg);
    if(pendiente) return 'reprogramar';
    if(seg.trim()!=='' && seg.trim()!=='REALIZADA') return 'seguimiento';
    return 'cerrado';
  }

  var BALANCE_STATUS_META = {
    conforme:     { label:'Conforme (<10%)',     chipClass:'chip-si',        varName:'good' },
    no_conforme:  { label:'No conforme (>=10%)', chipClass:'chip-critica',   varName:'critical' },
    sin_dato:     { label:'Sin dato de % perdidas', chipClass:'chip-no',     varName:'muted' }
  };

  function toNumberOrNull(v){
    if(v===null || v===undefined || v==='') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }
  function formatPct(v){
    var n = toNumberOrNull(v);
    if(n===null) return 'INDETERMINADO';
    return (n*100).toFixed(1).replace(/\.0$/,'') + '%';
  }
  function formatKwh(v){
    var n = toNumberOrNull(v);
    if(n===null) return 'INDETERMINADO';
    return Math.round(n).toLocaleString('es-CO') + ' kWh';
  }
  function pctToInputValue(val){
    var n = toNumberOrNull(val);
    return n===null ? '' : (n*100);
  }
  function computeBalanceStatusValue(n){
    if(n===null) return 'sin_dato';
    return n < 0.10 ? 'conforme' : 'no_conforme';
  }
  function computeBalanceStatus(b){
    return computeBalanceStatusValue(toNumberOrNull(b.pct_perdidas_emcali));
  }
  function computeBalanceStatusDisico(b){
    return computeBalanceStatusValue(toNumberOrNull(b.pct_perdidas_disico));
  }
  function latestBalanceForTrafo(state, trafo){
    var list = state.balances.filter(function(b){ return b.trafo===trafo; });
    if(list.length===0) return null;
    list.sort(function(a,b){ return String(b.fecha_balance||'').localeCompare(String(a.fecha_balance||'')); });
    return list[0];
  }
  function balanceSortKey(b){
    if(b.fecha_balance) return b.fecha_balance;
    var mi = mesIndex(b.mes_vigencia);
    var anio = parseInt(b.anio_vigencia,10);
    if(mi>=0 && isFinite(anio)) return anio + '-' + (mi<9?'0':'') + (mi+1) + '-15';
    return '';
  }
  function balancesForTrafoSorted(state, trafo){
    var list = state.balances.filter(function(b){ return b.trafo===trafo; });
    list.sort(function(a,b){ return balanceSortKey(a).localeCompare(balanceSortKey(b)); });
    return list;
  }
  function computeBalanceEvolution(state, trafo){
    var list = balancesForTrafoSorted(state, trafo);
    var out = [];
    for(var i=0;i<list.length;i++){
      var cur = toNumberOrNull(list[i].pct_perdidas_emcali);
      var prev = i>0 ? toNumberOrNull(list[i-1].pct_perdidas_emcali) : null;
      var cambio = (cur!==null && prev!==null) ? (cur-prev) : null;
      var variacionPct = (cambio!==null && prev) ? (cambio/Math.abs(prev)) : null;
      var estado = null;
      if(cambio!==null){
        if(cambio < -0.0005) estado = 'MEJORO';
        else if(cambio > 0.0005) estado = 'EMPEORO';
        else estado = 'SE_MANTUVO';
      }
      out.push({ balance:list[i], cambio:cambio, variacionPct:variacionPct, estado:estado });
    }
    return out;
  }

  var PERIODICIDAD_DIAS = { SEMANAL:7, QUINCENAL:15, MENSUAL:30, BIMESTRAL:60, TRIMESTRAL:90 };
  function computeProximoSeguimiento(c){
    if(!c || !c.ultimo_seguimiento) return '';
    var dias = PERIODICIDAD_DIAS[c.periodicidad];
    if(c.periodicidad==='PERSONALIZADA') dias = toNumberOrNull(c.periodicidad_dias_custom);
    if(!dias || dias<=0) return '';
    return addDaysISO(c.ultimo_seguimiento, dias);
  }

  var SEGUIMIENTO_ALERT_META = {
    vencido:       { label:'Vencido',        chipClass:'chip-vencido',       emoji:'🔴' },
    hoy:           { label:'Hoy',            chipClass:'chip-hoy',           emoji:'🟠' },
    atencion:      { label:'Atencion',       chipClass:'chip-atencion',      emoji:'🟡' },
    proximo:       { label:'Proximo',        chipClass:'chip-proximo',       emoji:'🟡' },
    programado:    { label:'Programado',     chipClass:'chip-programado',    emoji:'🟢' },
    sin_programar: { label:'Sin programar',  chipClass:'chip-sin-programar', emoji:'⚠️' }
  };
  function diffDaysFromToday(iso){
    if(!iso) return null;
    var today = new Date(todayISO()+'T00:00:00');
    var d = new Date(iso+'T00:00:00');
    if(isNaN(d.getTime())) return null;
    return Math.round((d.getTime()-today.getTime())/86400000);
  }
  function computeSeguimientoAlert(c){
    if(!c.proximo_seguimiento) return 'sin_programar';
    var diff = diffDaysFromToday(c.proximo_seguimiento);
    if(diff===null) return 'sin_programar';
    if(diff<0) return 'vencido';
    if(diff===0) return 'hoy';
    if(diff<=3) return 'atencion';
    if(diff<=7) return 'proximo';
    return 'programado';
  }

  function backfillInicialPct(state){
    state.trafos.forEach(function(t){
      if(t.pct_perdidas_inicial===undefined || t.pct_perdidas_inicial===null || t.pct_perdidas_inicial===''){
        var sorted = balancesForTrafoSorted(state, t.trafo);
        if(sorted.length){
          var firstPct = toNumberOrNull(sorted[0].pct_perdidas_emcali);
          if(firstPct!==null) t.pct_perdidas_inicial = firstPct;
        }
      }
    });
  }

  function isTrafoNormalizado(state, trafoCode){
    var t = state.trafos.find(function(x){ return x.trafo===trafoCode; });
    return !!(t && t.normalizado==='SI');
  }

  function computeVariacionNormalizados(state){
    return state.trafos.filter(function(t){ return t.normalizado==='SI'; }).map(function(t){
      var bal = latestBalanceForTrafo(state, t.trafo);
      var inicial = toNumberOrNull(t.pct_perdidas_inicial);
      var trasAmarre = bal ? toNumberOrNull(bal.pct_perdidas_disico) : null;
      var actual = bal ? toNumberOrNull(bal.pct_perdidas_actual) : null;
      if(actual===null && bal) actual = toNumberOrNull(bal.pct_perdidas_emcali);
      var variacionVsInicial = (actual!==null && inicial!==null) ? (actual-inicial) : null;
      var variacionVsAmarre = (actual!==null && trasAmarre!==null) ? (actual-trasAmarre) : null;
      var estado = null;
      if(variacionVsInicial!==null){
        if(variacionVsInicial < -0.0005) estado='MEJORO';
        else if(variacionVsInicial > 0.0005) estado='EMPEORO';
        else estado='SE_MANTUVO';
      }
      return {
        trafo: t.trafo, fecha_normalizacion: t.fecha_normalizacion, balance: bal,
        inicial: inicial, trasAmarre: trasAmarre, actual: actual,
        variacionVsInicial: variacionVsInicial, variacionVsAmarre: variacionVsAmarre, estado: estado
      };
    }).sort(function(a,b){ return String(a.trafo).localeCompare(String(b.trafo)); });
  }

  function buildVariacionNormalizadosList(state){
    var items = computeVariacionNormalizados(state);
    if(items.length===0) return '<p class="empty-hint">Aun no hay transformadores marcados como normalizados.</p>';
    var rows = items.map(function(it){
      var estadoChip = 'chip-no'; var estadoTxt = 'sin dato';
      if(it.estado==='MEJORO'){ estadoChip='chip-si'; estadoTxt='MEJORO'; }
      else if(it.estado==='EMPEORO'){ estadoChip='chip-critica'; estadoTxt='EMPEORO'; }
      else if(it.estado==='SE_MANTUVO'){ estadoChip='chip-no'; estadoTxt='SE MANTUVO'; }
      var varTxt = it.variacionVsInicial===null ? '-' : ((it.variacionVsInicial>0?'+':'')+(it.variacionVsInicial*100).toFixed(1)+' pts');
      return '<tr>'
        + '<td class="mono">'+escapeHtml(it.trafo)+'</td>'
        + '<td class="mono">'+(it.fecha_normalizacion?formatDateHuman(it.fecha_normalizacion):'-')+'</td>'
        + '<td class="mono">'+formatPct(it.inicial)+'</td>'
        + '<td class="mono">'+formatPct(it.trasAmarre)+'</td>'
        + '<td class="mono">'+formatPct(it.actual)+'</td>'
        + '<td class="mono">'+varTxt+'</td>'
        + '<td><span class="chip '+estadoChip+'">'+estadoTxt+'</span></td>'
        + '</tr>';
    }).join('');
    return '<div class="table-wrap"><table><thead><tr>'
      + '<th>Trafo</th><th>Fecha normalizacion</th><th>% inicial (EMCALI)</th><th>% tras amarre (Disico)</th><th>% actual (ultimo balance)</th><th>Variacion vs inicial</th><th>Estado</th>'
      + '</tr></thead><tbody>'+rows+'</tbody></table></div>';
  }

  var SICONER_DEFAULT_GESTOR = 'JUAN CAMILO ESPINOSA MONTOYA';

  // ===================== MODULO: VER BALANCES SICONER =====================
  var SICONER_BASE_COLUMNS = ['Orden','Nodo','Trafo','Trafo Paralelo','Potencia','Subplan','Nodo Programado','Trafo Programado','Gestor','Fecha Balance','Fecha Amarre','Subestación','Circuito','Producto Principal','Contrato Principal','Medidor Principal','Multiplo Principal','Producto Paralelo','Contrato Paralelo','Medidor Paralelo','Multiplo Paralelo','Cantidad Usuarios','Cantidad Fronteras','Cantidad Clandestinos','Cantidad Clausurados','Total Amarre','Clientes Base Inicial','Porcentaje Cambio'];
  var SICONER_SEARCH_FIELDS = ['Orden','Nodo','Trafo','Trafo Programado','Gestor','Subestación','Circuito','Producto Principal','Contrato Principal','Medidor Principal'];
  var SICONER_DETAIL_GROUPS = [
    { title:'Datos del balance', fields:['Orden','Nodo','Trafo','Trafo Paralelo','Potencia','Subplan','Nodo Programado','Trafo Programado','Gestor','Fecha Balance','Fecha Amarre'] },
    { title:'Datos electricos', fields:['Subestación','Circuito','Producto Principal','Contrato Principal','Medidor Principal','Multiplo Principal','Producto Paralelo','Contrato Paralelo','Medidor Paralelo','Multiplo Paralelo'] },
    { title:'Datos de usuarios', fields:['Cantidad Usuarios','Cantidad Fronteras','Cantidad Clandestinos','Cantidad Clausurados','Total Amarre','Clientes Base Inicial','Porcentaje Cambio'] }
  ];
  var SICONER_HIST_METRICS = ['Macro Principal','Macro Paralelo','Total Clientes','Total Fronteras','Total Cargas Adicionales','Total Clandestinos'];
  var SICONER_PERDIDAS_METRICS = ['Perdidas','Porcentaje Perdidas','Rango'];
  var SICONER_ESTADO_METRICS = ['Estado','Estado Balance','Observación'];

  function normalizeGestorName(v){
    return String(v===null||v===undefined?'':v).replace(/\s+/g,' ').trim().toUpperCase();
  }

  function parseSiconerWorkbook(headers, rows){
    var baseIndex = {};
    var metricIndex = {};
    var periodsSet = {};
    (headers||[]).forEach(function(h, i){
      var raw = String(h===null||h===undefined?'':h).trim();
      if(!raw) return;
      var m = raw.match(/^(.*?)\s+(20\d{2}-\d{2})$/);
      if(m){
        var baseName = m[1].trim();
        var period = m[2];
        var key = normHeader(baseName);
        if(!metricIndex[key]) metricIndex[key] = {};
        if(metricIndex[key][period]===undefined) metricIndex[key][period] = i;
        periodsSet[period] = true;
      } else {
        var key2 = normHeader(raw);
        if(baseIndex[key2]===undefined) baseIndex[key2] = i;
      }
    });
    var periods = Object.keys(periodsSet).sort();
    return { baseIndex:baseIndex, metricIndex:metricIndex, periods:periods };
  }
  function siconerBaseIdx(meta, name){ var i = meta.baseIndex[normHeader(name)]; return i===undefined?-1:i; }
  function siconerBaseVal(meta, row, name){
    var i = siconerBaseIdx(meta, name);
    if(i===-1 || !row) return '';
    var v = row[i];
    return (v===null||v===undefined) ? '' : v;
  }
  function siconerMetricVal(meta, row, name, period){
    if(!period) return '';
    var m = meta.metricIndex[normHeader(name)];
    if(!m || m[period]===undefined || !row) return '';
    var v = row[m[period]];
    return (v===null||v===undefined) ? '' : v;
  }
  function siconerCellDisplay(v){
    if(v===null||v===undefined||v==='') return '-';
    if(v instanceof Date) return isNaN(v.getTime()) ? '-' : v.toISOString().slice(0,10);
    return String(v);
  }
  function siconerParseNumberLike(v){
    if(v===null||v===undefined||v==='') return NaN;
    if(typeof v==='number') return v;
    var s = String(v).trim();
    if(s==='') return NaN;
    s = s.replace('%','').trim();
    if(s.indexOf(',')!==-1 && s.indexOf('.')!==-1){ s = s.replace(/\./g,'').replace(',', '.'); }
    else if(s.indexOf(',')!==-1){ s = s.replace(',', '.'); }
    var n = Number(s);
    return isFinite(n) ? n : NaN;
  }
  function siconerGestorOptions(state, meta){
    var set = {};
    state.siconer.rows.forEach(function(row){
      var g = normalizeGestorName(siconerBaseVal(meta, row, 'Gestor'));
      if(g) set[g] = true;
    });
    return Object.keys(set).sort();
  }
  function filterSiconerRows(state, ui){
    if(!state.siconer) return { meta:null, list:[] };
    var meta = parseSiconerWorkbook(state.siconer.headers, state.siconer.rows);
    var f = ui.siconerFilters || {};
    var q = String(f.search||'').trim().toUpperCase();
    var list = [];
    state.siconer.rows.forEach(function(row, idx){
      if(f.gestor && f.gestor!=='__TODOS__'){
        if(normalizeGestorName(siconerBaseVal(meta, row, 'Gestor')) !== f.gestor) return;
      }
      if(f.trafo && String(siconerBaseVal(meta,row,'Trafo')||'').toUpperCase().indexOf(f.trafo.toUpperCase())===-1) return;
      if(f.nodo && String(siconerBaseVal(meta,row,'Nodo')||'').toUpperCase().indexOf(f.nodo.toUpperCase())===-1) return;
      if(f.subestacion && String(siconerBaseVal(meta,row,'Subestación')||'').toUpperCase().indexOf(f.subestacion.toUpperCase())===-1) return;
      if(f.circuito && String(siconerBaseVal(meta,row,'Circuito')||'').toUpperCase().indexOf(f.circuito.toUpperCase())===-1) return;
      if(f.subplan && String(siconerBaseVal(meta,row,'Subplan')||'').toUpperCase().indexOf(f.subplan.toUpperCase())===-1) return;
      if(q){
        var hay = SICONER_SEARCH_FIELDS.some(function(fn){
          return String(siconerBaseVal(meta, row, fn)||'').toUpperCase().indexOf(q)!==-1;
        });
        if(!hay) return;
      }
      list.push({ idx:idx, row:row });
    });
    var sort = ui.siconerSort || { col:'Orden', dir:'asc' };
    list.sort(function(a,b){
      var va = siconerBaseVal(meta, a.row, sort.col);
      var vb = siconerBaseVal(meta, b.row, sort.col);
      var na = siconerParseNumberLike(va), nb = siconerParseNumberLike(vb);
      var cmp;
      if(!isNaN(na) && !isNaN(nb)) cmp = na - nb;
      else cmp = String(va).localeCompare(String(vb), 'es', { numeric:true, sensitivity:'base' });
      return sort.dir==='desc' ? -cmp : cmp;
    });
    return { meta:meta, list:list };
  }

  async function handleSiconerImportFile(fileList){
    var files = Array.prototype.slice.call(fileList||[]);
    if(files.length===0) return;
    var file = files[0];
    if(typeof XLSX === 'undefined'){
      UI.siconerImportError = 'La libreria de lectura de Excel aun esta cargando, intenta de nuevo en un momento.';
      render();
      return;
    }
    UI.siconerImportError = null;
    UI.notice = 'Leyendo ' + file.name + '...';
    render();
    try {
      var buf = await file.arrayBuffer();
      var wb = XLSX.read(buf, { type:'array', cellDates:true });
      if(!wb.SheetNames.length) throw new Error('sin hojas');
      var sheetName = wb.SheetNames.indexOf('Worksheet')!==-1 ? 'Worksheet' : wb.SheetNames[0];
      var ws = wb.Sheets[sheetName];
      var aoa = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:'' });
      if(!aoa || aoa.length<1 || !aoa[0] || aoa[0].length===0){
        UI.notice=null; UI.siconerImportError='El archivo no contiene datos.'; render(); return;
      }
      var rawHeaders = aoa[0].map(function(h){ return String(h===null||h===undefined?'':h).trim(); });
      var idx = buildHeaderIndex(rawHeaders);
      var iGestor = idx['GESTOR'];
      if(iGestor===undefined){
        UI.notice = null;
        UI.siconerImportError = 'El archivo no contiene la columna Gestor y no puede ser procesado.';
        render();
        return;
      }
      var dataRows = [];
      for(var r=1;r<aoa.length;r++){
        var row = aoa[r];
        if(!row || row.every(function(c){ return c===''||c===null||c===undefined; })) continue;
        var norm = [];
        for(var c=0;c<rawHeaders.length;c++){ norm.push(row[c]===undefined?'':row[c]); }
        dataRows.push(norm);
      }
      if(dataRows.length===0){
        UI.notice=null; UI.siconerImportError='El archivo no contiene datos.'; render(); return;
      }
      var countDefault = 0;
      dataRows.forEach(function(row){ if(normalizeGestorName(row[iGestor])===SICONER_DEFAULT_GESTOR) countDefault++; });
      UI.notice = null;
      UI.siconerImport = { fileName:file.name, headers:rawHeaders, rows:dataRows, totalRows:dataRows.length, totalCols:rawHeaders.length, countDefaultGestor:countDefault };
      render();
    } catch(err){
      UI.notice = null;
      UI.siconerImportError = 'El archivo no pudo ser leido.';
      render();
    }
  }

  function confirmSiconerImport(){
    if(!UI.siconerImport) return;
    var imp = UI.siconerImport;
    STATE.siconer = { fileName:imp.fileName, loadedAt:new Date().toISOString(), headers:imp.headers, rows:imp.rows };
    var meta = parseSiconerWorkbook(STATE.siconer.headers, STATE.siconer.rows);
    UI.siconerFilters = { gestor:SICONER_DEFAULT_GESTOR, periodo: meta.periods.length ? meta.periods[meta.periods.length-1] : '', trafo:'', nodo:'', subestacion:'', circuito:'', subplan:'', search:'' };
    UI.siconerPage = 1;
    UI.siconerSort = { col:'Orden', dir:'asc' };
    UI.siconerImport = null;
    UI.dirty = true;
    UI.notice = 'Balances Siconer cargados: '+imp.totalRows+' registro(s) en total, '+imp.countDefaultGestor+' de '+SICONER_DEFAULT_GESTOR+'.';
    render();
  }

  function toggleSiconerSort(col){
    if(!col) return;
    if(UI.siconerSort && UI.siconerSort.col===col){ UI.siconerSort.dir = UI.siconerSort.dir==='asc' ? 'desc' : 'asc'; }
    else { UI.siconerSort = { col:col, dir:'asc' }; }
    render();
  }

  function resetSiconerFilters(){
    UI.siconerFilters = { gestor:SICONER_DEFAULT_GESTOR, periodo: UI.siconerFilters.periodo, trafo:'', nodo:'', subestacion:'', circuito:'', subplan:'', search:'' };
    UI.siconerPage = 1;
    render();
  }

  function downloadBlobAsFile(blob, filename){
    try {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
      return true;
    } catch(e){
      return false;
    }
  }

  function exportSiconerBalances(state, ui){
    if(!state.siconer){ UI.notice='No hay balances Siconer cargados para exportar.'; render(); return; }
    if(typeof XLSX === 'undefined'){ UI.notice='La libreria de exportacion aun esta cargando, intenta de nuevo en un momento.'; render(); return; }
    var res = filterSiconerRows(state, ui);
    var aoa = [state.siconer.headers].concat(res.list.map(function(item){ return item.row; }));
    var wb = XLSX.utils.book_new();
    var ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(wb, ws, 'BALANCES SICONER');
    var wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    var blob = new Blob([wbout], { type:'application/octet-stream' });
    if(window.claude && typeof window.claude.use === 'function'){
      window.claude.use('downloads').then(function(dl){
        if(!dl){ UI.notice = 'La exportacion de archivos no esta disponible en esta vista.'; render(); return; }
        dl.save({ filename:'mis_balances_siconer_'+todayISO()+'.xlsx', data: blob }).catch(function(err){
          if(err && err.code==='declined') return;
          UI.notice = 'No se pudo exportar el archivo.';
          render();
        });
      });
    } else {
      var okSic = downloadBlobAsFile(blob, 'mis_balances_siconer_'+todayISO()+'.xlsx');
      UI.notice = okSic ? null : 'No se pudo exportar el archivo en este navegador.';
      render();
    }
  }

  function buildSiconerUploadArea(state, ui, errorMsg){
    return '<div class="card">'
      + '<div class="siconer-upload-empty">'
      + '<p>'+(errorMsg? escapeHtml(errorMsg) : 'Para consultar tus balances, carga el archivo actualizado de SICONER.')+'</p>'
      + '<button class="btn btn-primary" data-action="siconer-trigger-import" type="button">Cargar archivo de balances</button>'
      + '<input type="file" id="siconer-import-input" accept=".xlsx,.xls,.csv" style="display:none">'
      + '</div></div>';
  }

  function buildSiconerValidationPanel(imp){
    var warn = imp.countDefaultGestor===0
      ? '<div class="readonly-banner">No se encontraron registros para '+escapeHtml(SICONER_DEFAULT_GESTOR)+' en este archivo. Puedes cargarlo igual y revisar con el filtro "Mostrar todos".</div>'
      : '';
    return '<div class="card">'
      + '<h2>Validacion del archivo</h2>'
      + warn
      + '<div class="detail-kv" style="margin:14px 0 18px;">'
      + '<div><div class="k">Archivo</div><div class="v">'+escapeHtml(imp.fileName)+'</div></div>'
      + '<div><div class="k">Filas detectadas</div><div class="v">'+imp.totalRows+'</div></div>'
      + '<div><div class="k">Columnas detectadas</div><div class="v">'+imp.totalCols+'</div></div>'
      + '<div><div class="k">Columna Gestor</div><div class="v">ENCONTRADA</div></div>'
      + '<div><div class="k">Gestor seleccionado</div><div class="v">'+escapeHtml(SICONER_DEFAULT_GESTOR)+'</div></div>'
      + '<div><div class="k">Registros del gestor</div><div class="v">'+imp.countDefaultGestor+'</div></div>'
      + '</div>'
      + '<div class="modal-actions" style="justify-content:flex-start;">'
      + '<button class="btn btn-primary" data-action="siconer-confirm-import" type="button">Confirmar y cargar</button>'
      + '<button class="btn-ghost" data-action="siconer-cancel-import" type="button">Cancelar</button>'
      + '</div></div>';
  }

  function buildSiconerInfoCard(state, ui, filteredCount){
    var s = state.siconer;
    var loadedTxt = s.loadedAt ? new Date(s.loadedAt).toLocaleString('es-CO') : '-';
    var gestorTxt = ui.siconerFilters.gestor==='__TODOS__' ? 'Todos' : ui.siconerFilters.gestor;
    return '<div class="card" style="margin-bottom:16px;">'
      + '<h2>Balances Siconer</h2>'
      + '<div class="info-strip">'
      + '<div><div class="k">Archivo cargado</div><div class="v">'+escapeHtml(s.fileName)+'</div></div>'
      + '<div><div class="k">Fecha de carga</div><div class="v">'+escapeHtml(loadedTxt)+'</div></div>'
      + '<div><div class="k">Gestor</div><div class="v">'+escapeHtml(gestorTxt)+'</div></div>'
      + '<div><div class="k">Registros encontrados</div><div class="v">'+filteredCount+'</div></div>'
      + '</div>'
      + '<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button class="btn" data-action="siconer-trigger-import" type="button">Cargar / actualizar archivo</button>'
      + '<input type="file" id="siconer-import-input" accept=".xlsx,.xls,.csv" style="display:none">'
      + (READONLY? '' : '<button class="btn" data-action="siconer-export" type="button">Exportar mis balances</button>')
      + '</div></div>';
  }

  function buildSiconerFiltersCard(state, ui, meta, gestorNames){
    var f = ui.siconerFilters;
    var gestorOpts = '<option value="__TODOS__"'+(f.gestor==='__TODOS__'?' selected':'')+'>Mostrar todos</option>'
      + gestorNames.map(function(g){ return '<option value="'+escapeHtml(g)+'"'+(f.gestor===g?' selected':'')+'>'+escapeHtml(g)+'</option>'; }).join('');
    var periodoOpts = '<option value=""'+(f.periodo===''?' selected':'')+'>(ninguno)</option>'
      + meta.periods.slice().reverse().map(function(p){ return '<option value="'+p+'"'+(f.periodo===p?' selected':'')+'>'+p+'</option>'; }).join('');
    return '<div class="card" style="margin-bottom:16px;">'
      + '<div class="field-grid">'
      + '<div class="field"><label for="siconer-gestor-select">Gestor</label><select id="siconer-gestor-select">'+gestorOpts+'</select></div>'
      + '<div class="field"><label for="siconer-periodo-select">Periodo (columnas del mes en la tabla)</label><select id="siconer-periodo-select">'+periodoOpts+'</select></div>'
      + '<div class="field"><label for="siconer-filter-trafo">Trafo</label><input id="siconer-filter-trafo" type="text" value="'+escapeHtml(f.trafo)+'" placeholder="Ej: E21474"></div>'
      + '<div class="field"><label for="siconer-filter-nodo">Nodo</label><input id="siconer-filter-nodo" type="text" value="'+escapeHtml(f.nodo)+'" placeholder="Nodo"></div>'
      + '<div class="field"><label for="siconer-filter-subestacion">Subestacion</label><input id="siconer-filter-subestacion" type="text" value="'+escapeHtml(f.subestacion)+'" placeholder="Subestacion"></div>'
      + '<div class="field"><label for="siconer-filter-circuito">Circuito</label><input id="siconer-filter-circuito" type="text" value="'+escapeHtml(f.circuito)+'" placeholder="Circuito"></div>'
      + '<div class="field"><label for="siconer-filter-subplan">Subplan</label><input id="siconer-filter-subplan" type="text" value="'+escapeHtml(f.subplan)+'" placeholder="Subplan"></div>'
      + '</div>'
      + '<div style="margin-top:4px;display:flex;gap:10px;align-items:center;flex-wrap:wrap;">'
      + '<input class="search-input" id="siconer-search-input" type="text" value="'+escapeHtml(f.search)+'" placeholder="Buscar balance..." style="width:280px;">'
      + '<button class="btn-ghost" data-action="siconer-clear-filters" type="button">Limpiar filtros</button>'
      + '</div>'
      + '</div>';
  }

  function buildSiconerKpis(res){
    var list = res.list, meta = res.meta;
    var trafos = {}, nodos = {}, subs = {};
    list.forEach(function(item){
      var t = siconerBaseVal(meta, item.row, 'Trafo'); if(t!=='') trafos[String(t).toUpperCase()]=true;
      var n = siconerBaseVal(meta, item.row, 'Nodo'); if(n!=='') nodos[String(n).toUpperCase()]=true;
      var s = siconerBaseVal(meta, item.row, 'Subestación'); if(s!=='') subs[String(s).toUpperCase()]=true;
    });
    function tile(label, value){
      return '<div class="stat-tile"><div class="label">'+label+'</div><div class="value">'+value+'</div></div>';
    }
    return '<div class="kpi-grid" style="margin-bottom:16px;">'
      + tile('Total de balances', list.length)
      + tile('Trafos', Object.keys(trafos).length)
      + tile('Nodos', Object.keys(nodos).length)
      + tile('Subestaciones', Object.keys(subs).length)
      + '</div>';
  }

  function buildSiconerTable(state, ui, res){
    var meta = res.meta;
    var page = ui.siconerPage || 1;
    var pageSize = ui.siconerPageSize || 25;
    var total = res.list.length;
    var totalPages = Math.max(1, Math.ceil(total/pageSize));
    if(page>totalPages) page = totalPages;
    var startIdx = (page-1)*pageSize;
    var pageItems = res.list.slice(startIdx, startIdx+pageSize);
    var extraCols = [];
    if(ui.siconerFilters.periodo){
      extraCols = [
        { label:'Perdidas '+ui.siconerFilters.periodo, metric:'Perdidas' },
        { label:'% Perdidas '+ui.siconerFilters.periodo, metric:'Porcentaje Perdidas' },
        { label:'Estado '+ui.siconerFilters.periodo, metric:'Estado' }
      ];
    }
    var headCells = SICONER_BASE_COLUMNS.map(function(col){
      var active = ui.siconerSort && ui.siconerSort.col===col;
      var arrow = active ? (ui.siconerSort.dir==='asc'?' ▲':' ▼') : '';
      return '<th><button class="th-sort-btn" data-action="siconer-sort" data-col="'+escapeHtml(col)+'" type="button">'+escapeHtml(col)+arrow+'</button></th>';
    }).join('') + extraCols.map(function(ec){ return '<th>'+escapeHtml(ec.label)+'</th>'; }).join('') + '<th></th>';
    var bodyRows = pageItems.map(function(item){
      var cells = SICONER_BASE_COLUMNS.map(function(col){
        return '<td class="mono">'+escapeHtml(siconerCellDisplay(siconerBaseVal(meta, item.row, col)))+'</td>';
      }).join('');
      var extraCells = extraCols.map(function(ec){
        return '<td class="mono">'+escapeHtml(siconerCellDisplay(siconerMetricVal(meta, item.row, ec.metric, ui.siconerFilters.periodo)))+'</td>';
      }).join('');
      return '<tr>'+cells+extraCells+'<td class="actions-cell"><button class="btn-ghost" data-action="open-siconer-detail" data-id="'+item.idx+'" type="button">Ver detalle</button></td></tr>';
    }).join('');
    var table = total===0
      ? '<p class="empty-hint">Ningun registro coincide con los filtros actuales.</p>'
      : '<div class="table-wrap"><table><thead><tr>'+headCells+'</tr></thead><tbody>'+bodyRows+'</tbody></table></div>';
    var pageSizeOpts = [10,25,50,100].map(function(n){ return '<option value="'+n+'"'+(pageSize===n?' selected':'')+'>'+n+'</option>'; }).join('');
    var showingFrom = total===0?0:startIdx+1;
    var showingTo = Math.min(startIdx+pageSize, total);
    var pagination = '<div class="siconer-pagination">'
      + '<span class="card-sub" style="margin:0;">Mostrando '+showingFrom+' - '+showingTo+' de '+total+' registros</span>'
      + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">'
      + '<label for="siconer-pagesize-select" style="font-size:12px;color:var(--text-muted);">Por pagina</label>'
      + '<select id="siconer-pagesize-select">'+pageSizeOpts+'</select>'
      + '<button class="btn-ghost" data-action="siconer-page-prev" type="button"'+(page<=1?' disabled':'')+'>&laquo; Anterior</button>'
      + '<span class="mono">Pag. '+page+' / '+totalPages+'</span>'
      + '<button class="btn-ghost" data-action="siconer-page-next" type="button"'+(page>=totalPages?' disabled':'')+'>Siguiente &raquo;</button>'
      + '</div></div>';
    return table + pagination;
  }

  function buildSiconerTab(state, ui){
    if(ui.siconerImport) return buildSiconerValidationPanel(ui.siconerImport);
    if(!state.siconer) return buildSiconerUploadArea(state, ui, ui.siconerImportError);
    var res = filterSiconerRows(state, ui);
    var gestorNames = siconerGestorOptions(state, res.meta);
    return buildSiconerInfoCard(state, ui, res.list.length)
      + buildSiconerFiltersCard(state, ui, res.meta, gestorNames)
      + buildSiconerKpis(res)
      + buildSiconerTable(state, ui, res);
  }

  function buildSiconerDetailModal(state, ui){
    if(!state.siconer) return '';
    var idx = parseInt(ui.modal.id, 10);
    var row = state.siconer.rows[idx];
    if(!row) return '<div class="modal-overlay"><div class="modal"><h3>Registro no encontrado</h3><div class="modal-actions"><button class="btn" data-action="close-modal" type="button">Cerrar</button></div></div></div>';
    var meta = parseSiconerWorkbook(state.siconer.headers, state.siconer.rows);
    var groupsHtml = SICONER_DETAIL_GROUPS.map(function(g){
      var kv = g.fields.map(function(fn){
        return '<div><div class="k">'+escapeHtml(fn)+'</div><div class="v">'+escapeHtml(siconerCellDisplay(siconerBaseVal(meta,row,fn)))+'</div></div>';
      }).join('');
      return '<div class="modal-section-title">'+escapeHtml(g.title)+'</div><div class="detail-kv">'+kv+'</div>';
    }).join('');
    function periodTable(title, metrics){
      if(meta.periods.length===0) return '<div class="modal-section-title">'+escapeHtml(title)+'</div><p class="empty-hint">No hay columnas mensuales en el archivo.</p>';
      var head = '<th>Periodo</th>' + metrics.map(function(m){ return '<th>'+escapeHtml(m)+'</th>'; }).join('');
      var rowsHtml = meta.periods.slice().reverse().map(function(p){
        var cells = metrics.map(function(m){ return '<td class="mono">'+escapeHtml(siconerCellDisplay(siconerMetricVal(meta,row,m,p)))+'</td>'; }).join('');
        return '<tr><td class="mono">'+p+'</td>'+cells+'</tr>';
      }).join('');
      return '<div class="modal-section-title">'+escapeHtml(title)+'</div><div class="table-wrap"><table><thead><tr>'+head+'</tr></thead><tbody>'+rowsHtml+'</tbody></table></div>';
    }
    var histHtml = periodTable('Datos historicos (por periodo)', SICONER_HIST_METRICS);
    var perdidasHtml = periodTable('Perdidas y porcentaje de perdidas (por periodo)', SICONER_PERDIDAS_METRICS);
    var estadosHtml = periodTable('Estados (por periodo)', SICONER_ESTADO_METRICS);
    return '<div class="modal-overlay"><div class="modal modal-lg">'
      + '<h3>Detalle del balance &middot; '+escapeHtml(siconerCellDisplay(siconerBaseVal(meta,row,'Trafo')))+'</h3>'
      + groupsHtml + histHtml + perdidasHtml + estadosHtml
      + '<div class="modal-actions"><button class="btn" data-action="close-modal" type="button">Cerrar</button></div>'
      + '</div></div>';
  }
  // =================== FIN MODULO: VER BALANCES SICONER ===================

  var DEFAULT_UI = { tab:'resumen', filter:'todos', balanceFilter:'todos', search:'', modal:null, notice:null, saving:false, justOpened:false, dirty:false, evolutionTrafo:'',
    siconerImport:null, siconerImportError:null,
    siconerFilters:{ gestor:SICONER_DEFAULT_GESTOR, periodo:'', trafo:'', nodo:'', subestacion:'', circuito:'', subplan:'', search:'' },
    siconerSort:{ col:'Orden', dir:'asc' }, siconerPage:1, siconerPageSize:25 };
  var UI = null;
  var STATE = null;
  var READONLY = false;

  function migrateState(state){
    if(state.siconer===undefined) state.siconer = null;
    state.clientes.forEach(function(c){
      if(c.diagnostico_inicial===undefined) c.diagnostico_inicial='';
      if(c.ultimo_seguimiento===undefined) c.ultimo_seguimiento='';
      if(c.periodicidad===undefined) c.periodicidad='';
      if(c.periodicidad_dias_custom===undefined) c.periodicidad_dias_custom='';
      if(c.proximo_seguimiento===undefined) c.proximo_seguimiento='';
      if(c.observacion_seguimiento===undefined) c.observacion_seguimiento='';
      if(c.fecha_reprogramacion===undefined) c.fecha_reprogramacion='';
      if(c.motivo_reprogramacion===undefined) c.motivo_reprogramacion='';
      if(c.estado_reprogramacion===undefined) c.estado_reprogramacion='';
      if(c.nodo===undefined) c.nodo='';
      if(c.accion_seguimiento===undefined) c.accion_seguimiento='';
      if(c.anomalia_seguimiento===undefined) c.anomalia_seguimiento='';
      if(c.energia_facturada_kwh===undefined) c.energia_facturada_kwh=null;
      if(c.energia_potencial_kwh===undefined) c.energia_potencial_kwh=null;
      if(c.factor_demanda===undefined) c.factor_demanda=null;
      if(!c.proximo_seguimiento){
        var suggested = computeProximoSeguimiento(c);
        if(suggested) c.proximo_seguimiento = suggested;
      }
    });
    state.trafos.forEach(function(t){
      if(t.pct_perdidas_inicial===undefined) t.pct_perdidas_inicial=null;
    });
    state.balances.forEach(function(b){
      if(b.perdidas_actual_kwh===undefined) b.perdidas_actual_kwh=null;
      if(b.pct_perdidas_actual===undefined) b.pct_perdidas_actual=null;
    });
    backfillInicialPct(state);
    return state;
  }

  function loadInitialState(){
    var el = document.getElementById('app-state');
    var state = { clientes:[], trafos:[], balances:[], siconer:null, updatedAt:'' };
    if(el && el.textContent){
      try { state = JSON.parse(el.textContent); } catch(e){}
    }
    return migrateState(state);
  }

  function distinctTrafos(state){
    var set = {};
    state.trafos.forEach(function(t){ if(t.trafo) set[t.trafo]=true; });
    state.clientes.forEach(function(c){ if(c.trafo) set[c.trafo]=true; });
    return Object.keys(set).sort();
  }

  function buildTrafoBarChart(state){
    var counts = {};
    state.clientes.forEach(function(c){
      var t = (c.trafo||'').trim() || 'Sin trafo';
      counts[t] = (counts[t]||0)+1;
    });
    var entries = Object.keys(counts).map(function(k){ return [k, counts[k]]; });
    entries.sort(function(a,b){ return b[1]-a[1]; });
    if(entries.length===0) return '<p class="empty-hint">Aun no hay clientes registrados para graficar.</p>';
    var max = entries[0][1];
    var rows = entries.map(function(entry){
      var trafo = entry[0], count = entry[1];
      var pct = Math.max(4, Math.round((count/max)*100));
      return '<div class="bar-row"><span class="bar-label mono" title="'+escapeHtml(trafo)+'">'+escapeHtml(trafo)+'</span>'
        + '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%" title="'+escapeHtml(trafo)+': '+count+' clientes"></div></div>'
        + '<span class="bar-value mono">'+count+'</span></div>';
    }).join('');
    return '<div class="bar-chart">'+rows+'</div>';
  }

  function buildStatusBar(state){
    var counts = { critica:0, reprogramar:0, seguimiento:0, cerrado:0 };
    state.clientes.forEach(function(c){ counts[computeStatus(c)]++; });
    var total = state.clientes.length;
    if(total===0) return '<p class="empty-hint">Aun no hay clientes registrados.</p>';
    var segs = STATUS_ORDER.map(function(key){
      var n = counts[key];
      if(n===0) return '';
      var pct = (n/total*100).toFixed(1);
      return '<div class="stacked-seg" style="width:'+pct+'%;background:var(--'+STATUS_META[key].varName+')" title="'+STATUS_META[key].label+': '+n+'"></div>';
    }).join('');
    var legend = STATUS_ORDER.map(function(key){
      var n = counts[key];
      return '<div class="legend-chip"><span class="dot" style="background:var(--'+STATUS_META[key].varName+')"></span>'+STATUS_META[key].label+' <span class="mono">'+n+'</span></div>';
    }).join('');
    return '<div class="stacked-bar">'+segs+'</div><div class="legend-row">'+legend+'</div>';
  }

  function buildKpis(state){
    var total = state.clientes.length;
    var critica = state.clientes.filter(function(c){ return computeStatus(c)==='critica'; }).length;
    var reprogramar = state.clientes.filter(function(c){ return computeStatus(c)==='reprogramar'; }).length;
    var trafosTotal = state.trafos.length;
    var trafosNorm = state.trafos.filter(function(t){ return t.normalizado==='SI'; }).length;
    function tile(label, value, sub, accentClass){
      return '<div class="stat-tile"><div class="label">'+label+'</div><div class="value'+(accentClass?(' '+accentClass):'')+'">'+value+'</div>'+(sub?('<div class="sub">'+sub+'</div>'):'')+'</div>';
    }
    return '<div class="kpi-grid">'
      + tile('Clientes en amarre', total, distinctTrafos(state).length+' trafo(s) con registro')
      + tile('Irregularidad detectada', critica, 'requieren atencion prioritaria', critica>0?'accent-critical':'')
      + tile('Para reprogramar', reprogramar, 'orden pendiente de nueva visita', reprogramar>0?'accent-warning':'')
      + tile('Trafos normalizados', trafosNorm+' / '+trafosTotal, trafosTotal>0?Math.round(trafosNorm/trafosTotal*100)+'% del total asignado':'')
      + '</div>';
  }

  function buildAlertKpis(state){
    var vencidos = state.clientes.filter(function(c){ return computeSeguimientoAlert(c)==='vencido'; }).length;
    var proximos7 = state.clientes.filter(function(c){ var a=computeSeguimientoAlert(c); return a==='hoy'||a==='atencion'||a==='proximo'; }).length;
    var reprogPend = state.clientes.filter(function(c){ return computeStatus(c)==='reprogramar'; }).length;
    var diagFaltante = state.clientes.filter(function(c){ return !c.diagnostico_inicial; }).length;
    function tile(label, value, sub, accentClass){
      return '<div class="stat-tile"><div class="label">'+label+'</div><div class="value'+(accentClass?(' '+accentClass):'')+'">'+value+'</div>'+(sub?('<div class="sub">'+sub+'</div>'):'')+'</div>';
    }
    return '<div class="kpi-grid">'
      + tile('Seguimientos vencidos', vencidos, 'la proxima visita ya paso', vencidos>0?'accent-critical':'')
      + tile('Seguimientos proximos', proximos7, 'programados en los proximos 7 dias', proximos7>0?'accent-warning':'')
      + tile('Reprogramaciones pendientes', reprogPend, 'clientes por reprogramar', reprogPend>0?'accent-warning':'')
      + tile('Diagnosticos faltantes', diagFaltante, 'clientes sin diagnostico inicial', diagFaltante>0?'accent-warning':'')
      + '</div>';
  }

  function buildPriorityList(state){
    var items = state.clientes.filter(function(c){
      var s = computeStatus(c);
      return s==='critica' || s==='reprogramar';
    }).sort(function(a,b){
      var order = { critica:0, reprogramar:1 };
      return order[computeStatus(a)] - order[computeStatus(b)];
    });
    if(items.length===0) return '<p class="empty-hint">No hay clientes prioritarios en este momento. Buena senal.</p>';
    return '<div class="priority-list">' + items.map(function(c){
      var meta = STATUS_META[computeStatus(c)];
      return '<div class="priority-item">'
        + '<div class="row1"><span class="mono" style="font-weight:600;">'+escapeHtml(c.trafo)+' &middot; contrato '+escapeHtml(c.contrato)+'</span>'
        + '<span class="chip '+meta.chipClass+'">'+meta.label+'</span></div>'
        + '<div class="obs">'+escapeHtml(c.observacion||'(sin observacion)')+'</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  function buildNormalizadosList(state){
    var withDate = state.trafos.filter(function(t){ return t.normalizado==='SI'; }).sort(function(a,b){
      return String(b.fecha_normalizacion||'').localeCompare(String(a.fecha_normalizacion||''));
    });
    if(withDate.length===0) return '<p class="empty-hint">Aun no hay trafos marcados como normalizados.</p>';
    return '<div class="priority-list">' + withDate.map(function(t){
      return '<div class="priority-item"><div class="row1"><span class="mono" style="font-weight:600;">'+escapeHtml(t.trafo)+'</span>'
        + '<span class="chip chip-si">'+(t.fecha_normalizacion?formatDateHuman(t.fecha_normalizacion):'sin fecha registrada')+'</span></div>'
        + (t.acciones?('<div class="obs">'+escapeHtml(t.acciones)+'</div>'):'')
        + '</div>';
    }).join('') + '</div>';
  }

  function buildAlertsBlock(state){
    var vencidos = state.clientes.filter(function(c){ return computeSeguimientoAlert(c)==='vencido'; }).length;
    var proximos = state.clientes.filter(function(c){ var a=computeSeguimientoAlert(c); return a==='proximo'||a==='atencion'; }).length;
    var hoy = state.clientes.filter(function(c){ return computeSeguimientoAlert(c)==='hoy'; }).length;
    var reprogSinFecha = state.clientes.filter(function(c){ return computeStatus(c)==='reprogramar' && !c.fecha_reprogramacion; }).length;
    var reprogConFecha = state.clientes.filter(function(c){ return computeStatus(c)==='reprogramar' && !!c.fecha_reprogramacion; }).length;
    var diagFaltante = state.clientes.filter(function(c){ return !c.diagnostico_inicial; }).length;
    var segSinProgramar = state.clientes.filter(function(c){ return computeSeguimientoAlert(c)==='sin_programar'; }).length;
    var trafosAltasPerdidas = state.trafos.filter(function(t){ var b=latestBalanceForTrafo(state,t.trafo); return b && computeBalanceStatusDisico(b)==='no_conforme'; }).length;
    var trafosNormalizados = state.trafos.filter(function(t){ return t.normalizado==='SI'; }).length;
    var items = [
      { n:vencidos, emoji:'🔴', label:'Seguimientos vencidos', tab:'clientes', filter:'seg_vencido' },
      { n:proximos, emoji:'🟡', label:'Seguimientos proximos (1-7 dias)', tab:'clientes', filter:'seg_proximo' },
      { n:hoy, emoji:'🟠', label:'Seguimientos programados para hoy', tab:'clientes', filter:'seg_hoy' },
      { n:reprogSinFecha, emoji:'🔴', label:'Reprogramaciones sin fecha definida', tab:'clientes', filter:'reprogramar_sin_fecha' },
      { n:reprogConFecha, emoji:'🟡', label:'Reprogramaciones con fecha definida', tab:'clientes', filter:'reprogramar_con_fecha' },
      { n:diagFaltante, emoji:'⚠️', label:'Diagnosticos iniciales faltantes', tab:'clientes', filter:'diagnostico_pendiente' },
      { n:segSinProgramar, emoji:'⚠️', label:'Clientes sin fecha de seguimiento programada', tab:'clientes', filter:'seg_sin_programar' },
      { n:trafosAltasPerdidas, emoji:'🔴', label:'Trafos con perdidas altas (no conformes)', tab:'balances', filter:'no_conforme' },
      { n:trafosNormalizados, emoji:'🟢', label:'Trafos normalizados', tab:'trafos', filter:'' }
    ];
    var rows = items.map(function(it){
      var disabled = it.n===0;
      return '<button class="alert-row" data-action="go-to" data-goto-tab="'+it.tab+'" data-goto-filter="'+it.filter+'" data-goto-label="'+escapeHtml(it.label)+'" type="button"'+(disabled?' disabled':'')+'>'
        + '<span>'+it.emoji+' '+it.label+'</span><span class="mono alert-count">'+it.n+'</span></button>';
    }).join('');
    return '<div class="alerts-block">'+rows+'</div>';
  }

  function buildProximosSeguimientosList(state){
    var items = state.clientes.filter(function(c){
      var a = computeSeguimientoAlert(c);
      return a==='hoy' || a==='atencion' || a==='proximo';
    }).sort(function(a,b){
      return diffDaysFromToday(a.proximo_seguimiento) - diffDaysFromToday(b.proximo_seguimiento);
    });
    if(items.length===0) return '<p class="empty-hint">No hay seguimientos programados en los proximos dias.</p>';
    return '<div class="priority-list">' + items.map(function(c){
      var meta = SEGUIMIENTO_ALERT_META[computeSeguimientoAlert(c)];
      var dias = diffDaysFromToday(c.proximo_seguimiento);
      var diasTxt = dias===0 ? 'hoy' : (dias===1 ? 'en 1 dia' : 'en '+dias+' dias');
      return '<div class="priority-item">'
        + '<div class="row1"><span class="mono" style="font-weight:600;">'+escapeHtml(c.trafo)+' &middot; contrato '+escapeHtml(c.contrato)+'</span>'
        + '<span class="chip '+meta.chipClass+'">'+meta.emoji+' '+meta.label+' ('+diasTxt+')</span></div>'
        + '<div class="obs">Diagnostico: '+escapeHtml(c.diagnostico_inicial||'DIAGNOSTICO PENDIENTE')+' &middot; Proxima visita: '+(c.proximo_seguimiento?formatDateHuman(c.proximo_seguimiento):'-')+'</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  function buildSeguimientosVencidosList(state){
    var items = state.clientes.filter(function(c){ return computeSeguimientoAlert(c)==='vencido'; })
      .sort(function(a,b){ return diffDaysFromToday(a.proximo_seguimiento) - diffDaysFromToday(b.proximo_seguimiento); });
    if(items.length===0) return '<p class="empty-hint">No hay seguimientos vencidos. Buena senal.</p>';
    return '<div class="priority-list">' + items.map(function(c){
      var dias = diffDaysFromToday(c.proximo_seguimiento);
      var abs = Math.abs(dias);
      var venceTxt = 'vencido hace '+abs+(abs===1?' dia':' dias');
      return '<div class="priority-item">'
        + '<div class="row1"><span class="mono" style="font-weight:600;">'+escapeHtml(c.trafo)+' &middot; contrato '+escapeHtml(c.contrato)+'</span>'
        + '<span class="chip chip-vencido">'+SEGUIMIENTO_ALERT_META.vencido.emoji+' '+venceTxt+'</span></div>'
        + '<div class="obs">Diagnostico: '+escapeHtml(c.diagnostico_inicial||'DIAGNOSTICO PENDIENTE')+' &middot; Ultima visita: '+(c.ultimo_seguimiento?formatDateHuman(c.ultimo_seguimiento):'sin registrar')+'</div>'
        + '</div>';
    }).join('') + '</div>';
  }

  function buildReprogramacionesList(state){
    var items = state.clientes.filter(function(c){
      return computeStatus(c)==='reprogramar' || c.fecha_reprogramacion || c.motivo_reprogramacion;
    });
    if(items.length===0) return '<p class="empty-hint">No hay reprogramaciones pendientes.</p>';
    function group(c){
      if(!c.fecha_reprogramacion) return 2;
      var d = diffDaysFromToday(c.fecha_reprogramacion);
      return (d!==null && d<0) ? 0 : 1;
    }
    items = items.slice().sort(function(a,b){
      var ga=group(a), gb=group(b);
      if(ga!==gb) return ga-gb;
      return String(a.fecha_reprogramacion||'').localeCompare(String(b.fecha_reprogramacion||''));
    });
    var rows = items.map(function(c){
      var estadoTxt, chipClass;
      if(!c.fecha_reprogramacion){ estadoTxt = 'PENDIENTE POR DEFINIR'; chipClass='chip-reprogramar'; }
      else {
        var d = diffDaysFromToday(c.fecha_reprogramacion);
        if(d!==null && d<0){ estadoTxt = 'REPROGRAMACION VENCIDA'; chipClass='chip-vencido'; }
        else { estadoTxt = 'REPROGRAMACION PROGRAMADA'; chipClass='chip-proximo'; }
      }
      return '<tr>'
        + '<td class="mono">'+escapeHtml(c.contrato)+'</td>'
        + '<td class="mono">'+escapeHtml(c.trafo)+'</td>'
        + '<td class="mono">'+(c.fecha_reprogramacion?formatDateHuman(c.fecha_reprogramacion):'PENDIENTE POR DEFINIR')+'</td>'
        + '<td><span class="chip '+chipClass+'">'+estadoTxt+'</span></td>'
        + '<td class="obs-cell">'+escapeHtml(c.motivo_reprogramacion||'-')+'</td>'
        + '</tr>';
    }).join('');
    return '<div class="table-wrap"><table><thead><tr><th>Contrato</th><th>Trafo</th><th>Fecha</th><th>Estado</th><th>Motivo</th></tr></thead><tbody>'+rows+'</tbody></table></div>';
  }

  function buildRecuperacionCandidatosList(state){
    var items = state.clientes.filter(function(c){
      var pot = toNumberOrNull(c.energia_potencial_kwh);
      return isTrafoNormalizado(state, c.trafo) && pot!==null && pot>0;
    }).sort(function(a,b){ return toNumberOrNull(b.energia_potencial_kwh) - toNumberOrNull(a.energia_potencial_kwh); });
    if(items.length===0) return '<p class="empty-hint">No hay candidatos con energia potencial a recuperar registrada en transformadores normalizados.</p>';
    var rows = items.map(function(c){
      var fact = toNumberOrNull(c.energia_facturada_kwh);
      var pot = toNumberOrNull(c.energia_potencial_kwh);
      var fd = toNumberOrNull(c.factor_demanda);
      return '<tr>'
        + '<td class="mono">'+escapeHtml(c.trafo)+'</td>'
        + '<td class="mono">'+escapeHtml(c.nodo||'-')+'</td>'
        + '<td class="mono">'+escapeHtml(c.producto||'-')+'</td>'
        + '<td>'+escapeHtml(c.accion_seguimiento||'-')+'</td>'
        + '<td>'+escapeHtml(c.anomalia_seguimiento||'-')+'</td>'
        + '<td class="mono">'+(fact!==null?Math.round(fact).toLocaleString('es-CO'):'-')+'</td>'
        + '<td class="mono" style="font-weight:600;">'+(pot!==null?Math.round(pot).toLocaleString('es-CO'):'-')+'</td>'
        + '<td class="mono">'+(fd!==null?fd:'-')+'</td>'
        + '</tr>';
    }).join('');
    return '<div class="table-wrap"><table><thead><tr>'
      + '<th>Trafo</th><th>Nodo</th><th>Producto</th><th>Accion de seguimiento</th><th>Anomalia</th><th>Energia facturada (kWh)</th><th>Energia potencial (kWh)</th><th>Factor demanda</th>'
      + '</tr></thead><tbody>'+rows+'</tbody></table></div>';
  }

  function buildEvolutionSelector(state, ui){
    var opts = distinctTrafos(state);
    var current = ui.evolutionTrafo || (opts[0] || '');
    var optsHtml = opts.map(function(t){ return '<option value="'+escapeHtml(t)+'"'+(t===current?' selected':'')+'>'+escapeHtml(t)+'</option>'; }).join('');
    return '<div class="field" style="max-width:220px;"><label for="evolution-trafo-select">Transformador</label><select id="evolution-trafo-select">'+optsHtml+'</select></div>';
  }

  function buildEvolutionChart(evoList){
    if(evoList.length===0) return '<p class="empty-hint">Este transformador aun no tiene balances registrados.</p>';
    if(evoList.length===1){
      var only = evoList[0].balance;
      return '<p class="empty-hint">Solo hay un balance registrado ('+formatPct(only.pct_perdidas_emcali)+', '+escapeHtml((only.mes_vigencia||'')+' '+(only.anio_vigencia||''))+'). Se necesitan al menos dos balances para mostrar evolucion.</p>';
    }
    var w = 560, h = 170, padL=38, padR=12, padT=14, padB=28;
    var vals = evoList.map(function(e){ return toNumberOrNull(e.balance.pct_perdidas_emcali); });
    var known = vals.filter(function(v){ return v!==null; });
    var maxV = Math.max.apply(null, known.concat([0.10]));
    var n = evoList.length;
    var stepX = (w-padL-padR)/Math.max(1,n-1);
    function xFor(i){ return padL + i*stepX; }
    function yFor(v){ if(v===null) return null; return padT + (h-padT-padB)*(1-(v/(maxV||1))); }
    var pts = [];
    for(var i=0;i<n;i++){ var y=yFor(vals[i]); if(y!==null) pts.push(xFor(i).toFixed(1)+','+y.toFixed(1)); }
    var polyline = pts.length>1 ? '<polyline points="'+pts.join(' ')+'" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' : '';
    var dots = evoList.map(function(e,i){
      var y = yFor(vals[i]);
      if(y===null) return '';
      var color = e.estado==='MEJORO' ? 'var(--good)' : (e.estado==='EMPEORO' ? 'var(--critical)' : 'var(--accent)');
      return '<circle cx="'+xFor(i).toFixed(1)+'" cy="'+y.toFixed(1)+'" r="4" fill="'+color+'"><title>'+escapeHtml((e.balance.mes_vigencia||'')+' '+(e.balance.anio_vigencia||''))+': '+formatPct(e.balance.pct_perdidas_emcali)+'</title></circle>';
    }).join('');
    var thresholdY = yFor(0.10);
    var thresholdLine = (thresholdY!==null) ? '<line x1="'+padL+'" y1="'+thresholdY.toFixed(1)+'" x2="'+(w-padR)+'" y2="'+thresholdY.toFixed(1)+'" stroke="var(--critical)" stroke-width="1" stroke-dasharray="3,3" opacity="0.55"/>' : '';
    var labels = evoList.map(function(e,i){
      if(i!==0 && i!==n-1 && n>5) return '';
      var mesLabel = (e.balance.mes_vigencia||'').slice(0,3);
      return '<text x="'+xFor(i).toFixed(1)+'" y="'+(h-8)+'" font-size="10" fill="var(--text-muted)" text-anchor="middle">'+escapeHtml(mesLabel)+'</text>';
    }).join('');
    return '<div class="evolution-chart-wrap"><svg viewBox="0 0 '+w+' '+h+'" style="width:100%;height:auto;" role="img" aria-label="Evolucion de perdidas">'
      + thresholdLine + polyline + dots + labels
      + '</svg><p class="card-sub" style="margin-top:8px;">Linea punteada roja: umbral de conformidad (10%). Verde = mejoro respecto al balance anterior, rojo = empeoro.</p></div>';
  }

  function buildHeader(state, ui){
    var updatedBase = state.updatedAt ? ('Ultima actualizacion: ' + new Date(state.updatedAt).toLocaleString('es-CO')) : 'Sin cambios guardados todavia';
    var updated = ui.dirty ? (updatedBase + ' &middot; <span class="dirty-indicator">⚠️ Tiene cambios sin guardar</span>') : updatedBase;
    var saveLabel = ui.saving ? 'Guardando...' : (ui.dirty ? '💾 Guardar cambios' : '✅ Guardado');
    return '<div class="app-header">'
      + '<div><p class="eyebrow">DISICO &middot; EMCALI &middot; Plan altas perdidas</p>'
      + '<h1>Seguimiento de amarre por transformador</h1>'
      + '<p class="updated">'+updated+'</p>'
      + '<p class="author">Creado por: Juan Camilo Espinosa Montoya</p></div>'
      + '<div class="header-actions">'
      + '<a class="btn btn-geros" href="http://54.234.201.113:8080/Proyecto_Geros/index.jsp" target="_blank" rel="noopener noreferrer">GEROS</a>'
      + '<a class="btn btn-levantamientos" href="https://levantamientos.com.co/" target="_blank" rel="noopener noreferrer">Levantamientos</a>'
      + (READONLY? '' : '<button class="btn" data-action="trigger-import" type="button">Importar Excel</button>')
      + '<input type="file" id="import-input" accept=".xlsx,.xls" multiple style="display:none">'
      + '<button class="btn" data-action="export-excel" type="button">Exportar a Excel</button>'
      + (READONLY? '' : '<button class="btn btn-primary" data-action="open-add-cliente" type="button">+ Nuevo registro</button>')
      + (READONLY? '' : '<button class="btn '+(ui.dirty?'btn-primary':'')+'" data-action="save-changes" type="button"'+(ui.saving?' disabled':'')+'>'+saveLabel+'</button>')
      + '</div></div>';
  }

  function buildNotice(ui){
    var out = '';
    if(READONLY){
      out += '<div class="readonly-banner">Vista de solo lectura: los cambios no se pueden guardar desde aqui.</div>';
    }
    if(ui.notice){
      out += '<div class="notice"><span>'+escapeHtml(ui.notice)+'</span><button class="btn-ghost" data-action="dismiss-notice" type="button">Cerrar</button></div>';
    }
    return out;
  }

  function buildTabs(ui){
    var tabs = [ ['resumen','Resumen'], ['clientes','Clientes'], ['trafos','Trafos'], ['balances','Balances'], ['siconer','Ver Balances Siconer'] ];
    return '<div class="tabs">' + tabs.map(function(t){
      return '<button class="tab-btn" data-action="set-tab" data-tab="'+t[0]+'" data-active="'+(ui.tab===t[0])+'" type="button">'+t[1]+'</button>';
    }).join('') + '</div>';
  }

  function buildResumenTab(state){
    return buildAlertKpis(state)
      + '<div class="panel-grid section-gap">'
      + '<div class="card"><h2>Clientes analizados por transformador</h2><p class="card-sub">Cantidad de clientes del amarre con registro de seguimiento</p>'+buildTrafoBarChart(state)+'</div>'
      + '<div class="card"><h2>Distribucion por estado</h2><p class="card-sub">Segun observacion y seguimiento de cada cliente</p>'+buildStatusBar(state)+'</div>'
      + '</div>'
      + '<div class="panel-grid">'
      + '<div class="card"><h2>Clientes prioritarios</h2><p class="card-sub">Irregularidad detectada o pendientes de reprogramar</p>'+buildPriorityList(state)+'</div>'
      + '<div class="card"><h2>Trafos normalizados</h2><p class="card-sub">Fecha en la que se normalizo cada transformador</p>'+buildNormalizadosList(state)+'</div>'
      + '</div>'
      + '<div class="card section-gap"><h2>Alertas generales</h2><p class="card-sub">Toca una alerta para ver el detalle filtrado</p>'+buildAlertsBlock(state)+'</div>'
      + '<div class="panel-grid section-gap">'
      + '<div class="card"><h2>Proximos seguimientos</h2><p class="card-sub">Clientes con visita programada en los proximos dias</p>'+buildProximosSeguimientosList(state)+'</div>'
      + '<div class="card"><h2>Seguimientos vencidos</h2><p class="card-sub">Clientes cuya fecha de proximo seguimiento ya paso</p>'+buildSeguimientosVencidosList(state)+'</div>'
      + '</div>'
      + '<div class="card section-gap"><h2>Proximas reprogramaciones</h2><p class="card-sub">Ordenadas: vencidas, proximas, pendientes por definir</p>'+buildReprogramacionesList(state)+'</div>'
      + '<div class="card section-gap"><h2>Candidatos a seguimiento &middot; trafos normalizados</h2><p class="card-sub">Productos con energia potencial a recuperar en transformadores ya normalizados, de mayor a menor</p>'+buildRecuperacionCandidatosList(state)+'</div>'
      + '<div class="card section-gap"><h2>Variacion de transformadores enviados a normalizar</h2><p class="card-sub">% inicial (EMCALI, antes del vinculo cliente-red) vs. % tras actualizar el amarre (Disico) vs. % actual (ultimo balance que reportas en ESTADO/PERDIDAS ACTUAL)</p>'+buildVariacionNormalizadosList(state)+'</div>';
  }

  function filterClientes(state, ui){
    var list = state.clientes.slice();
    var f = ui.filter;
    if(f && f!=='todos'){
      if(f==='critica'||f==='reprogramar'||f==='seguimiento'||f==='cerrado'){
        list = list.filter(function(c){ return computeStatus(c)===f; });
      } else if(f==='seg_vencido'){
        list = list.filter(function(c){ return computeSeguimientoAlert(c)==='vencido'; });
      } else if(f==='seg_proximo'){
        list = list.filter(function(c){ var a=computeSeguimientoAlert(c); return a==='proximo'||a==='atencion'; });
      } else if(f==='seg_hoy'){
        list = list.filter(function(c){ return computeSeguimientoAlert(c)==='hoy'; });
      } else if(f==='seg_sin_programar'){
        list = list.filter(function(c){ return computeSeguimientoAlert(c)==='sin_programar'; });
      } else if(f==='reprogramar_sin_fecha'){
        list = list.filter(function(c){ return computeStatus(c)==='reprogramar' && !c.fecha_reprogramacion; });
      } else if(f==='reprogramar_con_fecha'){
        list = list.filter(function(c){ return computeStatus(c)==='reprogramar' && !!c.fecha_reprogramacion; });
      } else if(f==='diagnostico_pendiente'){
        list = list.filter(function(c){ return !c.diagnostico_inicial; });
      } else if(f==='recuperacion'){
        list = list.filter(function(c){ var pot=toNumberOrNull(c.energia_potencial_kwh); return isTrafoNormalizado(state, c.trafo) && pot!==null && pot>0; });
      }
    }
    var q = String(ui.search||'').trim().toUpperCase();
    if(q){
      list = list.filter(function(c){
        return [c.orden,c.trafo,c.contrato,c.producto,c.acta,c.observacion,c.seguimiento,c.nodo].some(function(v){
          return String(v||'').toUpperCase().indexOf(q) !== -1;
        });
      });
    }
    return list;
  }

  function buildClientesTab(state, ui){
    var filters = [ ['todos','Todos'], ['critica','Irregularidad'], ['reprogramar','Reprogramar'], ['seguimiento','En seguimiento'], ['cerrado','Cerrados'], ['seg_vencido','Seg. vencido'], ['diagnostico_pendiente','Sin diagnostico'], ['recuperacion','Candidatos recuperacion'] ];
    var filterChips = filters.map(function(f){
      return '<button class="filter-chip" data-action="set-filter" data-filter="'+f[0]+'" data-active="'+(ui.filter===f[0])+'" type="button">'+f[1]+'</button>';
    }).join('');
    var list = filterClientes(state, ui);
    var rows = list.map(function(c){
      var meta = STATUS_META[computeStatus(c)];
      var segAlert = computeSeguimientoAlert(c);
      var segMeta = SEGUIMIENTO_ALERT_META[segAlert];
      var actions = READONLY ? '' :
        '<button class="btn-ghost" data-action="open-edit-cliente" data-id="'+c.id+'" type="button">Editar</button>'
        + '<button class="btn-ghost btn-danger" data-action="delete-cliente" data-id="'+c.id+'" type="button">Eliminar</button>';
      var potNum = toNumberOrNull(c.energia_potencial_kwh);
      return '<tr>'
        + '<td><span class="chip '+meta.chipClass+'">'+meta.label+'</span></td>'
        + '<td class="mono">'+escapeHtml(c.orden)+'</td>'
        + '<td class="mono">'+escapeHtml(c.trafo)+'</td>'
        + '<td class="mono">'+escapeHtml(c.nodo)+'</td>'
        + '<td class="mono">'+escapeHtml(c.contrato)+'</td>'
        + '<td class="mono">'+escapeHtml(c.producto)+'</td>'
        + '<td class="obs-cell">'+escapeHtml(c.observacion)+'</td>'
        + '<td class="mono">'+escapeHtml(c.acta)+'</td>'
        + '<td>'+escapeHtml(c.seguimiento)+'</td>'
        + '<td class="mono">'+(c.fecha?formatDateHuman(c.fecha):'-')+'</td>'
        + '<td class="obs-cell">'+escapeHtml(c.diagnostico_inicial||'DIAGNOSTICO PENDIENTE')+'</td>'
        + '<td><span class="chip '+segMeta.chipClass+'">'+segMeta.emoji+' '+(c.proximo_seguimiento?formatDateHuman(c.proximo_seguimiento):'sin programar')+'</span></td>'
        + '<td class="mono">'+(potNum!==null?Math.round(potNum).toLocaleString('es-CO'):'-')+'</td>'
        + '<td class="actions-cell">'+actions+'</td>'
        + '</tr>';
    }).join('');
    var table = list.length===0
      ? '<p class="empty-hint">No hay registros que coincidan con el filtro o busqueda actual.</p>'
      : '<div class="table-wrap"><table><thead><tr>'
        + '<th>Estado</th><th>Orden</th><th>Trafo</th><th>Nodo</th><th>Contrato</th><th>Producto</th><th>Observacion</th><th>Acta</th><th>Seguimiento</th><th>Fecha</th><th>Diagnostico</th><th>Prox. seguimiento</th><th>Energia potencial (kWh)</th><th>Acciones</th>'
        + '</tr></thead><tbody>'+rows+'</tbody></table></div>';
    return '<div class="filters-row">'
      + '<div class="filters-left">'
      + '<input class="search-input" id="search-input" type="text" placeholder="Buscar por orden, trafo, contrato o acta..." value="'+escapeHtml(ui.search)+'">'
      + filterChips
      + '</div>'
      + (READONLY? '' : '<button class="btn btn-primary" data-action="open-add-cliente" type="button">+ Nuevo registro</button>')
      + '</div>'
      + table;
  }

  function filterTrafos(state, ui){
    var q = String(ui.search||'').trim().toUpperCase();
    if(!q) return state.trafos.slice();
    return state.trafos.filter(function(t){ return String(t.trafo||'').toUpperCase().indexOf(q)!==-1; });
  }

  function buildTrafosTab(state, ui){
    var trafosList = filterTrafos(state, ui);
    var rows = trafosList.map(function(t){
      var actions = READONLY ? '' :
        '<button class="btn-ghost" data-action="open-edit-trafo" data-id="'+t.id+'" type="button">Editar</button>'
        + '<button class="btn-ghost btn-danger" data-action="delete-trafo" data-id="'+t.id+'" type="button">Eliminar</button>';
      var evo = computeBalanceEvolution(state, t.trafo);
      var last = evo.length ? evo[evo.length-1] : null;
      var prevBal = evo.length>1 ? evo[evo.length-2].balance : null;
      var inicial = toNumberOrNull(t.pct_perdidas_inicial);
      var ultimoCell = last ? ('<span class="chip '+BALANCE_STATUS_META[computeBalanceStatus(last.balance)].chipClass+'">'+formatPct(last.balance.pct_perdidas_emcali)+'</span>') : '<span class="empty-hint" style="padding:0;">sin balance</span>';
      var inicialTxt = formatPct(inicial);
      var mesAnteriorTxt = prevBal ? formatPct(prevBal.pct_perdidas_emcali) : '-';
      var cambioTxt = (last && last.cambio!==null) ? ((last.cambio>0?'+':'')+(last.cambio*100).toFixed(1)+' pts') : '-';
      var variacionTxt = (last && last.variacionPct!==null) ? ((last.variacionPct>0?'+':'')+(last.variacionPct*100).toFixed(1)+'%') : '-';
      var estadoTxt = '-'; var estadoChip = 'chip-no';
      if(last && last.estado==='MEJORO'){ estadoTxt='MEJORO'; estadoChip='chip-si'; }
      else if(last && last.estado==='EMPEORO'){ estadoTxt='EMPEORO'; estadoChip='chip-critica'; }
      else if(last && last.estado==='SE_MANTUVO'){ estadoTxt='SE MANTUVO'; estadoChip='chip-no'; }
      return '<tr>'
        + '<td class="mono">'+escapeHtml(t.trafo)+'</td>'
        + '<td class="mono">'+inicialTxt+'</td>'
        + '<td>'+ultimoCell+'</td>'
        + '<td class="mono">'+mesAnteriorTxt+'</td>'
        + '<td class="mono">'+cambioTxt+'</td>'
        + '<td class="mono">'+variacionTxt+'</td>'
        + '<td><span class="chip '+estadoChip+'">'+estadoTxt+'</span></td>'
        + '<td><span class="chip '+(t.normalizado==='SI'?'chip-si':'chip-no')+'">'+(t.normalizado==='SI'?'Normalizado':'Pendiente')+'</span></td>'
        + '<td class="mono">'+(t.fecha_normalizacion?formatDateHuman(t.fecha_normalizacion):'-')+'</td>'
        + '<td class="obs-cell">'+escapeHtml(t.acciones)+'</td>'
        + '<td class="actions-cell">'+actions+'</td>'
        + '</tr>';
    }).join('');
    var table = state.trafos.length===0
      ? '<p class="empty-hint">Aun no hay transformadores registrados.</p>'
      : (trafosList.length===0
        ? '<p class="empty-hint">Ningun transformador coincide con la busqueda.</p>'
        : '<div class="table-wrap"><table><thead><tr><th>Trafo</th><th>% inicial</th><th>% ultimo</th><th>% mes anterior</th><th>Cambio (pts)</th><th>Var. vs anterior</th><th>Estado evolucion</th><th>Normalizado</th><th>Fecha normalizacion</th><th>Acciones a ejecutar</th><th></th></tr></thead><tbody>'+rows+'</tbody></table></div>');
    var header = '<div class="filters-row">'
      + '<div class="filters-left">'
      + '<input class="search-input" id="search-input" type="text" placeholder="Buscar por transformador..." value="'+escapeHtml(ui.search)+'">'
      + '<p class="card-sub" style="margin:0;">'+trafosList.length+' de '+state.trafos.length+' transformador(es) asignados &middot; % inicial se captura del primer balance registrado y no se sobreescribe automaticamente</p>'
      + '</div>'
      + (READONLY? '' : '<button class="btn btn-primary" data-action="open-add-trafo" type="button">+ Nuevo trafo</button>')
      + '</div>';
    var evoTrafo = ui.evolutionTrafo || (state.trafos[0] && state.trafos[0].trafo) || '';
    var evoChartCard = '<div class="card section-gap"><h2>Evolucion de perdidas por transformador</h2><p class="card-sub">Historial de % de perdidas EMCALI segun los balances registrados para el trafo seleccionado</p>'
      + buildEvolutionSelector(state, ui) + buildEvolutionChart(computeBalanceEvolution(state, evoTrafo)) + '</div>';
    return header + table + evoChartCard;
  }

  function filterBalances(state, ui){
    var list = state.balances.slice();
    if(ui.balanceFilter && ui.balanceFilter!=='todos'){
      list = list.filter(function(b){ return computeBalanceStatusDisico(b)===ui.balanceFilter; });
    }
    var q = String(ui.search||'').trim().toUpperCase();
    if(q){
      list = list.filter(function(b){ return String(b.trafo||'').toUpperCase().indexOf(q)!==-1; });
    }
    list.sort(function(a,b){
      var na = toNumberOrNull(a.pct_perdidas_disico); var nb = toNumberOrNull(b.pct_perdidas_disico);
      if(na===null) return 1; if(nb===null) return -1;
      return nb - na;
    });
    return list;
  }

  function buildBalancesBarChart(list){
    if(list.length===0) return '<p class="empty-hint">Aun no hay balances registrados.</p>';
    var colorFor = { conforme:'var(--good)', no_conforme:'var(--critical)', sin_dato:'var(--text-muted)' };
    var maxPct = list.reduce(function(m,b){ var n=toNumberOrNull(b.pct_perdidas_disico); return n!==null && n>m ? n : m; }, 0.10);
    var rows = list.map(function(b){
      var n = toNumberOrNull(b.pct_perdidas_disico);
      var status = computeBalanceStatusValue(n);
      var pct = n===null ? 3 : Math.max(4, Math.round((n/maxPct)*100));
      return '<div class="bar-row"><span class="bar-label mono" title="'+escapeHtml(b.trafo)+'">'+escapeHtml(b.trafo)+'</span>'
        + '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%;background:'+colorFor[status]+'" title="'+escapeHtml(b.trafo)+': '+formatPct(b.pct_perdidas_disico)+'"></div></div>'
        + '<span class="bar-value mono">'+formatPct(b.pct_perdidas_disico)+'</span></div>';
    }).join('');
    return '<div class="bar-chart">'+rows+'</div><p class="card-sub" style="margin-top:12px;">Calculado sobre el % de perdidas Disico (tras actualizar el vinculo cliente-red). Umbral de conformidad: 10% de perdidas (segun contrato). Verde = conforme, rojo = no conforme, gris = INDETERMINADO (revisar macro).</p>';
  }

  function buildBalancesKpis(state){
    var list = state.balances;
    var conforme = list.filter(function(b){ return computeBalanceStatusDisico(b)==='conforme'; }).length;
    var noConforme = list.filter(function(b){ return computeBalanceStatusDisico(b)==='no_conforme'; }).length;
    var nums = list.map(function(b){ return toNumberOrNull(b.pct_perdidas_disico); }).filter(function(n){ return n!==null; });
    var avg = nums.length ? (nums.reduce(function(a,b){return a+b;},0)/nums.length) : null;
    var iniciales = state.trafos.map(function(t){ return toNumberOrNull(t.pct_perdidas_inicial); }).filter(function(n){ return n!==null; });
    var avgInicial = iniciales.length ? (iniciales.reduce(function(a,b){return a+b;},0)/iniciales.length) : null;
    function tile(label, value, sub, accentClass){
      return '<div class="stat-tile"><div class="label">'+label+'</div><div class="value'+(accentClass?(' '+accentClass):'')+'">'+value+'</div>'+(sub?('<div class="sub">'+sub+'</div>'):'')+'</div>';
    }
    return '<div class="kpi-grid">'
      + tile('Trafos con balance', list.length, 'de '+state.trafos.length+' asignados')
      + tile('Conformes (<10%)', conforme, 'segun Disico, ultimo balance')
      + tile('No conformes (>=10%)', noConforme, 'segun Disico, requieren gestion de perdidas', noConforme>0?'accent-critical':'')
      + tile('% perdidas promedio (Disico)', avg===null?'-':formatPct(avg), avgInicial===null?'':('inicial EMCALI: '+formatPct(avgInicial)))
      + '</div>';
  }

  function buildBalancesTab(state, ui){
    var filters = [ ['todos','Todos'], ['conforme','Conformes'], ['no_conforme','No conformes'], ['sin_dato','Sin dato'] ];
    var filterChips = filters.map(function(f){
      return '<button class="filter-chip" data-action="set-balance-filter" data-filter="'+f[0]+'" data-active="'+(ui.balanceFilter===f[0])+'" type="button">'+f[1]+'</button>';
    }).join('');
    var list = filterBalances(state, ui);
    var rows = list.map(function(b){
      var meta = BALANCE_STATUS_META[computeBalanceStatusDisico(b)];
      var actions = READONLY ? '' :
        '<button class="btn-ghost" data-action="open-edit-balance" data-id="'+b.id+'" type="button">Editar</button>'
        + '<button class="btn-ghost btn-danger" data-action="delete-balance" data-id="'+b.id+'" type="button">Eliminar</button>';
      return '<tr>'
        + '<td class="mono">'+escapeHtml(b.trafo)+'</td>'
        + '<td class="mono">'+formatPct(b.pct_perdidas_emcali)+'</td>'
        + '<td class="mono">'+formatKwh(b.perdidas_emcali_kwh)+'</td>'
        + '<td><span class="chip '+meta.chipClass+'">'+formatPct(b.pct_perdidas_disico)+'</span></td>'
        + '<td class="mono">'+formatPct(b.pct_perdidas_actual)+'</td>'
        + '<td class="mono">'+formatKwh(b.perdidas_actual_kwh)+'</td>'
        + '<td class="mono">'+formatPct(b.pct_variacion)+'</td>'
        + '<td>'+escapeHtml(b.estado_balance)+'</td>'
        + '<td class="mono">'+escapeHtml((b.mes_vigencia||'')+' '+(b.anio_vigencia||''))+'</td>'
        + '<td class="mono">'+(b.fecha_balance?formatDateHuman(b.fecha_balance):'-')+'</td>'
        + '<td class="obs-cell">'+escapeHtml(b.observaciones)+'</td>'
        + '<td class="actions-cell">'+actions+'</td>'
        + '</tr>';
    }).join('');
    var table = list.length===0
      ? '<p class="empty-hint">No hay balances que coincidan con el filtro o busqueda actual.</p>'
      : '<div class="table-wrap"><table><thead><tr>'
        + '<th>Trafo</th><th>% Perdidas EMCALI</th><th>kWh perdidas</th><th>% Perdidas Disico</th><th>% Perdidas actual</th><th>kWh perdidas actual</th><th>Variacion</th><th>Estado balance</th><th>Vigencia</th><th>Fecha balance</th><th>Observaciones</th><th>Acciones</th>'
        + '</tr></thead><tbody>'+rows+'</tbody></table></div>';
    return buildBalancesKpis(state)
      + '<div class="card" style="margin-bottom:16px;"><h2>% de perdidas por transformador (Disico)</h2><p class="card-sub">Segun el % de perdidas Disico del balance mas reciente cargado para cada trafo (tras actualizar el vinculo cliente-red)</p>'+buildBalancesBarChart(list)+'</div>'
      + '<div class="filters-row">'
      + '<div class="filters-left">'
      + '<input class="search-input" id="search-input" type="text" placeholder="Buscar por trafo..." value="'+escapeHtml(ui.search)+'">'
      + filterChips
      + '</div>'
      + (READONLY? '' : '<button class="btn btn-primary" data-action="open-add-balance" type="button">+ Nuevo balance</button>')
      + '</div>'
      + table;
  }

  function trafoOptionsDatalist(state){
    return '<datalist id="trafo-options">' + distinctTrafos(state).map(function(t){ return '<option value="'+escapeHtml(t)+'">'; }).join('') + '</datalist>';
  }
  function seguimientoOptionsDatalist(){
    var opts = ['REALIZADA','PENDIENTE PROGRAMACION','QUINCENAL','MENSUAL','EN GESTION COMUNITARIA','REINCIDENTE'];
    return '<datalist id="seguimiento-options">' + opts.map(function(o){ return '<option value="'+o+'">'; }).join('') + '</datalist>';
  }
  function anomaliaOptionsDatalist(){
    var opts = ['NEUTRO FLOTANTE','MEDIDOR CON ANOMALIA','ACOMETIDA IRREGULAR','SELLOS VIOLADOS','LECTURA NO CONCUERDA','OTROS'];
    return '<datalist id="anomalia-options">' + opts.map(function(o){ return '<option value="'+o+'">'; }).join('') + '</datalist>';
  }
  function accionSeguimientoOptionsDatalist(){
    var opts = ['TOMA DE LECTURA','VERIFICACION DE REINCIDENCIA','TOMA DE LECTURA/VERIFICACION DE REINCIDENCIA','INSPECCION VISUAL','REVISION DE MACROMEDICION'];
    return '<datalist id="accion-seguimiento-options">' + opts.map(function(o){ return '<option value="'+o+'">'; }).join('') + '</datalist>';
  }

  function buildClienteModal(state, ui){
    var editing = ui.modal.id ? state.clientes.find(function(c){ return c.id===ui.modal.id; }) : null;
    var c = editing || { orden:'', trafo:'', contrato:'', producto:'', observacion:'', acta:'', seguimiento:'', fecha:todayISO(),
      diagnostico_inicial:'', ultimo_seguimiento:'', periodicidad:'', periodicidad_dias_custom:'', proximo_seguimiento:'', observacion_seguimiento:'',
      fecha_reprogramacion:'', motivo_reprogramacion:'', estado_reprogramacion:'',
      nodo:'', accion_seguimiento:'', anomalia_seguimiento:'', energia_facturada_kwh:'', energia_potencial_kwh:'', factor_demanda:'' };
    var periodicidadOpts = [
      ['', '(sin definir)'], ['SEMANAL','Semanal (7 dias)'], ['QUINCENAL','Quincenal (15 dias)'], ['MENSUAL','Mensual (30 dias)'],
      ['BIMESTRAL','Bimestral (60 dias)'], ['TRIMESTRAL','Trimestral (90 dias)'], ['PERSONALIZADA','Personalizada']
    ].map(function(o){ return '<option value="'+o[0]+'"'+(c.periodicidad===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('');
    var reprogEstadoOpts = [
      ['', '(sin definir)'], ['PENDIENTE','Pendiente'], ['PROGRAMADA','Programada'], ['REALIZADA','Realizada']
    ].map(function(o){ return '<option value="'+o[0]+'"'+(c.estado_reprogramacion===o[0]?' selected':'')+'>'+o[1]+'</option>'; }).join('');
    var customDaysDisplay = c.periodicidad==='PERSONALIZADA' ? '' : 'display:none;';
    return '<div class="modal-overlay">'
      + '<div class="modal">'
      + '<h3>'+(editing?'Editar cliente':'Nuevo registro de cliente')+'</h3>'
      + (ui.formError? '<div class="form-error">'+escapeHtml(ui.formError)+'</div>' : '')
      + '<form data-form="cliente" data-editing-id="'+(editing?editing.id:'')+'">'
      + '<div class="field-row">'
      + '<div class="field"><label for="f-orden">Orden</label><input id="f-orden" name="orden" data-autofocus value="'+escapeHtml(c.orden)+'"></div>'
      + '<div class="field"><label for="f-trafo">Trafo</label><input id="f-trafo" name="trafo" list="trafo-options" value="'+escapeHtml(c.trafo)+'" required></div>'
      + '</div>'
      + '<div class="field-row">'
      + '<div class="field"><label for="f-contrato">Contrato</label><input id="f-contrato" name="contrato" value="'+escapeHtml(c.contrato)+'" required></div>'
      + '<div class="field"><label for="f-producto">Producto</label><input id="f-producto" name="producto" value="'+escapeHtml(c.producto)+'"></div>'
      + '</div>'
      + '<div class="field"><label for="f-observacion">Observacion</label><textarea id="f-observacion" name="observacion">'+escapeHtml(c.observacion)+'</textarea></div>'
      + '<div class="field-row">'
      + '<div class="field"><label for="f-acta">Acta</label><input id="f-acta" name="acta" value="'+escapeHtml(c.acta)+'"></div>'
      + '<div class="field"><label for="f-seguimiento">Seguimiento</label><input id="f-seguimiento" name="seguimiento" list="seguimiento-options" value="'+escapeHtml(c.seguimiento)+'"></div>'
      + '</div>'
      + '<div class="field"><label for="f-fecha">Fecha</label><input id="f-fecha" name="fecha" type="date" value="'+escapeHtml(c.fecha||todayISO())+'"></div>'

      + '<p class="modal-section-title">Diagnostico</p>'
      + '<div class="field"><label for="f-diagnostico">Diagnostico inicial</label><textarea id="f-diagnostico" name="diagnostico_inicial" placeholder="Diagnostico tecnico de la primera visita (no se sobreescribe automaticamente)">'+escapeHtml(c.diagnostico_inicial)+'</textarea></div>'

      + '<p class="modal-section-title">Seguimiento periodico</p>'
      + '<div class="field-row">'
      + '<div class="field"><label for="f-ultimo-seg">Ultimo seguimiento</label><input id="f-ultimo-seg" name="ultimo_seguimiento" type="date" value="'+escapeHtml(c.ultimo_seguimiento)+'"></div>'
      + '<div class="field"><label for="f-periodicidad">Periodicidad</label><select id="f-periodicidad" name="periodicidad">'+periodicidadOpts+'</select></div>'
      + '</div>'
      + '<div class="field" id="f-periodicidad-dias-wrap" style="'+customDaysDisplay+'"><label for="f-periodicidad-dias">Dias personalizados</label><input id="f-periodicidad-dias" name="periodicidad_dias_custom" type="number" min="1" value="'+escapeHtml(c.periodicidad_dias_custom)+'"></div>'
      + '<div class="field"><label for="f-proximo-seg">Proximo seguimiento (auto-calculado, editable)</label><input id="f-proximo-seg" name="proximo_seguimiento" type="date" value="'+escapeHtml(c.proximo_seguimiento)+'"></div>'
      + '<div class="field"><label for="f-obs-seg">Observacion del seguimiento</label><textarea id="f-obs-seg" name="observacion_seguimiento">'+escapeHtml(c.observacion_seguimiento)+'</textarea></div>'

      + '<p class="modal-section-title">Recuperacion (trafo normalizado)</p>'
      + '<div class="field-row">'
      + '<div class="field"><label for="f-nodo">Nodo</label><input id="f-nodo" name="nodo" value="'+escapeHtml(c.nodo)+'"></div>'
      + '<div class="field"><label for="f-accion-seg">Accion de seguimiento</label><input id="f-accion-seg" name="accion_seguimiento" list="accion-seguimiento-options" value="'+escapeHtml(c.accion_seguimiento)+'"></div>'
      + '</div>'
      + '<div class="field"><label for="f-anomalia-seg">Anomalia en seguimiento</label><input id="f-anomalia-seg" name="anomalia_seguimiento" list="anomalia-options" value="'+escapeHtml(c.anomalia_seguimiento)+'"></div>'
      + '<div class="field-row">'
      + '<div class="field"><label for="f-energia-facturada">Energia facturada (kWh)</label><input id="f-energia-facturada" name="energia_facturada_kwh" type="number" step="0.01" value="'+escapeHtml(c.energia_facturada_kwh)+'"></div>'
      + '<div class="field"><label for="f-energia-potencial">Energia potencial a recuperar (kWh)</label><input id="f-energia-potencial" name="energia_potencial_kwh" type="number" step="0.01" value="'+escapeHtml(c.energia_potencial_kwh)+'"></div>'
      + '</div>'
      + '<div class="field" style="max-width:200px;"><label for="f-factor-demanda">Factor de demanda</label><input id="f-factor-demanda" name="factor_demanda" type="number" step="0.01" min="0" max="1" placeholder="ej: 0.2" value="'+escapeHtml(c.factor_demanda)+'"></div>'

      + '<p class="modal-section-title">Reprogramacion</p>'
      + '<div class="field-row">'
      + '<div class="field"><label for="f-fecha-reprog">Fecha de reprogramacion</label><input id="f-fecha-reprog" name="fecha_reprogramacion" type="date" value="'+escapeHtml(c.fecha_reprogramacion)+'"></div>'
      + '<div class="field"><label for="f-estado-reprog">Estado</label><select id="f-estado-reprog" name="estado_reprogramacion">'+reprogEstadoOpts+'</select></div>'
      + '</div>'
      + '<div class="field"><label for="f-motivo-reprog">Motivo de reprogramacion</label><input id="f-motivo-reprog" name="motivo_reprogramacion" value="'+escapeHtml(c.motivo_reprogramacion)+'"></div>'

      + trafoOptionsDatalist(state) + seguimientoOptionsDatalist() + anomaliaOptionsDatalist() + accionSeguimientoOptionsDatalist()
      + '<div class="modal-actions">'
      + '<button class="btn" data-action="close-modal" type="button">Cancelar</button>'
      + '<button class="btn btn-primary" type="submit">Guardar</button>'
      + '</div></form></div></div>';
  }

  function buildTrafoModal(state, ui){
    var editing = ui.modal.id ? state.trafos.find(function(t){ return t.id===ui.modal.id; }) : null;
    var t = editing || { trafo:'', normalizado:'NO', fecha_normalizacion:'', acciones:'', pct_perdidas_inicial:null };
    return '<div class="modal-overlay">'
      + '<div class="modal">'
      + '<h3>'+(editing?'Editar trafo':'Nuevo trafo')+'</h3>'
      + (ui.formError? '<div class="form-error">'+escapeHtml(ui.formError)+'</div>' : '')
      + '<form data-form="trafo" data-editing-id="'+(editing?editing.id:'')+'">'
      + '<div class="field"><label for="t-trafo">Trafo</label><input id="t-trafo" name="trafo" data-autofocus value="'+escapeHtml(t.trafo)+'" required></div>'
      + '<div class="field-row">'
      + '<div class="field"><label for="t-normalizado">Normalizado</label><select id="t-normalizado" name="normalizado">'
      + '<option value="NO"'+(t.normalizado==='NO'?' selected':'')+'>NO</option>'
      + '<option value="SI"'+(t.normalizado==='SI'?' selected':'')+'>SI</option>'
      + '</select></div>'
      + '<div class="field"><label for="t-fecha">Fecha de normalizacion</label><input id="t-fecha" name="fecha_normalizacion" type="date" value="'+escapeHtml(t.fecha_normalizacion)+'"></div>'
      + '</div>'
      + '<div class="field"><label for="t-pct-inicial">% perdidas inicial (referencia historica)</label><input id="t-pct-inicial" name="pct_perdidas_inicial" type="number" step="0.01" placeholder="se captura automaticamente del primer balance" value="'+pctToInputValue(t.pct_perdidas_inicial)+'"></div>'
      + '<div class="field"><label for="t-acciones">Acciones a ejecutar</label><textarea id="t-acciones" name="acciones">'+escapeHtml(t.acciones)+'</textarea></div>'
      + '<div class="modal-actions">'
      + '<button class="btn" data-action="close-modal" type="button">Cancelar</button>'
      + '<button class="btn btn-primary" type="submit">Guardar</button>'
      + '</div></form></div></div>';
  }

  function buildBalanceModal(state, ui){
    var editing = ui.modal.id ? state.balances.find(function(b){ return b.id===ui.modal.id; }) : null;
    var b = editing || { trafo:'', mes_vigencia:'', anio_vigencia:'', fecha_balance:todayISO(), perdidas_emcali_kwh:'', pct_perdidas_emcali:'', perdidas_disico_kwh:'', pct_perdidas_disico:'', perdidas_actual_kwh:'', pct_perdidas_actual:'', variacion_kwh:'', pct_variacion:'', estado_balance:'', observaciones:'' };
    var mesOpts = '<option value="">(sin definir)</option>' + MESES_OPTIONS.map(function(m){
      return '<option value="'+m+'"'+(b.mes_vigencia===m?' selected':'')+'>'+m.charAt(0)+m.slice(1).toLowerCase()+'</option>';
    }).join('');
    if(b.mes_vigencia && MESES_OPTIONS.indexOf(b.mes_vigencia)===-1){
      mesOpts += '<option value="'+escapeHtml(b.mes_vigencia)+'" selected>'+escapeHtml(b.mes_vigencia)+' (valor existente)</option>';
    }
    return '<div class="modal-overlay">'
      + '<div class="modal">'
      + '<h3>'+(editing?'Editar balance':'Nuevo balance')+'</h3>'
      + (ui.formError? '<div class="form-error">'+escapeHtml(ui.formError)+'</div>' : '')
      + '<form data-form="balance" data-editing-id="'+(editing?editing.id:'')+'">'
      + '<div class="field-row">'
      + '<div class="field"><label for="b-trafo">Trafo</label><input id="b-trafo" name="trafo" list="trafo-options" data-autofocus value="'+escapeHtml(b.trafo)+'" required></div>'
      + '<div class="field"><label for="b-fecha">Fecha del balance</label><input id="b-fecha" name="fecha_balance" type="date" value="'+escapeHtml(b.fecha_balance||todayISO())+'"></div>'
      + '</div>'
      + '<div class="field-row">'
      + '<div class="field"><label for="b-mes">Mes vigencia</label><select id="b-mes" name="mes_vigencia">'+mesOpts+'</select></div>'
      + '<div class="field"><label for="b-anio">Ano vigencia</label><input id="b-anio" name="anio_vigencia" value="'+escapeHtml(b.anio_vigencia)+'"></div>'
      + '</div>'
      + '<div class="field-row">'
      + '<div class="field"><label for="b-pct-emcali">% perdidas EMCALI</label><input id="b-pct-emcali" name="pct_perdidas_emcali" type="number" step="0.01" placeholder="ej: 17 para 17%" value="'+pctToInputValue(b.pct_perdidas_emcali)+'"></div>'
      + '<div class="field"><label for="b-kwh-emcali">kWh perdidas EMCALI</label><input id="b-kwh-emcali" name="perdidas_emcali_kwh" type="number" step="0.01" value="'+escapeHtml(b.perdidas_emcali_kwh)+'"></div>'
      + '</div>'
      + '<div class="field-row">'
      + '<div class="field"><label for="b-pct-disico">% perdidas Disico</label><input id="b-pct-disico" name="pct_perdidas_disico" type="number" step="0.01" placeholder="ej: 18 para 18%" value="'+pctToInputValue(b.pct_perdidas_disico)+'"></div>'
      + '<div class="field"><label for="b-kwh-disico">kWh perdidas Disico</label><input id="b-kwh-disico" name="perdidas_disico_kwh" type="number" step="0.01" value="'+escapeHtml(b.perdidas_disico_kwh)+'"></div>'
      + '</div>'
      + '<div class="field-row">'
      + '<div class="field"><label for="b-pct-actual">% perdidas actual (ultimo balance del mes)</label><input id="b-pct-actual" name="pct_perdidas_actual" type="number" step="0.01" placeholder="ej: 15 para 15%" value="'+pctToInputValue(b.pct_perdidas_actual)+'"></div>'
      + '<div class="field"><label for="b-kwh-actual">kWh perdidas actual (ultimo balance del mes)</label><input id="b-kwh-actual" name="perdidas_actual_kwh" type="number" step="0.01" value="'+escapeHtml(b.perdidas_actual_kwh)+'"></div>'
      + '</div>'
      + '<div class="field-row">'
      + '<div class="field"><label for="b-var-kwh">Variacion (kWh)</label><input id="b-var-kwh" name="variacion_kwh" type="number" step="0.01" value="'+escapeHtml(b.variacion_kwh)+'"></div>'
      + '<div class="field"><label for="b-var-pct">Variacion (%)</label><input id="b-var-pct" name="pct_variacion" type="number" step="0.01" placeholder="ej: -26 para -26%" value="'+pctToInputValue(b.pct_variacion)+'"></div>'
      + '</div>'
      + '<div class="field"><label for="b-estado">Estado del balance</label><input id="b-estado" name="estado_balance" placeholder="ej: MEJORO (CONFORME)" value="'+escapeHtml(b.estado_balance)+'"></div>'
      + '<div class="field"><label for="b-obs">Observaciones</label><textarea id="b-obs" name="observaciones">'+escapeHtml(b.observaciones)+'</textarea></div>'
      + trafoOptionsDatalist(state)
      + '<div class="modal-actions">'
      + '<button class="btn" data-action="close-modal" type="button">Cancelar</button>'
      + '<button class="btn btn-primary" type="submit">Guardar</button>'
      + '</div></form></div></div>';
  }

  function buildModal(state, ui){
    if(!ui.modal) return '';
    if(ui.modal.type==='cliente') return buildClienteModal(state, ui);
    if(ui.modal.type==='trafo') return buildTrafoModal(state, ui);
    if(ui.modal.type==='balance') return buildBalanceModal(state, ui);
    if(ui.modal.type==='siconer-detail') return buildSiconerDetailModal(state, ui);
    return '';
  }

  function buildBodyInner(state, ui){
    var content = '';
    if(ui.tab==='resumen') content = buildResumenTab(state);
    else if(ui.tab==='clientes') content = buildClientesTab(state, ui);
    else if(ui.tab==='trafos') content = buildTrafosTab(state, ui);
    else if(ui.tab==='siconer') content = buildSiconerTab(state, ui);
    else content = buildBalancesTab(state, ui);
    var topKpis = (ui.tab==='balances' || ui.tab==='siconer') ? '' : buildKpis(state);
    return buildHeader(state, ui) + buildNotice(ui) + topKpis + buildTabs(ui) + content + buildModal(state, ui);
  }

  function buildFullDocument(state){
    var freshUi = { tab:'resumen', filter:'todos', balanceFilter:'todos', search:'', modal:null, notice:null, saving:false, justOpened:false, dirty:false, evolutionTrafo:'',
      siconerImport:null, siconerImportError:null, siconerFilters:{ gestor:SICONER_DEFAULT_GESTOR, periodo:'', trafo:'', nodo:'', subestacion:'', circuito:'', subplan:'', search:'' },
      siconerSort:{ col:'Orden', dir:'asc' }, siconerPage:1, siconerPageSize:25 };
    var bodyInner = buildBodyInner(state, freshUi);
    var stateJson = JSON.stringify(state).replace(/<\//g, '<\\/');
    return '<!doctype html>\n<html lang="es">\n<head>\n<meta charset="UTF-8">\n'
      + '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
      + '<title>' + APP_TITLE + '</title>\n'
      + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap">\n'
      + '<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"><\/script>\n'
      + '</head>\n<body>\n'
      + '<div id="app">' + bodyInner + '</div>\n'
      + '<script id="app-state" type="application/json">' + stateJson + '<\/script>\n'
      + '<script>' + SCRIPT_SOURCE + '<\/script>\n'
      + '</body>\n</html>';
  }

  var app;

  function render(){
    var active = document.activeElement;
    var activeId = active && active.id;
    var selStart = null, selEnd = null;
    if(active && 'selectionStart' in active){
      try { selStart = active.selectionStart; selEnd = active.selectionEnd; } catch(e){}
    }
    app.innerHTML = buildBodyInner(STATE, UI);
    if(activeId){
      var el = document.getElementById(activeId);
      if(el){
        el.focus();
        if(selStart!==null && el.setSelectionRange){ try { el.setSelectionRange(selStart, selEnd); } catch(e){} }
      }
    }
    if(UI.modal && UI.justOpened){
      var first = app.querySelector('.modal input, .modal textarea, .modal select');
      if(first) first.focus();
      UI.justOpened = false;
    }
  }

  async function saveChanges(){
    STATE.updatedAt = new Date().toISOString();
    if(!window.claude || typeof window.claude.use !== 'function'){
      UI.dirty = false;
      UI.notice = 'Cambios aplicados solo en esta vista: el guardado persistente no esta disponible en este entorno.';
      render();
      return;
    }
    UI.saving = true;
    render();
    try {
      var artifactApi = await window.claude.use('artifact');
      if(!artifactApi){ throw { code:'unavailable' }; }
      try { sessionStorage.setItem('seg-emcali-just-saved', '1'); } catch(e){}
      await artifactApi.publish(buildFullDocument(STATE));
      // on success the view reloads automatically to the new (saved) version
    } catch(err){
      UI.saving = false;
      try { sessionStorage.removeItem('seg-emcali-just-saved'); } catch(e){}
      var code = err && err.code;
      if(code==='not_writer' || code==='not_granted'){
        READONLY = true;
        UI.notice = 'No tienes permiso para guardar cambios en esta vista.';
      } else if(code==='conflict'){
        UI.notice = 'Alguien mas actualizo los datos. Recargando la version mas reciente...';
      } else {
        UI.notice = 'No se pudo guardar el cambio. Intenta de nuevo.';
      }
      render();
    }
  }

  function handleClienteSubmit(form, editingId){
    var data = {
      orden: form.orden.value.trim(),
      trafo: form.trafo.value.trim().toUpperCase(),
      contrato: form.contrato.value.trim(),
      producto: form.producto.value.trim(),
      observacion: form.observacion.value.trim(),
      acta: form.acta.value.trim(),
      seguimiento: form.seguimiento.value.trim(),
      fecha: form.fecha.value || todayISO(),
      diagnostico_inicial: form.diagnostico_inicial.value.trim(),
      ultimo_seguimiento: form.ultimo_seguimiento.value || '',
      periodicidad: form.periodicidad.value || '',
      periodicidad_dias_custom: form.periodicidad_dias_custom.value || '',
      proximo_seguimiento: form.proximo_seguimiento.value || '',
      observacion_seguimiento: form.observacion_seguimiento.value.trim(),
      fecha_reprogramacion: form.fecha_reprogramacion.value || '',
      motivo_reprogramacion: form.motivo_reprogramacion.value.trim(),
      estado_reprogramacion: form.estado_reprogramacion.value || '',
      nodo: form.nodo.value.trim(),
      accion_seguimiento: form.accion_seguimiento.value.trim(),
      anomalia_seguimiento: form.anomalia_seguimiento.value.trim(),
      energia_facturada_kwh: numFieldOrNull(form, 'energia_facturada_kwh'),
      energia_potencial_kwh: numFieldOrNull(form, 'energia_potencial_kwh'),
      factor_demanda: numFieldOrNull(form, 'factor_demanda')
    };
    if(!data.proximo_seguimiento){
      var suggested = computeProximoSeguimiento(data);
      if(suggested) data.proximo_seguimiento = suggested;
    }
    if(!data.trafo || !data.contrato){
      UI.formError = 'Trafo y contrato son obligatorios.';
      render();
      return;
    }
    UI.formError = null;
    if(editingId){
      var idx = STATE.clientes.findIndex(function(c){ return c.id===editingId; });
      if(idx>-1) STATE.clientes[idx] = Object.assign({}, STATE.clientes[idx], data);
    } else {
      data.id = uid();
      STATE.clientes.push(data);
    }
    UI.modal = null;
    UI.dirty = true;
    render();
  }

  function handleTrafoSubmit(form, editingId){
    var data = {
      trafo: form.trafo.value.trim().toUpperCase(),
      normalizado: form.normalizado.value,
      fecha_normalizacion: form.fecha_normalizacion.value || '',
      pct_perdidas_inicial: pctFieldToDecimal(form, 'pct_perdidas_inicial'),
      acciones: form.acciones.value.trim()
    };
    if(!data.trafo){
      UI.formError = 'El codigo de trafo es obligatorio.';
      render();
      return;
    }
    UI.formError = null;
    if(editingId){
      var idx = STATE.trafos.findIndex(function(t){ return t.id===editingId; });
      if(idx>-1) STATE.trafos[idx] = Object.assign({}, STATE.trafos[idx], data);
    } else {
      data.id = uid();
      STATE.trafos.push(data);
    }
    backfillInicialPct(STATE);
    UI.modal = null;
    UI.dirty = true;
    render();
  }

  function deleteCliente(id){
    if(!confirm('Eliminar este registro de cliente?')) return;
    STATE.clientes = STATE.clientes.filter(function(c){ return c.id!==id; });
    UI.dirty = true;
    render();
  }
  function deleteTrafo(id){
    if(!confirm('Eliminar este trafo del listado?')) return;
    STATE.trafos = STATE.trafos.filter(function(t){ return t.id!==id; });
    UI.dirty = true;
    render();
  }

  function pctFieldToDecimal(form, name){
    var raw = form[name].value;
    if(raw==='' || raw===null || raw===undefined) return null;
    var n = Number(raw);
    return isFinite(n) ? (n/100) : null;
  }
  function numFieldOrNull(form, name){
    var raw = form[name].value;
    if(raw==='' || raw===null || raw===undefined) return null;
    var n = Number(raw);
    return isFinite(n) ? n : null;
  }
  function handleBalanceSubmit(form, editingId){
    var data = {
      trafo: form.trafo.value.trim().toUpperCase(),
      mes_vigencia: form.mes_vigencia.value.trim(),
      anio_vigencia: form.anio_vigencia.value.trim(),
      fecha_balance: form.fecha_balance.value || todayISO(),
      perdidas_emcali_kwh: numFieldOrNull(form, 'perdidas_emcali_kwh'),
      pct_perdidas_emcali: pctFieldToDecimal(form, 'pct_perdidas_emcali'),
      perdidas_disico_kwh: numFieldOrNull(form, 'perdidas_disico_kwh'),
      pct_perdidas_disico: pctFieldToDecimal(form, 'pct_perdidas_disico'),
      perdidas_actual_kwh: numFieldOrNull(form, 'perdidas_actual_kwh'),
      pct_perdidas_actual: pctFieldToDecimal(form, 'pct_perdidas_actual'),
      variacion_kwh: numFieldOrNull(form, 'variacion_kwh'),
      pct_variacion: pctFieldToDecimal(form, 'pct_variacion'),
      estado_balance: form.estado_balance.value.trim(),
      observaciones: form.observaciones.value.trim()
    };
    if(!data.trafo){
      UI.formError = 'El codigo de trafo es obligatorio.';
      render();
      return;
    }
    UI.formError = null;
    if(editingId){
      var idx = STATE.balances.findIndex(function(b){ return b.id===editingId; });
      if(idx>-1) STATE.balances[idx] = Object.assign({}, STATE.balances[idx], data);
    } else {
      data.id = uid();
      STATE.balances.push(data);
    }
    backfillInicialPct(STATE);
    UI.modal = null;
    UI.dirty = true;
    render();
  }
  function deleteBalance(id){
    if(!confirm('Eliminar este registro de balance?')) return;
    STATE.balances = STATE.balances.filter(function(b){ return b.id!==id; });
    UI.dirty = true;
    render();
  }

  var COMBINING_MARKS_RE = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');
  function normHeader(h){
    return String(h===null||h===undefined?'':h).toUpperCase()
      .normalize('NFD').replace(COMBINING_MARKS_RE,'')
      .replace(/[^A-Z0-9%]+/g,' ')
      .trim();
  }
  function buildHeaderIndex(headerRow){
    var idx = {};
    (headerRow||[]).forEach(function(h, i){
      var n = normHeader(h);
      if(n && idx[n]===undefined) idx[n] = i;
    });
    return idx;
  }
  function findCol(idx, pred){
    var keys = Object.keys(idx);
    for(var i=0;i<keys.length;i++){ if(pred(keys[i])) return idx[keys[i]]; }
    return -1;
  }
  function cellStr(row, i){
    if(i<0 || row[i]===undefined || row[i]===null) return '';
    var v = row[i];
    if(v instanceof Date){ return isNaN(v.getTime()) ? '' : v.toISOString().slice(0,10); }
    return String(v).trim();
  }
  function cellDate(row, i){
    if(i<0 || row[i]===undefined || row[i]===null || row[i]==='') return '';
    var v = row[i];
    if(v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0,10);
    var m = String(v).match(/(\d{4}-\d{2}-\d{2})/);
    return m ? m[1] : '';
  }
  function normalizePctCell(v){
    if(v===undefined || v===null || v==='') return null;
    var n = (typeof v === 'number') ? v : Number(String(v).replace(',', '.').replace('%',''));
    if(!isFinite(n)) return null;
    return Math.abs(n) <= 1.5 ? n : n/100;
  }
  function classifySheetHeaders(idx){
    var keys = Object.keys(idx);
    var has = function(pred){ return keys.some(pred); };
    var hasTrafo = idx['TRAFO']!==undefined || idx['TRAFOS']!==undefined;
    var hasContrato = idx['CONTRATO']!==undefined;
    var hasNormalizado = idx['NORMALIZADO']!==undefined;
    var hasPctPerdidas = has(function(k){ return k.indexOf('PERDIDAS')!==-1 && k.indexOf('%')!==-1; });
    if(hasTrafo && hasPctPerdidas) return 'balances';
    if(hasTrafo && hasNormalizado && !hasContrato) return 'trafos';
    if(hasTrafo && hasContrato) return 'clientes';
    return null;
  }
  function extractClienteRow(row, idx){
    var iTrafo = idx['TRAFO']!==undefined?idx['TRAFO']:(idx['TRAFOS']!==undefined?idx['TRAFOS']:-1);
    var iObs = findCol(idx, function(k){ return k.indexOf('OBSERVACION')!==-1; });
    var iFecha = idx['FECHA']!==undefined?idx['FECHA']:-1;
    var iDiag = findCol(idx, function(k){ return k.indexOf('DIAGNOSTIC')!==-1; });
    var iNodo = idx['NODO']!==undefined?idx['NODO']:-1;
    var iAnomalia = findCol(idx, function(k){ return k.indexOf('ANOMALIA')!==-1; });
    var iAccion = findCol(idx, function(k){ return k.indexOf('ACCION')!==-1; });
    var iEnergFact = findCol(idx, function(k){ return k.indexOf('ENERGIA')!==-1 && k.indexOf('FACTURADA')!==-1; });
    var iEnergPot = findCol(idx, function(k){ return k.indexOf('ENERGIA')!==-1 && k.indexOf('POTENCIAL')!==-1; });
    var iFactorDem = findCol(idx, function(k){ return k.indexOf('FACTOR')!==-1 && k.indexOf('DEMANDA')!==-1; });
    return {
      orden: cellStr(row, idx['ORDEN']!==undefined?idx['ORDEN']:-1),
      trafo: cellStr(row, iTrafo).toUpperCase(),
      contrato: cellStr(row, idx['CONTRATO']!==undefined?idx['CONTRATO']:-1),
      producto: cellStr(row, idx['PRODUCTO']!==undefined?idx['PRODUCTO']:-1),
      observacion: cellStr(row, iObs),
      acta: cellStr(row, idx['ACTA']!==undefined?idx['ACTA']:-1),
      seguimiento: cellStr(row, idx['SEGUIMIENTO']!==undefined?idx['SEGUIMIENTO']:-1),
      fecha: cellDate(row, iFecha),
      diagnostico_inicial: cellStr(row, iDiag),
      nodo: cellStr(row, iNodo),
      anomalia_seguimiento: cellStr(row, iAnomalia),
      accion_seguimiento: cellStr(row, iAccion),
      energia_facturada_kwh: toNumberOrNull(row[iEnergFact]),
      energia_potencial_kwh: toNumberOrNull(row[iEnergPot]),
      factor_demanda: toNumberOrNull(row[iFactorDem])
    };
  }
  function extractTrafoRow(row, idx){
    var iTrafo = idx['TRAFO']!==undefined?idx['TRAFO']:(idx['TRAFOS']!==undefined?idx['TRAFOS']:-1);
    var iFechaNorm = findCol(idx, function(k){ return k.indexOf('FECHA')!==-1 && k.indexOf('NORMALIZ')!==-1; });
    var iAcciones = findCol(idx, function(k){ return k.indexOf('ACCION')!==-1; });
    var iPctInicial = findCol(idx, function(k){ return k.indexOf('PERDIDAS')!==-1 && k.indexOf('INICIAL')!==-1; });
    var norm = cellStr(row, idx['NORMALIZADO']!==undefined?idx['NORMALIZADO']:-1).toUpperCase();
    return {
      trafo: cellStr(row, iTrafo).toUpperCase(),
      normalizado: (norm==='SI'||norm==='SI '||norm==='S'||norm==='YES') ? 'SI' : 'NO',
      fecha_normalizacion: cellDate(row, iFechaNorm),
      acciones: cellStr(row, iAcciones),
      pct_perdidas_inicial: normalizePctCell(row[iPctInicial])
    };
  }
  function extractBalanceRow(row, idx){
    var iTrafo = idx['TRAFO']!==undefined?idx['TRAFO']:-1;
    var iPctEmcali = findCol(idx, function(k){ return k.indexOf('PERDIDAS')!==-1 && k.indexOf('EMCALI')!==-1 && k.indexOf('%')!==-1; });
    var iKwhEmcali = findCol(idx, function(k){ return k.indexOf('PERDIDAS')!==-1 && k.indexOf('EMCALI')!==-1 && k.indexOf('KWH')!==-1; });
    var iPctDisico = findCol(idx, function(k){ return k.indexOf('PERDIDAS')!==-1 && k.indexOf('DISICO')!==-1 && k.indexOf('%')!==-1; });
    var iKwhDisico = findCol(idx, function(k){ return k.indexOf('PERDIDAS')!==-1 && k.indexOf('DISICO')!==-1 && k.indexOf('%')===-1; });
    var iPctActual = findCol(idx, function(k){ return k.indexOf('PERDIDAS')!==-1 && k.indexOf('ACTUAL')!==-1 && k.indexOf('%')!==-1; });
    var iKwhActual = findCol(idx, function(k){ return k.indexOf('PERDIDAS')!==-1 && k.indexOf('ACTUAL')!==-1 && k.indexOf('%')===-1; });
    var iVarPct = findCol(idx, function(k){ return k.indexOf('VARIAC')!==-1 && k.indexOf('%')!==-1; });
    var iVarKwh = findCol(idx, function(k){ return k.indexOf('VARIAC')!==-1 && k.indexOf('KWH')!==-1; });
    var iMes = findCol(idx, function(k){ return k.indexOf('MES')!==-1 && k.indexOf('VIGENCIA')!==-1; });
    var iAnio = findCol(idx, function(k){ return (k.indexOf('ANO')!==-1) && k.indexOf('VIGENCIA')!==-1; });
    var iFechaBal = findCol(idx, function(k){ return k.indexOf('FECHA')!==-1 && k.indexOf('BALANCE')!==-1; });
    var iEstado = idx['ESTADO']!==undefined?idx['ESTADO']:-1;
    var iObs = findCol(idx, function(k){ return k.indexOf('OBSERVACION')!==-1; });
    return {
      trafo: cellStr(row, iTrafo).toUpperCase(),
      mes_vigencia: cellStr(row, iMes),
      anio_vigencia: cellStr(row, iAnio),
      fecha_balance: cellDate(row, iFechaBal),
      perdidas_emcali_kwh: toNumberOrNull(row[iKwhEmcali]),
      pct_perdidas_emcali: normalizePctCell(row[iPctEmcali]),
      perdidas_disico_kwh: toNumberOrNull(row[iKwhDisico]),
      pct_perdidas_disico: normalizePctCell(row[iPctDisico]),
      perdidas_actual_kwh: toNumberOrNull(row[iKwhActual]),
      pct_perdidas_actual: normalizePctCell(row[iPctActual]),
      variacion_kwh: toNumberOrNull(row[iVarKwh]),
      pct_variacion: normalizePctCell(row[iVarPct]),
      estado_balance: cellStr(row, iEstado),
      observaciones: cellStr(row, iObs)
    };
  }

  async function handleImportFiles(fileList){
    var files = Array.prototype.slice.call(fileList||[]);
    if(files.length===0) return;
    if(typeof XLSX === 'undefined'){
      UI.notice = 'La libreria de importacion aun esta cargando, intenta de nuevo en un momento.';
      render();
      return;
    }
    UI.notice = 'Importando ' + files.length + ' archivo(s)...';
    render();
    var knownTrafosBefore = {};
    distinctTrafos(STATE).forEach(function(tr){ knownTrafosBefore[tr] = true; });
    var s = { cN:0, cU:0, cD:0, tN:0, tU:0, bN:0, bU:0, hojas:[], errores:[], vacias:0, fechasInvalidas:0, trafosDesconocidos:[] };
    var trafosVistosClientes = {};
    var keysVistosClientes = {};
    for(var f=0; f<files.length; f++){
      var file = files[f];
      try {
        var buf = await file.arrayBuffer();
        var wb = XLSX.read(buf, { type:'array', cellDates:true });
        wb.SheetNames.forEach(function(sheetName){
          var ws = wb.Sheets[sheetName];
          var aoa = XLSX.utils.sheet_to_json(ws, { header:1, raw:true, defval:'' });
          if(!aoa || aoa.length<2) return;
          var idx = buildHeaderIndex(aoa[0]);
          var kind = classifySheetHeaders(idx);
          if(!kind){ s.hojas.push(sheetName); return; }
          var iFechaCheck = idx['FECHA'];
          for(var r=1;r<aoa.length;r++){
            var row = aoa[r];
            if(!row || row.every(function(c){ return c===''||c===null||c===undefined; })){ s.vacias++; continue; }
            if(kind==='clientes'){
              var c = extractClienteRow(row, idx);
              if(!c.trafo || !c.contrato) continue;
              if(iFechaCheck!==undefined && row[iFechaCheck]!=='' && row[iFechaCheck]!==undefined && row[iFechaCheck]!==null && !c.fecha) s.fechasInvalidas++;
              if(!knownTrafosBefore[c.trafo] && s.trafosDesconocidos.indexOf(c.trafo)===-1) s.trafosDesconocidos.push(c.trafo);
              var keyC = c.trafo+'|'+c.contrato;
              trafosVistosClientes[c.trafo] = true;
              keysVistosClientes[keyC] = true;
              var exC = STATE.clientes.find(function(x){ return (x.trafo+'|'+x.contrato)===keyC; });
              if(exC){
                var idC=exC.id;
                var prevDiag = exC.diagnostico_inicial;
                Object.assign(exC, c);
                exC.id=idC;
                exC.diagnostico_inicial = (prevDiag && prevDiag.trim()) ? prevDiag : (c.diagnostico_inicial||'');
                if(!c.fecha) exC.fecha = exC.fecha||'';
                s.cU++;
              }
              else { c.id = uid(); STATE.clientes.push(c); s.cN++; }
            } else if(kind==='trafos'){
              var t = extractTrafoRow(row, idx);
              if(!t.trafo) continue;
              var exT = STATE.trafos.find(function(x){ return x.trafo===t.trafo; });
              if(exT){
                var idT=exT.id;
                var prevInicial = exT.pct_perdidas_inicial;
                Object.assign(exT, t);
                exT.id=idT;
                if(prevInicial!==null && prevInicial!==undefined && prevInicial!=='') exT.pct_perdidas_inicial = prevInicial;
                s.tU++;
              }
              else { t.id = uid(); STATE.trafos.push(t); s.tN++; }
            } else if(kind==='balances'){
              var b = extractBalanceRow(row, idx);
              if(!b.trafo) continue;
              if(!knownTrafosBefore[b.trafo] && s.trafosDesconocidos.indexOf(b.trafo)===-1) s.trafosDesconocidos.push(b.trafo);
              var period = b.fecha_balance || (b.mes_vigencia+'-'+b.anio_vigencia);
              var keyB = b.trafo+'|'+period;
              var exB = STATE.balances.find(function(x){ return (x.trafo+'|'+(x.fecha_balance||(x.mes_vigencia+'-'+x.anio_vigencia)))===keyB; });
              if(exB){ var idB=exB.id; Object.assign(exB, b); exB.id=idB; s.bU++; }
              else { b.id = uid(); STATE.balances.push(b); s.bN++; }
            }
          }
        });
      } catch(err){
        s.errores.push(file.name);
      }
    }
    var trafosConAmarreImportado = Object.keys(trafosVistosClientes);
    var clientesEliminados = [];
    if(trafosConAmarreImportado.length){
      STATE.clientes.forEach(function(c){
        if(trafosConAmarreImportado.indexOf(c.trafo)===-1) return;
        var key = c.trafo+'|'+c.contrato;
        if(!keysVistosClientes[key]) clientesEliminados.push(c);
      });
      if(clientesEliminados.length){
        var resumenTrafos = trafosConAmarreImportado.join(', ');
        var confirmMsg = 'El archivo importado trae el amarre de: '+resumenTrafos+'. '
          + clientesEliminados.length+' cliente(s) que estaban registrados en esos transformadores ya NO aparecen en el archivo (contratos: '
          + clientesEliminados.slice(0,8).map(function(c){ return c.contrato; }).join(', ') + (clientesEliminados.length>8?'...':'') + '). '
          + 'Eliminarlos del aplicativo para que quede igual al archivo mas reciente?';
        if(confirm(confirmMsg)){
          var idsEliminar = {};
          clientesEliminados.forEach(function(c){ idsEliminar[c.id]=true; });
          STATE.clientes = STATE.clientes.filter(function(c){ return !idsEliminar[c.id]; });
          s.cD = clientesEliminados.length;
        }
      }
    }
    var parts = [];
    if(s.cN || s.cU) parts.push('Clientes: '+s.cN+' nuevos, '+s.cU+' actualizados');
    if(s.cD) parts.push(s.cD+' cliente(s) eliminado(s) por no aparecer en el amarre importado');
    if(clientesEliminados.length && !s.cD) parts.push(clientesEliminados.length+' cliente(s) ya no aparecen en el amarre importado pero no se eliminaron (cancelado)');
    if(s.tN || s.tU) parts.push('Trafos: '+s.tN+' nuevos, '+s.tU+' actualizados');
    if(s.bN || s.bU) parts.push('Balances: '+s.bN+' nuevos, '+s.bU+' actualizados');
    if(s.vacias) parts.push(s.vacias+' fila(s) vacia(s) omitida(s)');
    if(s.fechasInvalidas) parts.push(s.fechasInvalidas+' fecha(s) no reconocida(s)');
    if(s.trafosDesconocidos.length) parts.push('Trafo(s) sin registro previo: '+s.trafosDesconocidos.slice(0,5).join(', ')+(s.trafosDesconocidos.length>5?' y '+(s.trafosDesconocidos.length-5)+' mas':''));
    if(s.hojas.length) parts.push('Hojas omitidas (encabezados no reconocidos): '+s.hojas.join(', '));
    if(s.errores.length) parts.push('No se pudieron leer: '+s.errores.join(', '));
    var totalChanges = s.cN+s.cU+s.cD+s.tN+s.tU+s.bN+s.bU;
    UI.notice = parts.length ? parts.join(' · ') : 'No se encontraron filas validas (se esperan columnas como ORDEN/TRAFO/CONTRATO, TRAFO/NORMALIZADO o TRAFO/% PERDIDAS).';
    if(totalChanges>0){ backfillInicialPct(STATE); UI.dirty = true; }
    render();
  }

  function exportExcel(state){
    if(typeof XLSX === 'undefined'){
      UI.notice = 'La libreria de exportacion aun esta cargando, intenta de nuevo en un momento.';
      render();
      return;
    }
    var clientesRows = state.clientes.map(function(c){
      var segAlert = computeSeguimientoAlert(c);
      return {
        'ORDEN': c.orden, 'TRAFO': c.trafo, 'NODO': c.nodo, 'CONTRATO': c.contrato, 'PRODUCTO': c.producto,
        'ACCION DE SEGUIMIENTO': c.accion_seguimiento, 'ANOMALIA EN SEGUIMIENTO': c.anomalia_seguimiento,
        'ENERGIA FACTURADA (KWH)': c.energia_facturada_kwh, 'ENERGIA POTENCIAL A RECUPERAR (KWH)': c.energia_potencial_kwh,
        'FACTOR DEMANDA': c.factor_demanda,
        'OBSERVACION': c.observacion, 'ACTA': c.acta, 'SEGUIMIENTO': c.seguimiento,
        'ESTADO': STATUS_META[computeStatus(c)].label, 'FECHA': c.fecha,
        'DIAGNOSTICO INICIAL': c.diagnostico_inicial || 'DIAGNOSTICO PENDIENTE',
        'ULTIMO SEGUIMIENTO': c.ultimo_seguimiento, 'PERIODICIDAD': c.periodicidad,
        'DIAS PERSONALIZADOS': c.periodicidad_dias_custom, 'PROXIMO SEGUIMIENTO': c.proximo_seguimiento,
        'ESTADO SEGUIMIENTO': SEGUIMIENTO_ALERT_META[segAlert].label,
        'OBSERVACION SEGUIMIENTO': c.observacion_seguimiento,
        'FECHA REPROGRAMACION': c.fecha_reprogramacion || 'PENDIENTE POR DEFINIR',
        'MOTIVO REPROGRAMACION': c.motivo_reprogramacion,
        'ESTADO REPROGRAMACION': c.estado_reprogramacion
      };
    });
    var trafosRows = state.trafos.map(function(t){
      var bal = latestBalanceForTrafo(state, t.trafo);
      var evo = computeBalanceEvolution(state, t.trafo);
      var last = evo.length ? evo[evo.length-1] : null;
      var prevBal = evo.length>1 ? evo[evo.length-2].balance : null;
      return {
        'TRAFO': t.trafo, 'NORMALIZADO': t.normalizado, 'FECHA NORMALIZACION': t.fecha_normalizacion,
        '% PERDIDAS INICIAL': formatPct(t.pct_perdidas_inicial),
        '% PERDIDAS ULTIMO': bal?formatPct(bal.pct_perdidas_emcali):'',
        '% MES ANTERIOR': prevBal?formatPct(prevBal.pct_perdidas_emcali):'',
        'CAMBIO (PUNTOS)': (last && last.cambio!==null) ? (last.cambio*100).toFixed(2) : '',
        'VARIACION % VS ANTERIOR': (last && last.variacionPct!==null) ? formatPct(last.variacionPct) : '',
        'ESTADO EVOLUCION': (last && last.estado) ? last.estado.replace('_',' ') : '',
        'ACCIONES': t.acciones
      };
    });
    var balancesRows = state.balances.map(function(b){
      return {
        'TRAFO': b.trafo, '% PERDIDAS EMCALI': formatPct(b.pct_perdidas_emcali), 'KWH PERDIDAS EMCALI': b.perdidas_emcali_kwh,
        '% PERDIDAS DISICO': formatPct(b.pct_perdidas_disico), 'KWH PERDIDAS DISICO': b.perdidas_disico_kwh,
        '% PERDIDAS ACTUAL': formatPct(b.pct_perdidas_actual), 'KWH PERDIDAS ACTUAL': b.perdidas_actual_kwh,
        'VARIACION KWH': b.variacion_kwh, 'VARIACION %': formatPct(b.pct_variacion), 'ESTADO (DISICO)': computeBalanceStatusDisico(b)==='conforme'?'CONFORME':(computeBalanceStatusDisico(b)==='no_conforme'?'NO CONFORME':'SIN DATO'),
        'ESTADO BALANCE': b.estado_balance, 'MES VIGENCIA': b.mes_vigencia, 'ANO VIGENCIA': b.anio_vigencia, 'FECHA BALANCE': b.fecha_balance, 'OBSERVACIONES': b.observaciones
      };
    });
    var wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(clientesRows), 'CLIENTES');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trafosRows), 'TRAFOS');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(balancesRows), 'BALANCES');
    var wbout = XLSX.write(wb, { bookType:'xlsx', type:'array' });
    var blob = new Blob([wbout], { type:'application/octet-stream' });
    if(window.claude && typeof window.claude.use === 'function'){
      window.claude.use('downloads').then(function(dl){
        if(!dl){ UI.notice = 'La exportacion de archivos no esta disponible en esta vista.'; render(); return; }
        dl.save({ filename:'seguimiento_emcali_'+todayISO()+'.xlsx', data: blob }).catch(function(err){
          if(err && err.code==='declined') return;
          UI.notice = 'No se pudo exportar el archivo.';
          render();
        });
      });
    } else {
      var okMain = downloadBlobAsFile(blob, 'seguimiento_emcali_'+todayISO()+'.xlsx');
      UI.notice = okMain ? null : 'No se pudo exportar el archivo en este navegador.';
      render();
    }
  }

  function init(){

    app = document.getElementById('app');
    STATE = loadInitialState();
    UI = Object.assign({}, DEFAULT_UI);

    var justSaved = false;
    try { justSaved = sessionStorage.getItem('seg-emcali-just-saved')==='1'; } catch(e){}
    if(justSaved){
      UI.notice = '✅ Cambios guardados correctamente.';
      try { sessionStorage.removeItem('seg-emcali-just-saved'); } catch(e){}
    }

    window.addEventListener('beforeunload', function(e){
      if(UI.dirty){ e.preventDefault(); e.returnValue = ''; }
    });

    app.addEventListener('click', function(e){
      if(e.target.classList && e.target.classList.contains('modal-overlay')){
        UI.modal = null; UI.formError = null; render(); return;
      }
      var btn = e.target.closest('[data-action]');
      if(!btn) return;
      var action = btn.getAttribute('data-action');
      var id = btn.getAttribute('data-id');
      if(action==='set-tab'){ UI.tab = btn.getAttribute('data-tab'); UI.search=''; render(); }
      else if(action==='set-filter'){ UI.filter = btn.getAttribute('data-filter'); render(); }
      else if(action==='set-balance-filter'){ UI.balanceFilter = btn.getAttribute('data-filter'); render(); }
      else if(action==='open-add-cliente'){ UI.modal = { type:'cliente' }; UI.formError=null; UI.justOpened=true; render(); }
      else if(action==='open-edit-cliente'){ UI.modal = { type:'cliente', id:id }; UI.formError=null; UI.justOpened=true; render(); }
      else if(action==='delete-cliente'){ deleteCliente(id); }
      else if(action==='open-add-trafo'){ UI.modal = { type:'trafo' }; UI.formError=null; UI.justOpened=true; render(); }
      else if(action==='open-edit-trafo'){ UI.modal = { type:'trafo', id:id }; UI.formError=null; UI.justOpened=true; render(); }
      else if(action==='delete-trafo'){ deleteTrafo(id); }
      else if(action==='open-add-balance'){ UI.modal = { type:'balance' }; UI.formError=null; UI.justOpened=true; render(); }
      else if(action==='open-edit-balance'){ UI.modal = { type:'balance', id:id }; UI.formError=null; UI.justOpened=true; render(); }
      else if(action==='delete-balance'){ deleteBalance(id); }
      else if(action==='close-modal'){ UI.modal = null; UI.formError=null; render(); }
      else if(action==='export-excel'){ exportExcel(STATE); }
      else if(action==='trigger-import'){ var fi = document.getElementById('import-input'); if(fi) fi.click(); }
      else if(action==='dismiss-notice'){ UI.notice = null; render(); }
      else if(action==='save-changes'){ saveChanges(); }
      else if(action==='go-to'){
        var gTab = btn.getAttribute('data-goto-tab');
        var gFilter = btn.getAttribute('data-goto-filter');
        var gLabel = btn.getAttribute('data-goto-label');
        UI.tab = gTab; UI.search = '';
        if(gTab==='clientes'){ UI.filter = gFilter || 'todos'; }
        else if(gTab==='balances'){ UI.balanceFilter = gFilter || 'todos'; }
        UI.notice = gLabel ? ('Mostrando: ' + gLabel) : null;
        render();
      }
      else if(action==='siconer-trigger-import'){ var sfi = document.getElementById('siconer-import-input'); if(sfi) sfi.click(); }
      else if(action==='siconer-confirm-import'){ confirmSiconerImport(); }
      else if(action==='siconer-cancel-import'){ UI.siconerImport = null; UI.siconerImportError = null; render(); }
      else if(action==='open-siconer-detail'){ UI.modal = { type:'siconer-detail', id:id }; UI.justOpened=true; render(); }
      else if(action==='siconer-export'){ exportSiconerBalances(STATE, UI); }
      else if(action==='siconer-sort'){ toggleSiconerSort(btn.getAttribute('data-col')); }
      else if(action==='siconer-page-prev'){ if(UI.siconerPage>1){ UI.siconerPage -= 1; render(); } }
      else if(action==='siconer-page-next'){ UI.siconerPage = (UI.siconerPage||1) + 1; render(); }
      else if(action==='siconer-clear-filters'){ resetSiconerFilters(); }
    });

    app.addEventListener('submit', function(e){
      var form = e.target;
      if(form.matches('[data-form="cliente"]')){ e.preventDefault(); handleClienteSubmit(form, form.getAttribute('data-editing-id')||null); }
      else if(form.matches('[data-form="trafo"]')){ e.preventDefault(); handleTrafoSubmit(form, form.getAttribute('data-editing-id')||null); }
      else if(form.matches('[data-form="balance"]')){ e.preventDefault(); handleBalanceSubmit(form, form.getAttribute('data-editing-id')||null); }
    });

    app.addEventListener('input', function(e){
      if(e.target && e.target.id==='search-input'){ UI.search = e.target.value; render(); }
      else if(e.target && e.target.id==='siconer-search-input'){ UI.siconerFilters.search = e.target.value; UI.siconerPage = 1; render(); }
      else if(e.target && e.target.id==='siconer-filter-trafo'){ UI.siconerFilters.trafo = e.target.value; UI.siconerPage = 1; render(); }
      else if(e.target && e.target.id==='siconer-filter-nodo'){ UI.siconerFilters.nodo = e.target.value; UI.siconerPage = 1; render(); }
      else if(e.target && e.target.id==='siconer-filter-subestacion'){ UI.siconerFilters.subestacion = e.target.value; UI.siconerPage = 1; render(); }
      else if(e.target && e.target.id==='siconer-filter-circuito'){ UI.siconerFilters.circuito = e.target.value; UI.siconerPage = 1; render(); }
      else if(e.target && e.target.id==='siconer-filter-subplan'){ UI.siconerFilters.subplan = e.target.value; UI.siconerPage = 1; render(); }
    });

    app.addEventListener('change', function(e){
      if(e.target && e.target.id==='import-input'){
        var files = e.target.files;
        handleImportFiles(files);
        return;
      }
      if(e.target && e.target.id==='evolution-trafo-select'){
        UI.evolutionTrafo = e.target.value;
        render();
        return;
      }
      if(e.target && e.target.id==='siconer-import-input'){
        handleSiconerImportFile(e.target.files);
        return;
      }
      if(e.target && e.target.id==='siconer-gestor-select'){
        UI.siconerFilters.gestor = e.target.value;
        UI.siconerPage = 1;
        render();
        return;
      }
      if(e.target && e.target.id==='siconer-periodo-select'){
        UI.siconerFilters.periodo = e.target.value;
        render();
        return;
      }
      if(e.target && e.target.id==='siconer-pagesize-select'){
        UI.siconerPageSize = parseInt(e.target.value, 10) || 25;
        UI.siconerPage = 1;
        render();
        return;
      }
      var form = e.target && e.target.form;
      if(form && form.matches('[data-form="cliente"]')){
        var nm = e.target.name;
        if(nm==='periodicidad'){
          var wrap = document.getElementById('f-periodicidad-dias-wrap');
          if(wrap) wrap.style.display = (e.target.value==='PERSONALIZADA') ? '' : 'none';
        }
        if(nm==='ultimo_seguimiento' || nm==='periodicidad' || nm==='periodicidad_dias_custom'){
          var tmp = {
            ultimo_seguimiento: form.ultimo_seguimiento.value,
            periodicidad: form.periodicidad.value,
            periodicidad_dias_custom: form.periodicidad_dias_custom.value
          };
          var suggested = computeProximoSeguimiento(tmp);
          if(suggested && form.proximo_seguimiento){ form.proximo_seguimiento.value = suggested; }
        }
      }
    });

    document.addEventListener('keydown', function(e){
      if(e.key==='Escape' && UI.modal){ UI.modal = null; UI.formError=null; render(); }
    });

    render();
  }

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();