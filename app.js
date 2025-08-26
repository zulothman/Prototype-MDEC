// app.js with selectable approvals and drawing (same as previous cell)
(() => {
  const qs = (sel, el=document) => el.querySelector(sel);
  const qsa = (sel, el=document) => [...el.querySelectorAll(sel)];
  const roles = ['Applicant','MDEC Officer','Approver','Auditor','Subcontractor','Admin'];

  const state = {
    jwt: null,
    user: null,
    role: 'Applicant',
    ui: { selectedApprovalId: null },
    db: { applications: [], tasks: [], approvals: [], audit: [], master: { hubs: [], nexus: [], tech: [] }, users: [] },
    map: { map: null, layers: {all: null, hub: null, nexus: null, tech: null}, drawn: null }
  };

  const storageKey = 'mdloc.draw.v04';
  const shapesKey = 'mdloc.drawn.geojson';
  const toast = (msg)=>{ const t=qs('#toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2000); };
  const save = ()=>localStorage.setItem(storageKey, JSON.stringify({jwt:state.jwt,user:state.user,role:state.role,db:state.db,ui:state.ui}));
  const load = ()=>{ try{ return JSON.parse(localStorage.getItem(storageKey)); } catch{return null;} };

  function addDays(n){ const d=new Date(); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); }

  function seed(){
    if (state.db.applications.length) return;
    const now = new Date().toISOString();
    state.db.applications = [
      { id:'APP-1201', title:'MD Nexus at Bangsar', company:'Aizach Niaga Sdn Bhd', mdType:'MD Nexus', state:'WP Kuala Lumpur', status:'In Review', created:now },
      { id:'APP-1202', title:'MD Tech Zone at Iskandar Puteri', company:'Pixel Tech Sdn Bhd', mdType:'MD Tech Zone', state:'Johor', status:'Pending Info', created:now },
      { id:'APP-1203', title:'MD Hub at Shah Alam', company:'Southern Logic Berhad', mdType:'MD Hub', state:'Selangor', status:'Approved', created:now }
    ];
    state.db.tasks = [
      { id:'T-501', ref:'APP-1201', title:'Initial screening', assignee:'MDEC Officer', due:addDays(3), status:'Open' },
      { id:'T-502', ref:'APP-1202', title:'Request for clarification', assignee:'MDEC Officer', due:addDays(5), status:'Open' }
    ];
    state.db.approvals = [
      { id:'AQ-601', ref:'APP-1201', stage:'Pre-Approval', owner:'MDEC Officer', status:'Pending' },
      { id:'AQ-602', ref:'APP-1203', stage:'Approval', owner:'Approver', status:'Approved' }
    ];
    state.db.audit = [{ when: now, who:'system', action:'seed', details:'seeded with selectable approvals' }];
    const pts = (window.DEMO_POINTS || []);
    state.db.master.hubs  = pts.filter(p=>p.type==='hub').map(({code,name,state:st,coords})=>({code,name,state:st,coords}));
    state.db.master.nexus = pts.filter(p=>p.type==='nexus').map(({code,name,state:st,coords})=>({code,name,state:st,coords}));
    state.db.master.tech  = pts.filter(p=>p.type==='tech').map(({code,name,state:st,coords})=>({code,name,state:st,coords}));
    state.db.users = [
      { email:'officer@mdec.gov.my', role:'MDEC Officer' },
      { email:'approver@mdec.gov.my', role:'Approver' },
      { email:'auditor@mdec.gov.my', role:'Auditor' },
      { email:'admin@mdec.gov.my', role:'Admin' }
    ];
  }

  function login(email, role){
    const payload = btoa(JSON.stringify({ sub: email, role, iat: Date.now()/1000 }));
    state.jwt = `demo.${payload}.sig`;
    state.user = { email };
    state.role = role;
    save();
    qs('#authView').classList.remove('active');
    qs('#appShell').classList.add('active');
    qs('#userEmailLabel').textContent = email;
    qs('#activeRoleLabel').textContent = role;
    applyRoleVisibility(role);
    navigate('dashboard');
    refreshAll();
  }
  function logout(){
    state.jwt = null; state.user=null; state.role='Applicant'; state.ui.selectedApprovalId=null;
    save();
    qs('#appShell').classList.remove('active');
    qs('#authView').classList.add('active');
  }
  function applyRoleVisibility(role){
    qsa('.nav-item').forEach(el=>{
      const needs = [...el.classList].filter(c=>c.startsWith('role-')).map(c=>c.replace('role-',''));
      if (!needs.length) { el.style.display=''; return; }
      el.style.display = needs.includes(role.toLowerCase().replace(' ','')) ? '' : 'none';
    });
  }
  function navigate(route){
    qsa('.nav-item').forEach(b=>b.classList.toggle('active', b.dataset.route===route));
    qsa('.route').forEach(p=>p.classList.toggle('active', p.id===`route-${route}`));
    document.title = `${qs(`#route-${route}`).dataset.title} • MD Location Recognition`;
    if (route==='map') setTimeout(initMapIfNeeded, 50);
  }

  function table(rows, opts={}){
    const head = rows[0];
    const body = rows.slice(1);
    const tpl = [`<div class="row head">${head.map(h=>`<div class="cell">${h}</div>`).join('')}</div>`]
      .concat(body.map(r=>`<div class="row ${opts.selectable?'selectable':''}">${r.map(c=>{
        if (typeof c === 'object' && c.html) return `<div class="cell">${c.html}</div>`;
        return `<div class="cell">${c}</div>`;
      }).join('')}</div>`));
    return tpl.join('');
  }

  function renderApplications(){
    const holder = qs('#applicationsTable');
    const rows = [['Application','Company','Type','State','Status']];
    const term = (qs('#appSearch').value||'').toLowerCase();
    state.db.applications
      .filter(a => JSON.stringify(a).toLowerCase().includes(term))
      .forEach(a=>rows.push([
        `${a.id}<div class="muted tiny">${a.title}</div>`,
        a.company, a.mdType, a.state, a.status
      ]));
    holder.innerHTML = table(rows);
    const inProg = state.db.applications.filter(a=>!['Approved','Rejected'].includes(a.status)).length;
    const awaiting = state.db.approvals.filter(a=>a.status==='Pending').length;
    const recognised = state.db.applications.filter(a=>a.status==='Approved').length;
    qs('#metricInProgress').textContent = inProg;
    qs('#metricAwaiting').textContent = awaiting;
    qs('#metricRecognised').textContent = recognised;
  }

  function renderApprovals(){
    const rows = [['ID','Ref','Stage','Owner','Status']];
    state.db.approvals.forEach(a=>rows.push([a.id, a.ref, a.stage, a.owner, a.status]));
    const container = qs('#approvalQueue');
    container.innerHTML = table(rows, {selectable:true});
    const rowEls = [...container.querySelectorAll('.row')].slice(1); // skip header
    rowEls.forEach(row=>{
      const id = row.querySelector('.cell')?.textContent.trim();
      row.setAttribute('tabindex','0');
      if (state.ui.selectedApprovalId===id) row.classList.add('selected');
      const choose = ()=> selectApproval(id, row);
      row.addEventListener('click', choose);
      row.addEventListener('keydown', (e)=>{
        if (e.key==='Enter' || e.key===' ') { e.preventDefault(); choose(); }
      });
    });
    renderApprovalDetails();
  }

  function selectApproval(id, rowEl){
    state.ui.selectedApprovalId = id;
    save();
    qsa('#approvalQueue .row').forEach(r=>r.classList.remove('selected'));
    if (rowEl) rowEl.classList.add('selected');
    renderApprovalDetails();
  }

  function renderApprovalDetails(){
    const d = qs('#approvalDetails');
    const a = state.db.approvals.find(x=>x.id===state.ui.selectedApprovalId);
    if (!a){
      d.innerHTML = '<p class="muted">Select an item from the queue.</p>';
      return;
    }
    const app = state.db.applications.find(x=>x.id===a.ref);
    d.innerHTML = `
      <div class="grid two">
        <div><strong>Approval ID:</strong><br>${a.id}</div>
        <div><strong>Stage:</strong><br>${a.stage}</div>
        <div><strong>Status:</strong><br>${a.status}</div>
        <div><strong>Owner:</strong><br>${a.owner}</div>
        <div><strong>Application Ref:</strong><br>${a.ref}</div>
        <div><strong>Company:</strong><br>${app?app.company:'—'}</div>
      </div>
      <div style="margin-top:12px; display:flex; gap:8px">
        <button id="btnApprove" class="primary">Approve</button>
        <button id="btnRequestInfo" class="ghost">Request Info</button>
        <button id="btnReject" class="ghost">Reject</button>
      </div>
      <p class="muted tiny" style="margin-top:6px">Buttons simulate status change only (no backend).</p>
    `;
    qs('#btnApprove').onclick = ()=>updateApprovalStatus(a.id, 'Approved');
    qs('#btnRequestInfo').onclick = ()=>updateApprovalStatus(a.id, 'Pending Info');
    qs('#btnReject').onclick = ()=>updateApprovalStatus(a.id, 'Rejected');
  }

  function updateApprovalStatus(id, status){
    const a = state.db.approvals.find(x=>x.id===id);
    if (!a) return;
    a.status = status;
    state.db.audit.push({ when:new Date().toISOString(), who: state.user?.email || 'user', action:'approval-status', details:`${id} -> ${status}` });
    save();
    renderApprovals();
    toast(`Approval ${id} marked ${status}.`);
  }

  function renderTasks(){
    const rows = [['Task','Ref','Assignee','Due','Status']];
    state.db.tasks.forEach(t=>rows.push([t.id, t.ref, t.assignee, t.due, t.status]));
    qs('#tasksTable').innerHTML = table(rows);
  }
  function renderAudit(){
    const rows = [['When','Who','Action','Details']];
    state.db.audit.slice().reverse().forEach(a=>rows.push([new Date(a.when).toLocaleString(),a.who,a.action,a.details]));
    qs('#auditTable').innerHTML = table(rows);
  }
  function renderKpis(){
    const k = [
      ['Average time to pre-approval','12 days'],
      ['Average time to full approval','28 days'],
      ['Approval rate (last 90d)','72%'],
      ['Applications per month','34']
    ];
    qs('#kpiList').innerHTML = k.map(([n,v])=>`<li><strong>${n}</strong><br><span class="muted">${v}</span></li>`).join('');
  }
  function renderMaster(){
    const hubRows = [['Code','Name','State','Coords']];
    state.db.master.hubs.forEach(h=>hubRows.push([h.code,h.name,h.state,h.coords]));
    qs('#tabHubs').innerHTML = table(hubRows);
    const nxRows = [['Code','Name','State','Coords']];
    state.db.master.nexus.forEach(h=>nxRows.push([h.code,h.name,h.state,h.coords]));
    qs('#tabNexus').innerHTML = table(nxRows);
    const tzRows = [['Code','Name','State','Coords']];
    state.db.master.tech.forEach(h=>tzRows.push([h.code,h.name,h.state,h.coords]));
    qs('#tabTech').innerHTML = table(tzRows);
    const userRows = [['Email','Role']];
    state.db.users.forEach(u=>userRows.push([u.email,u.role]));
    qs('#usersTable').innerHTML = table(userRows);
  }
  function renderActivity(){
    const holder = qs('#activityFeed');
    const items = [
      ...state.db.applications.slice(-3).map(a=>({icon:'📝',text:`${a.id} • ${a.title} • ${a.status}`})),
      ...state.db.tasks.slice(-3).map(t=>({icon:'✅',text:`Task ${t.id} • ${t.title} • ${t.status}`}))
    ];
    holder.innerHTML = items.map(i=>`<div class="row" style="grid-template-columns:40px 1fr"><div class="cell">${i.icon}</div><div class="cell">${i.text}</div></div>`).join('');
  }

  // Map + drawing
  function initMapIfNeeded(){
    if (state.map.map) { refreshMapMarkers(); return; }
    const lm = L.map('leafletMap', { zoomControl: true });
    lm.setView([3.5, 102.0], 7);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(lm);
    state.map.map = lm;
    state.map.layers.all = L.layerGroup().addTo(lm);
    state.map.layers.hub = L.layerGroup().addTo(lm);
    state.map.layers.nexus = L.layerGroup().addTo(lm);
    state.map.layers.tech = L.layerGroup().addTo(lm);
    state.map.drawn = new L.FeatureGroup().addTo(lm);

    try {
      const saved = localStorage.getItem(shapesKey);
      if (saved){
        const gj = JSON.parse(saved);
        L.geoJSON(gj, {
          onEachFeature: (feature, layer)=>{
            state.map.drawn.addLayer(layer);
            bindShapeEvents(layer);
          }
        });
      }
    } catch(e){ console.warn('GeoJSON load error', e); }

    const drawControl = new L.Control.Draw({
      edit: { featureGroup: state.map.drawn },
      draw: { polyline: { shapeOptions: { weight: 3 } }, polygon: { allowIntersection: false, showArea: true }, rectangle: true, circle: false, circlemarker: false, marker: true }
    });
    lm.addControl(drawControl);

    lm.on(L.Draw.Event.CREATED, (e)=>{
      const layer = e.layer;
      state.map.drawn.addLayer(layer);
      bindShapeEvents(layer);
      persistShapes();
    });
    lm.on(L.Draw.Event.EDITED, persistShapes);
    lm.on(L.Draw.Event.DELETED, persistShapes);

    refreshMapMarkers();
  }

  function bindShapeEvents(layer){
    layer.on('click', ()=>{
      const info = measureLayer(layer);
      qs('#shapeType').textContent = info.type;
      qs('#shapeArea').textContent = info.area || '–';
      qs('#shapePerimeter').textContent = info.perimeter || '–';
    });
  }

  function measureLayer(layer){
    const isPolygon = layer instanceof L.Polygon && !(layer instanceof L.Rectangle);
    const isRectangle = layer instanceof L.Rectangle;
    const isPolyline = layer instanceof L.Polyline && !(layer instanceof L.Polygon);
    const isMarker = layer instanceof L.Marker;
    if (isMarker) return { type: 'Marker', area: '–', perimeter: '–' };
    let area = null, perimeter = null;
    if (isPolygon || isRectangle){
      const latlngs = layer.getLatLngs()[0];
      perimeter = 0;
      for (let i=0; i<latlngs.length; i++){
        const a = latlngs[i], b = latlngs[(i+1)%latlngs.length];
        perimeter += lmDistance(a, b);
      }
      area = polygonArea(latlngs);
      return { type: isRectangle ? 'Rectangle' : 'Polygon', area: fmtArea(area), perimeter: fmtLen(perimeter) };
    }
    if (isPolyline){
      const latlngs = layer.getLatLngs();
      let len = 0; for (let i=0; i<latlngs.length-1; i++) len += lmDistance(latlngs[i], latlngs[i+1]);
      return { type:'Polyline', area:'–', perimeter: fmtLen(len) };
    }
    return { type:'Shape', area:'–', perimeter:'–' };
  }

  function lmDistance(a, b){
    const R = 6371008.8;
    const dLat = (b.lat - a.lat) * Math.PI/180;
    const dLon = (b.lng - a.lng) * Math.PI/180;
    const lat1 = a.lat * Math.PI/180, lat2 = b.lat * Math.PI/180;
    const h = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(h));
  }
  function polygonArea(latlngs){
    if (latlngs.length < 3) return 0;
    const R = 6371008.8;
    let sum = 0;
    for (let i=0; i<latlngs.length; i++){
      const p1 = latlngs[i], p2 = latlngs[(i+1)%latlngs.length];
      sum += (p2.lng - p1.lng) * Math.PI/180 * (2 + Math.sin(p1.lat*Math.PI/180) + Math.sin(p2.lat*Math.PI/180));
    }
    return Math.abs(sum) * R*R / 2;
  }
  const fmtLen = (m)=> (m>1000 ? (m/1000).toFixed(2)+' km' : m.toFixed(0)+' m');
  const fmtArea = (m2)=> (m2>1e6 ? (m2/1e6).toFixed(2)+' km²' : m2.toFixed(0)+' m²');

  function persistShapes(){
    const gj = state.map.drawn.toGeoJSON();
    localStorage.setItem(shapesKey, JSON.stringify(gj));
    toast('Shapes saved.');
  }

  function exportGeoJSON(){
    const gj = state.map.drawn.toGeoJSON();
    const blob = new Blob([JSON.stringify(gj,null,2)], {type:'application/geo+json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download='mdloc-shapes.geojson'; a.click(); URL.revokeObjectURL(url);
  }
  function importGeoJSON(file){
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const gj = JSON.parse(reader.result);
        const layer = L.geoJSON(gj);
        state.map.drawn.clearLayers();
        layer.getLayers().forEach(l=>{ state.map.drawn.addLayer(l); bindShapeEvents(l); });
        persistShapes();
        const group = L.featureGroup(layer.getLayers());
        state.map.map.fitBounds(group.getBounds().pad(0.3));
        toast('GeoJSON imported.');
      } catch(e){
        toast('Invalid GeoJSON.');
      }
    };
    reader.readAsText(file);
  }
  function clearShapes(){
    state.map.drawn.clearLayers();
    localStorage.removeItem(shapesKey);
    qs('#shapeType').textContent = '–';
    qs('#shapeArea').textContent = '–';
    qs('#shapePerimeter').textContent = '–';
    toast('All shapes cleared.');
  }

  function refreshMapMarkers(){
    const lm = state.map.map;
    if (!lm) return;
    Object.values(state.map.layers).forEach(g=>g.clearLayers());
    const layerSel = qs('#mapLayerSelect').value;
    const pts = [
      ...state.db.master.hubs.map(p=>({...p,type:'hub'})),
      ...state.db.master.nexus.map(p=>({...p,type:'nexus'})),
      ...state.db.master.tech.map(p=>({...p,type:'tech'})),
    ].filter(p => layerSel==='all' || p.type===layerSel);
    const markers = [];
    pts.forEach(p=>{
      const [lat,lon] = p.coords.split(',').map(Number);
      const marker = L.marker([lat,lon], { title: p.name });
      const badge = p.type==='hub' ? 'MD Hub' : p.type==='nexus' ? 'MD Nexus' : 'MD Tech Zone';
      marker.bindPopup(`<strong>${p.name}</strong><br>${badge}<br>${p.state}<br><span class="muted">${p.coords}</span>`);
      state.map.layers[p.type].addLayer(marker);
      state.map.layers.all.addLayer(marker);
      markers.push(marker);
    });
    if (markers.length){
      const group = L.featureGroup(markers);
      lm.fitBounds(group.getBounds().pad(0.3), { animate: true });
    }
  }

  // Wizard
  const dialog = qs('#wizardDialog');
  let step=1; const maxStep=5;
  const wizardOpen=()=>{ step=1; qsa('.wizard-step', dialog).forEach((s,i)=>s.classList.toggle('active', i===0)); dialog.showModal(); };
  const wizardNav=(d)=>{ step=Math.min(maxStep,Math.max(1,step+d)); qsa('.wizard-step', dialog).forEach((s,i)=>s.classList.toggle('active', i===step-1)); };
  function wizardSubmit(ev){
    ev?.preventDefault();
    const form = new FormData(qs('#wizardForm'));
    const id = `APP-${(Math.random()*100000).toFixed(0).padStart(4,'0')}`;
    const app = {
      id,
      title: `${form.get('mdType')} at ${form.get('district')||form.get('state')}`,
      company: form.get('companyName'),
      mdType: form.get('mdType'),
      state: form.get('state'),
      status: 'Submitted',
      created: new Date().toISOString()
    };
    state.db.applications.unshift(app);
    state.db.approvals.unshift({ id:`AQ-${(Math.random()*100000).toFixed(0)}`, ref:id, stage:'Pre-Approval', owner:'MDEC Officer', status:'Pending' });
    state.db.tasks.unshift({ id:`T-${(Math.random()*100000).toFixed(0)}`, ref:id, title:'Initial screening', assignee:'MDEC Officer', due:addDays(7), status:'Open' });
    state.db.audit.push({ when:new Date().toISOString(), who: state.user?.email || 'user', action:'submit', details:`Created ${id}` });
    save();
    dialog.close();
    toast('Application submitted.');
    refreshAll();
  }

  function bind(){
    qs('#loginForm').addEventListener('submit', e=>{ e.preventDefault(); login(qs('#loginEmail').value.trim(), qs('#loginRole').value); });
    qs('#logoutBtn').addEventListener('click', logout);
    qsa('.nav-item').forEach(b=>b.addEventListener('click', ()=>navigate(b.dataset.route)));
    qs('#newApplicationBtn').addEventListener('click', wizardOpen);
    qs('#wizardNext').addEventListener('click', ()=>wizardNav(1));
    qs('#wizardPrev').addEventListener('click', ()=>wizardNav(-1));
    qs('#wizardSubmit').addEventListener('click', wizardSubmit);
    qs('#appSearch').addEventListener('input', renderApplications);
    qs('#refreshActivity').addEventListener('click', renderActivity);
    qs('#mapLayerSelect').addEventListener('change', ()=>{ refreshMapMarkers(); });
    qsa('.tab').forEach(t=>t.addEventListener('click', ()=>{
      qsa('.tab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      qsa('.tab-body').forEach(b=>b.classList.remove('active'));
      qs('#'+t.dataset.tab).classList.add('active');
    }));
    qs('#exportCsvBtn').addEventListener('click', exportCsv);

    // Drawing tool buttons
    qs('#btnStartDraw').addEventListener('click', ()=>{
      if (!state.map.map) initMapIfNeeded();
      toast('Drawing enabled: use toolbar on the map (top-left).');
    });
    qs('#btnStopDraw').addEventListener('click', ()=>{
      state.map.map && state.map.map.closePopup();
      toast('Drawing stopped.');
    });
    qs('#btnExportGeoJSON').addEventListener('click', exportGeoJSON);
    qs('#fileImportGeoJSON').addEventListener('change', (e)=>{
      const f = e.target.files[0]; if (f) importGeoJSON(f);
      e.target.value = '';
    });
    qs('#btnClearShapes').addEventListener('click', clearShapes);
  }

  function exportCsv(){
    const header = ['id','title','company','mdType','state','status','created'];
    const rows = state.db.applications.map(a=>header.map(k=>a[k]||''));
    const csv = [header.join(','), ...rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'applications.csv'; a.click(); URL.revokeObjectURL(url);
  }

  function refreshAll(){
    renderApplications();
    renderTasks();
    renderApprovals();
    renderAudit();
    renderKpis();
    renderMaster();
    renderActivity();
    if (qs('#route-map').classList.contains('active')) initMapIfNeeded();
  }

  function init(){
    const saved = load();
    seed();
    if (saved){ Object.assign(state, saved); }
    bind();
    qs('#year').textContent = new Date().getFullYear();
    if (state.jwt){
      login(state.user?.email || 'guest@example.com', state.role || 'Applicant');
    } else {
      qs('#authView').classList.add('active');
    }
  }

  init();
})();