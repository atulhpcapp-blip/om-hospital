import {ITYPES,ECATS,PMODES,MOS,MOFULL,COMM,CLBL,TC,ROLES,OP_TYPES,IP_PAT_TYPES,PLANS,Card,SecL,PBtn,GBtn,DBtn,Pill,TypeTag,Row,MetGrid,FInp,FSel,HBarChart,VBarChart,DonutChart,CommPayForm,SettingsPanel,SuperAdminDashboard,HospitalOnboarding,LoginPage,AdminTab,CreditTab,CollectCreditForm,EditEntryForm,EntryTab,IPTab,OPTab,ExpTab,ReferralsReport,ExpensesReport,PatientListReport} from './App1.jsx'
const PatientTimeline=({db,pid,onBack})=>{
  const [tSearch,setTSearch]=useState('')
  const p=db.ip_patients.find(x=>x.id===pid)
  if(!p)return<button onClick={onBack} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer'}}>Back</button>
  const ents=db.income.filter(e=>e.patient_id===p.id).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''))
  const pkgs=(p.payments||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''))
  // Find linked OP records - same patient name (case-insensitive) or same reg_no
  const opEnts=db.income.filter(e=>{
    if(['ip','ip_r','ip_l'].includes(e.type))return false
    if(e.patient_id===p.id)return false // already in ents
    const nameMatch=e.patient_name&&e.patient_name.toLowerCase()===p.name.toLowerCase()
    const regMatch=p.reg_no&&e.reg_no&&e.reg_no===p.reg_no
    return nameMatch||regMatch
  }).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''))
  const hasOpRecords=opEnts.length>0
  const events=[]
  events.push({date:p.admission_date,label:'Admitted (IP)',sub:(p.diagnosis?'Dx: '+p.diagnosis:'')+(p.room?' - Room: '+p.room:''),color:'#1d4ed8',icon:'IP'})
  ents.forEach(e=>{const cr=isCredit(e);events.push({date:e.date,label:(ITYPES.find(t=>t.key===e.type)?.full||e.type)+' - '+fmt(e.amount),sub:(cr?'Credit':e.payment)+(e.notes?' - '+e.notes:''),color:cr?'#c2410c':'#16a34a',icon:'IP'})})
  pkgs.forEach(py=>{events.push({date:py.date,label:'Package payment - '+fmt(py.amount),sub:py.payment+(py.commission>0?' - Comm: '+fmt(py.commission):''),color:'#1d4ed8',icon:'Pkg'})})
  if(p.discharge_date)events.push({date:p.discharge_date,label:'Discharged',sub:'',color:'#6b7280',icon:'D'})
  opEnts.forEach(e=>{const cr=isCredit(e);const it=ITYPES.find(t=>t.key===e.type);events.push({date:e.date,label:(it?.full||e.type)+' - '+fmt(e.amount),sub:(cr?'Credit':e.payment)+(e.ref_doctor?' - Ref: '+e.ref_doctor:'')+(e.op_type?' - '+e.op_type:'')+(e.notes?' - '+e.notes:''),color:cr?'#c2410c':'#3b82f6',icon:'OP'})})
  events.sort((a,b)=>(a.date||'').localeCompare(b.date||''))
  const ipBilled=ents.reduce((a,e)=>a+e.amount,0)+pkgs.reduce((a,py)=>a+py.amount,0)
  const opBilled=opEnts.reduce((a,e)=>a+e.amount,0)
  const totalBilled=ipBilled+opBilled
  const totalCash=cashTotal(ents)+cashTotal(opEnts)
  const totalCredit=credTotal(ents)+credTotal(opEnts)
  const totalComm=ents.reduce((a,e)=>a+getComm(e),0)+pkgs.reduce((a,py)=>a+(py.commission||0),0)+opEnts.reduce((a,e)=>a+getComm(e),0)
  return(<>
    <button onClick={onBack} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer',marginBottom:12,display:'block'}}>Back to Patient List</button>
    {hasOpRecords&&<div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'8px 12px',marginBottom:10,fontSize:12,color:'#1d4ed8'}}>Showing combined timeline: IP charges + {opEnts.length} linked OP visit{opEnts.length!==1?'s':''}</div>}
    <Card>
      <div style={{fontSize:17,fontWeight:700}}>{p.name}</div>
      {p.phone&&<div style={{fontSize:12,color:'#aaa',marginTop:2}}>Ph: {p.phone}</div>}
      {p.reg_no&&<div style={{fontSize:12,color:'#1d4ed8',fontWeight:700,marginTop:2}}>Reg: {p.reg_no}</div>}
      <div style={{fontSize:12,color:'#aaa',marginTop:4}}>{fmtD(p.admission_date)}{p.discharge_date?' to '+fmtD(p.discharge_date):<Pill label="Active" bg="#dcfce7" tx="#16a34a"/>}</div>
      {p.ref_doctor&&<div style={{fontSize:12,color:'#d97706',fontWeight:700,marginTop:4}}>Ref: Dr. {p.ref_doctor}</div>}
    </Card>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
      {[{l:'Total billed',v:fmt(totalBilled),c:'#111'},{l:'Cash collected',v:fmt(totalCash),c:'#16a34a'},{l:'Credit (due)',v:fmt(totalCredit),c:totalCredit>0?'#c2410c':'#aaa'},{l:'Commission',v:fmt(totalComm),c:'#d97706'}].map((m,i)=>(<div key={i} style={{background:'#f9f9f9',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>{m.l}</div><div style={{fontSize:17,fontWeight:700,color:m.c}}>{m.v}</div></div>))}
    </div>
    <SecL>Patient timeline</SecL>
    <div style={{position:'relative',marginBottom:12}}>
      <svg style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}} width="15" height="15" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="#94a3b8" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/></svg>
      <input style={{...S.inp,paddingLeft:36,paddingRight:tSearch?36:14}} placeholder="Search timeline..." value={tSearch} onChange={e=>setTSearch(e.target.value)} autoCorrect="off"/>
      {tSearch&&<button onClick={()=>setTSearch('')} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',fontSize:16,color:'#aaa',cursor:'pointer'}}>x</button>}
    </div>
    {tSearch&&<div style={{fontSize:11,color:'#94a3b8',marginBottom:8}}>{(tSearch.trim()?events.filter(ev=>(ev.label+ev.sub+fmtD(ev.date)).toLowerCase().includes(tSearch.toLowerCase())):events).length} results</div>}
    <div style={{position:'relative',paddingLeft:36}}>
      <div style={{position:'absolute',left:13,top:8,bottom:8,width:2,background:'#e5e7eb'}}/>
      {(tSearch.trim()?events.filter(ev=>(ev.label+ev.sub+fmtD(ev.date)).toLowerCase().includes(tSearch.toLowerCase())):events).map((ev,i)=>(<div key={i} style={{position:'relative',marginBottom:16}}>
        <div style={{position:'absolute',left:-28,top:2,width:26,height:20,borderRadius:10,background:ev.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,color:'#fff',fontWeight:700,zIndex:1,padding:'0 3px'}}>{ev.icon}</div>
        <div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:12,padding:'10px 14px',borderLeft:'3px solid '+ev.color}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div><div style={{fontSize:13,fontWeight:600,color:'#111'}}>{ev.label}</div>{ev.sub&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>{ev.sub}</div>}</div>
            <div style={{fontSize:11,color:'#aaa',flexShrink:0,marginLeft:8}}>{fmtD(ev.date)}</div>
          </div>
        </div>
      </div>))}
      {tSearch.trim()&&events.filter(ev=>(ev.label+ev.sub+fmtD(ev.date)).toLowerCase().includes(tSearch.toLowerCase())).length===0&&<div style={{textAlign:'center',padding:'24px 0',color:'#94a3b8',fontSize:13}}>No results for "{tSearch}"</div>}
    </div>
  </>)
}

/*  REAL INCOME REPORT  */
const RealIncomeReport=({db})=>{
  const [rPer,setRPer]=useState('month')
  const [rDay,setRDay]=useState(todayStr())
  const [rMon,setRMon]=useState(todayStr().slice(0,7))
  const [rYr,setRYr]=useState(todayStr().slice(0,4))
  const [rFrom,setRFrom]=useState(todayStr().slice(0,7)+'-01')
  const [rTo,setRTo]=useState(todayStr())
  const allYears=[...new Set((db.income||[]).map(e=>e.date?.slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a))

  const incList=(db.income||[]).filter(e=>{
    if(rPer==='day')return e.date===rDay
    if(rPer==='month')return e.date?.startsWith(rMon)
    if(rPer==='year')return e.date?.startsWith(rYr)
    if(rPer==='custom')return e.date>=rFrom&&e.date<=rTo
    return true
  })
  const expList=(db.expenses||[]).filter(e=>{
    if(e.category==='ref_paid')return false
    if(rPer==='day')return e.date===rDay
    if(rPer==='month')return e.date?.startsWith(rMon)
    if(rPer==='year')return e.date?.startsWith(rYr)
    if(rPer==='custom')return e.date>=rFrom&&e.date<=rTo
    return true
  })

  const allInc=incList.reduce((a,e)=>a+(e.amount||0),0)
  const allComm=incList.reduce((a,e)=>a+getComm(e),0)
  const allVCFees=incList.filter(e=>e.type==='vc').reduce((a,e)=>a+(e.consultant_fee||0),0)
  const allDeductions=allComm+allVCFees
  const allReal=allInc-allDeductions
  const allExp=expList.reduce((a,e)=>a+(e.amount||0),0)

  const clinInc=incList.filter(e=>['op','op_r','ip','ip_r'].includes(e.type))
  const clinGross=clinInc.reduce((a,e)=>a+(e.amount||0),0)
  const clinComm=clinInc.reduce((a,e)=>a+getComm(e),0)
  const segClinExp=expList.filter(e=>e.category!=='lab_to_lab')
  const clinExpTotal=segClinExp.reduce((a,e)=>a+(e.amount||0),0)
  const clinActual=clinGross-clinComm-clinExpTotal
  const clinExpCats={}
  segClinExp.forEach(e=>{
    const k=e.category||'other'
    clinExpCats[k]=(clinExpCats[k]||0)+(e.amount||0)
  })

  const labInc=incList.filter(e=>['op_l','ip_l'].includes(e.type))
  const labGross=labInc.reduce((a,e)=>a+(e.amount||0),0)
  const labComm=labInc.reduce((a,e)=>a+getComm(e),0)
  const labToLab=expList.filter(e=>e.category==='lab_to_lab').reduce((a,e)=>a+(e.amount||0),0)
  const labActual=labGross-labComm-labToLab

  const TABS=[{k:'day',l:'Day'},{k:'month',l:'Month'},{k:'year',l:'Year'},{k:'custom',l:'Custom'}]
  const hasData=incList.length>0||expList.length>0

  return(<>
    <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
      {TABS.map(t=>(<button key={t.k} onClick={()=>setRPer(t.k)} style={{padding:'6px 16px',borderRadius:20,border:rPer===t.k?'none':'1px solid #e5e7eb',background:rPer===t.k?'#16a34a':'none',color:rPer===t.k?'#fff':'#888',fontSize:12,fontWeight:700,cursor:'pointer'}}>{t.l}</button>))}
    </div>
    {rPer==='day'&&<input style={{...S.inp,marginBottom:12}} type="date" value={rDay} onChange={e=>setRDay(e.target.value)}/>}
    {rPer==='month'&&<input style={{...S.inp,marginBottom:12}} type="month" value={rMon} onChange={e=>setRMon(e.target.value)}/>}
    {rPer==='year'&&<select style={{...S.sel,marginBottom:12}} value={rYr} onChange={e=>setRYr(e.target.value)}>{(allYears.length?allYears:[todayStr().slice(0,4)]).map(y=><option key={y} value={y}>{y}</option>)}</select>}
    {rPer==='custom'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}><FInp label="From" type="date" value={rFrom} onChange={e=>setRFrom(e.target.value)}/><FInp label="To" type="date" value={rTo} onChange={e=>setRTo(e.target.value)}/></div>}
    {!hasData
      ?<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No data for this period</div>
      :<>
        <Card>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,marginBottom:8,paddingBottom:8,borderBottom:'1px solid #f0f0f0'}}>
            <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Category</div>
            <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:64}}>Collected</div>
            <div style={{fontSize:9,color:'#ef4444',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:64}}>Deductions</div>
            <div style={{fontSize:9,color:'#16a34a',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:64}}>Real</div>
          </div>
          {ITYPES.map(t=>{const ents=incList.filter(e=>e.type===t.key);const ti=ents.reduce((a,e)=>a+(e.amount||0),0);const tc=ents.reduce((a,e)=>a+getComm(e),0);const vcf=t.key==='vc'?ents.reduce((a,e)=>a+(e.consultant_fee||0),0):0;const td=tc+vcf;if(!ti)return null;return(<div key={t.key} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'9px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center'}}><span style={{display:'flex',alignItems:'center',gap:6,fontSize:13}}><TypeTag t={t.key}/>{t.full}</span><span style={{fontSize:13,textAlign:'right',minWidth:64}}>{fmt(ti)}</span><span style={{fontSize:13,textAlign:'right',color:'#ef4444',minWidth:64}}>{td>0?'-'+fmt(td):'-'}</span><span style={{fontSize:13,textAlign:'right',color:'#16a34a',fontWeight:700,minWidth:64}}>{fmt(ti-td)}</span></div>)})}
          <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'10px 0 0',marginTop:6,borderTop:'2px solid #111'}}><span style={{fontSize:14,fontWeight:800}}>Total</span><span style={{fontSize:14,fontWeight:800,textAlign:'right',minWidth:64}}>{fmt(allInc)}</span><span style={{fontSize:14,fontWeight:800,textAlign:'right',color:'#ef4444',minWidth:64}}>{allDeductions>0?'-'+fmt(allDeductions):'-'}</span><span style={{fontSize:14,fontWeight:800,textAlign:'right',color:'#16a34a',minWidth:64}}>{fmt(allReal)}</span></div>
        </Card>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8}}>
          <div style={{background:'#f9f9f9',borderRadius:12,padding:'12px 14px'}}><div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Gross collected</div><div style={{fontSize:20,fontWeight:700}}>{fmt(allInc)}</div></div>
          <div style={{background:'#fef2f2',borderRadius:12,padding:'12px 14px'}}><div style={{fontSize:10,color:'#dc2626',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Deductions</div><div style={{fontSize:20,fontWeight:700,color:'#dc2626'}}>{fmt(allDeductions)}</div></div>
          <div style={{background:'#f0fdf4',borderRadius:12,padding:'14px 16px',gridColumn:'1/-1'}}><div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Real income</div><div style={{fontSize:32,fontWeight:800,color:'#15803d'}}>{fmt(allReal)}</div></div>
        </div>
        <SecL>Actual income</SecL>
        <div style={{borderRadius:18,overflow:'hidden',marginTop:4}}>
          <div style={{background:'linear-gradient(135deg,#14532d,#16a34a)',padding:'20px 20px 16px'}}>
            <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.12em',color:'rgba(255,255,255,0.6)',marginBottom:4}}>Actual income = Real income - All expenses</div>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.45)',marginBottom:14}}>After referral commissions and every expense category</div>
            <div style={{fontSize:38,fontWeight:900,color:'#fff',letterSpacing:'-1.5px',lineHeight:1}}>{fmt(allReal-allExp)}</div>
          </div>
          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderTop:'none',padding:'14px 18px',borderRadius:'0 0 18px 18px'}}>
            <div style={{display:'flex',flexDirection:'column',gap:8}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#374151'}}>Gross income</span><span style={{fontWeight:700,color:'#16a34a'}}>{fmt(allInc)}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#374151'}}>Commissions + VC fees</span><span style={{fontWeight:700,color:'#d97706'}}>- {fmt(allDeductions)}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#374151'}}>All expenses</span><span style={{fontWeight:700,color:'#dc2626'}}>- {fmt(allExp)}</span></div>
              <div style={{height:1,background:'#d1fae5'}}/>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:14,fontWeight:800}}><span style={{color:'#065f46'}}>= Actual income</span><span style={{color:'#059669'}}>{fmt(allReal-allExp)}</span></div>
            </div>
          </div>
        </div>
        <SecL>Segment breakdown</SecL>
        {clinGross>0&&<div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:16,padding:'16px',marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
            <div><div style={{fontSize:13,fontWeight:700,color:'#0f172a'}}>Clinical and Pharmacy</div><div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>OP + OP-Pharmacy + IP + IP-Pharmacy</div></div>
            <div style={{textAlign:'right'}}><div style={{fontSize:10,color:'#94a3b8',fontWeight:600}}>Actual income</div><div style={{fontSize:20,fontWeight:800,color:clinActual>=0?'#0891b2':'#dc2626'}}>{fmt(clinActual)}</div></div>
          </div>
          <div style={{background:'#f8fafc',borderRadius:10,padding:'10px 12px',display:'flex',flexDirection:'column',gap:6}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#475569'}}>Gross income</span><span style={{fontWeight:700,color:'#16a34a'}}>{fmt(clinGross)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#475569'}}>Ref commissions</span><span style={{fontWeight:700,color:'#d97706'}}>- {fmt(clinComm)}</span></div>
            {Object.entries(clinExpCats).filter(([,v])=>v>0).map(([cat,v])=>(<div key={cat} style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#475569',textTransform:'capitalize'}}>{cat.replace(/_/g,' ')}</span><span style={{fontWeight:600,color:'#dc2626'}}>- {fmt(v)}</span></div>))}
            <div style={{height:1,background:'#e2e8f0',margin:'2px 0'}}/>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:800}}><span style={{color:'#0f172a'}}>= Actual</span><span style={{color:clinActual>=0?'#0891b2':'#dc2626'}}>{fmt(clinActual)}</span></div>
          </div>
        </div>}
        {labGross>0&&<div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:16,padding:'16px',marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
            <div><div style={{fontSize:13,fontWeight:700,color:'#0f172a'}}>Laboratory</div><div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>OP-Lab + IP-Lab</div></div>
            <div style={{textAlign:'right'}}><div style={{fontSize:10,color:'#94a3b8',fontWeight:600}}>Actual income</div><div style={{fontSize:20,fontWeight:800,color:labActual>=0?'#7c3aed':'#dc2626'}}>{fmt(labActual)}</div></div>
          </div>
          <div style={{background:'#f8fafc',borderRadius:10,padding:'10px 12px',display:'flex',flexDirection:'column',gap:6}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#475569'}}>Gross income</span><span style={{fontWeight:700,color:'#16a34a'}}>{fmt(labGross)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#475569'}}>Ref commissions</span><span style={{fontWeight:700,color:'#d97706'}}>- {fmt(labComm)}</span></div>
            {labToLab>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#475569'}}>Lab to lab</span><span style={{fontWeight:600,color:'#dc2626'}}>- {fmt(labToLab)}</span></div>}
            <div style={{height:1,background:'#e2e8f0',margin:'2px 0'}}/>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:800}}><span style={{color:'#0f172a'}}>= Actual</span><span style={{color:labActual>=0?'#7c3aed':'#dc2626'}}>{fmt(labActual)}</span></div>
          </div>
        </div>}
        {!clinGross&&!labGross&&<div style={{textAlign:'center',padding:'12px 0',color:'#94a3b8',fontSize:13}}>No segment data for this period</div>}
      </>}
  </>)
}
/*  REPORTS TAB  */
/*  AREA-WISE REPORT  */
const AreaReport=({db,rm,setRm,ry,setRy,yrs})=>{
  const [aPer,setAPer]=useState('month')
  const [aFrom,setAFrom]=useState(todayStr().slice(0,7)+'-01')
  const [aTo,setATo]=useState(todayStr())
  const aInc=aPer==='month'?db.income.filter(e=>e.date?.startsWith(rm)):aPer==='year'?db.income.filter(e=>e.date?.startsWith(ry)):db.income.filter(e=>e.date>=aFrom&&e.date<=aTo)
  const areaMap={}
  db.ref_doctors.forEach(d=>{areaMap[d.name]=d.area||'(no area set)'})
  const areasObj={}
  aInc.forEach(e=>{
    if(!e.ref_doctor||!e.ref_doctor.trim())return
    const area=areaMap[e.ref_doctor]||'(no area set)'
    if(!areasObj[area])areasObj[area]={area,doctors:{},total:0,commission:0,patientNames:[]}
    if(!areasObj[area].doctors[e.ref_doctor])areasObj[area].doctors[e.ref_doctor]={name:e.ref_doctor,income:0,commission:0,count:0}
    areasObj[area].total+=e.amount
    areasObj[area].commission+=getComm(e)
    areasObj[area].doctors[e.ref_doctor].income+=e.amount
    areasObj[area].doctors[e.ref_doctor].commission+=getComm(e)
    areasObj[area].doctors[e.ref_doctor].count+=1
    if(e.patient_name&&!areasObj[area].patientNames.includes(e.patient_name))areasObj[area].patientNames.push(e.patient_name)
  })
  const areaList=Object.values(areasObj).sort((a,b)=>b.total-a.total)
  const grandTotal=areaList.reduce((a,r)=>a+r.total,0)
  const grandComm=areaList.reduce((a,r)=>a+r.commission,0)
  return(<>
    <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
      {[{k:'month',l:'Month'},{k:'year',l:'Year'},{k:'custom',l:'Custom'}].map(v=>(<button key={v.k} onClick={()=>setAPer(v.k)} style={{padding:'6px 14px',borderRadius:20,border:aPer===v.k?'none':'1px solid #e5e7eb',background:aPer===v.k?'#111':'none',color:aPer===v.k?'#fff':'#888',fontSize:12,fontWeight:600,cursor:'pointer'}}>{v.l}</button>))}
    </div>
    {aPer==='month'&&<input style={{...S.inp,marginBottom:12}} type="month" value={rm} onChange={e=>setRm(e.target.value)}/>}
    {aPer==='year'&&<select style={{...S.sel,marginBottom:12}} value={ry} onChange={e=>setRy(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>}
    {aPer==='custom'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}><FInp label="From" type="date" value={aFrom} onChange={e=>setAFrom(e.target.value)}/><FInp label="To" type="date" value={aTo} onChange={e=>setATo(e.target.value)}/></div>}
    {!areaList.length&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No referral data for this period.<br/>Add area to doctors in Ref Doctors tab first.</div>}
    {areaList.length>0&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:14}}>
      {[{l:'Areas',v:areaList.length,c:'#1d4ed8'},{l:'Total income',v:fmt(grandTotal),c:'#16a34a'},{l:'Real income',v:fmt(grandTotal-grandComm),c:'#065f46'}].map((m,i)=>(<div key={i} style={{background:'#f9f9f9',borderRadius:10,padding:'10px 14px',textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>{m.l}</div><div style={{fontSize:15,fontWeight:800,color:m.c}}>{m.v}</div></div>))}
    </div>}
    {areaList.map(ar=>(
      <Card key={ar.area} style={{marginBottom:12,borderLeft:'3px solid #1d4ed8'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
          <div>
            <div style={{fontSize:16,fontWeight:800,color:'#1d4ed8'}}>{ar.area}</div>
            <div style={{fontSize:12,color:'#aaa',marginTop:2}}>{Object.keys(ar.doctors).length} doctor{Object.keys(ar.doctors).length!==1?'s':''} - {ar.patientNames.length} patient{ar.patientNames.length!==1?'s':''}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:20,fontWeight:800,color:'#16a34a'}}>{fmt(ar.total)}</div>
            <div style={{fontSize:11,color:'#c2410c'}}>comm: {fmt(ar.commission)}</div>
            <div style={{fontSize:11,color:'#1d4ed8',fontWeight:700}}>real: {fmt(ar.total-ar.commission)}</div>
          </div>
        </div>
        <div style={{borderTop:'1px solid #f0f0f0',paddingTop:8}}>
          {Object.values(ar.doctors).sort((a,b)=>b.income-a.income).map(doc=>(
            <div key={doc.name} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid #f9f9f9'}}>
              <div><div style={{fontSize:13,fontWeight:600}}>Dr. {doc.name}</div><div style={{fontSize:11,color:'#aaa'}}>{doc.count} entr{doc.count!==1?'ies':'y'}</div></div>
              <div style={{textAlign:'right'}}><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(doc.income)}</div><div style={{fontSize:11,color:'#c2410c'}}>-{fmt(doc.commission)} comm</div></div>
            </div>
          ))}
        </div>
      </Card>
    ))}
  </>)
}


const TimelinePatientList=({db,onSelect,search,setSearch})=>{
  const all=db.ip_patients.slice().sort((a,b)=>(b.admission_date||'').localeCompare(a.admission_date||''))
  const filtered=search.trim()?all.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||p.reg_no?.toLowerCase().includes(search.toLowerCase())||p.phone?.includes(search)):all
  return(<div>
    <div style={{position:'relative',marginBottom:12}}>
      <svg style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}} width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="8" stroke="#94a3b8" strokeWidth="2"/><path d="m21 21-4.35-4.35" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round"/></svg>
      <input style={{...S.inp,paddingLeft:36}} placeholder="Search patient by name, reg no, phone..." value={search} onChange={e=>setSearch(e.target.value)} autoCorrect="off" autoCapitalize="none"/>
      {search&&<button onClick={()=>setSearch('')} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',fontSize:18,color:'#aaa',cursor:'pointer'}}>x</button>}
    </div>
    {search&&<div style={{fontSize:12,color:'#94a3b8',marginBottom:8}}>{filtered.length} result{filtered.length!==1?'s':''} for "{search}"</div>}
    {filtered.length===0&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>{search?'No patients found for "'+search+'"':'No patients yet'}</div>}
    <Card>
      {filtered.map(p=>{const ents=db.income.filter(e=>e.patient_id===p.id);const total=ents.reduce((a,e)=>a+e.amount,0);return(
        <Row key={p.id}
          onClick={()=>onSelect(p.id)}
          left={<div><div style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>{p.name}{p.is_package&&<Pill label="Pkg" bg="#dbeafe" tx="#1d4ed8"/>}</div>{p.reg_no&&<div style={{fontSize:11,color:'#1d4ed8',fontWeight:600}}>Reg: {p.reg_no}</div>}{p.phone&&<div style={{fontSize:11,color:'#94a3b8'}}>Ph: {p.phone}</div>}</div>}
          sub={fmtD(p.admission_date)+(p.discharge_date?' to '+fmtD(p.discharge_date):' - Active')+(p.ref_doctor?' - Ref: '+p.ref_doctor:'')}
          right={<div style={{textAlign:'right'}}><div style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>{fmt(total)}</div>{p.ref_doctor&&<div style={{fontSize:10,color:'#d97706'}}>Ref: {p.ref_doctor}</div>}{!p.discharge_date&&<Pill label="Active" bg="#dcfce7" tx="#16a34a"/>}</div>}
        />
      )})}
    </Card>
  </div>)
}


/*  DAILY DETAIL REPORT  */
const DailyDetailReport=({db,rd,setRd,allPaidComm,rm,setRm,ry,setRy,yrs,actions,gotoIP,gotoTimeline,gotoOP})=>{
  const dI=db.income.filter(e=>e.date===rd)
  const dExpAll=db.expenses.filter(e=>e.date===rd&&e.category!=='ref_paid')
  const dExpNonLab=dExpAll.filter(e=>e.category!=='lab_to_lab')
  const dExpLab=dExpAll.filter(e=>e.category==='lab_to_lab')

  const ipMap={}
  db.ip_patients.forEach(p=>{ipMap[p.id]=p})

  // OP Consultation grouped
  const opByPat={}
  dI.filter(e=>e.type==='op').forEach(e=>{
    const k=(e.patient_name||'Unknown').trim().toLowerCase()
    if(!opByPat[k])opByPat[k]={name:(e.patient_name||'Unknown').trim(),pid:e.patient_id,entries:[]}
    opByPat[k].entries.push(e)
  })

  // VC grouped by patient
  const vcByPat={}
  dI.filter(e=>e.type==='vc').forEach(e=>{
    const k=(e.patient_name||'Unknown').trim().toLowerCase()
    if(!vcByPat[k])vcByPat[k]={name:(e.patient_name||'Unknown').trim(),pid:e.patient_id,entries:[]}
    vcByPat[k].entries.push(e)
  })

  // OP Pharmacy grouped
  const oprByPat={}
  dI.filter(e=>e.type==='op_r').forEach(e=>{
    const k=(e.patient_name||'Unknown').trim().toLowerCase()
    if(!oprByPat[k])oprByPat[k]={name:(e.patient_name||'Unknown').trim(),pid:e.patient_id,entries:[]}
    oprByPat[k].entries.push(e)
  })

  // IP grouped
  const ipByPat={}
  dI.filter(e=>['ip','ip_r'].includes(e.type)).forEach(e=>{
    const k=e.patient_id||e.patient_name||'?'
    if(!ipByPat[k])ipByPat[k]={id:e.patient_id,name:(e.patient_name||'Unknown').trim(),ip:0,ip_r:0,ref:''}
    if(e.type==='ip')ipByPat[k].ip+=e.amount
    if(e.type==='ip_r')ipByPat[k].ip_r+=e.amount
    if(e.ref_doctor&&!ipByPat[k].ref)ipByPat[k].ref=e.ref_doctor
  })

  // Lab grouped
  const opLabByPat={}
  dI.filter(e=>e.type==='op_l').forEach(e=>{
    const k=(e.patient_name||'Unknown').trim().toLowerCase()
    if(!opLabByPat[k])opLabByPat[k]={name:(e.patient_name||'Unknown').trim(),pid:e.patient_id,ref:e.ref_doctor||'',amount:0}
    opLabByPat[k].amount+=e.amount
    if(e.ref_doctor&&!opLabByPat[k].ref)opLabByPat[k].ref=e.ref_doctor
  })
  const ipLabByPat={}
  dI.filter(e=>e.type==='ip_l').forEach(e=>{
    const k=e.patient_id||(e.patient_name||'Unknown').trim().toLowerCase()
    if(!ipLabByPat[k])ipLabByPat[k]={name:(e.patient_name||'Unknown').trim(),pid:e.patient_id,ref:e.ref_doctor||'',amount:0}
    ipLabByPat[k].amount+=e.amount
    if(e.ref_doctor&&!ipLabByPat[k].ref)ipLabByPat[k].ref=e.ref_doctor
  })
  const opLabEnts=Object.values(opLabByPat)
  const ipLabEnts=Object.values(ipLabByPat)

  // Totals
  const opInc=dI.filter(e=>e.type==='op').reduce((a,e)=>a+e.amount,0)
  const opComm=dI.filter(e=>e.type==='op').reduce((a,e)=>a+getComm(e),0)
  const vcInc=dI.filter(e=>e.type==='vc').reduce((a,e)=>a+e.amount,0)
  const vcConsFee=dI.filter(e=>e.type==='vc').reduce((a,e)=>a+(e.consultant_fee||0),0)
  const vcProfit=vcInc-vcConsFee  // hospital keeps gross minus consultant's share
  const oprInc=dI.filter(e=>e.type==='op_r').reduce((a,e)=>a+e.amount,0)
  const oprComm=dI.filter(e=>e.type==='op_r').reduce((a,e)=>a+getComm(e),0)
  const ipEnts=dI.filter(e=>['ip','ip_r'].includes(e.type))
  const ipInc=ipEnts.reduce((a,e)=>a+e.amount,0)
  const ipComm=ipEnts.reduce((a,e)=>a+getComm(e),0)
  const labInc=opLabEnts.reduce((a,e)=>a+e.amount,0)+ipLabEnts.reduce((a,e)=>a+e.amount,0)
  const labRawEnts=dI.filter(e=>['op_l','ip_l'].includes(e.type))
  const labComm=labRawEnts.reduce((a,e)=>a+getComm(e),0)
  const labToLab=dExpLab.reduce((a,e)=>a+e.amount,0)
  const labActual=labInc-labComm-labToLab

  // OP+IP segment: (op+vc profit to hospital+op_r+ip+ip_r) - (non-lab expenses)
  const opIpInc=opInc+vcProfit+oprInc+ipInc
  const opIpComm=opComm+oprComm+ipComm
  const nonLabExpTotal=dExpNonLab.reduce((a,e)=>a+e.amount,0)
  const opIpActual=opIpInc-opIpComm-nonLabExpTotal

  const R=({l,v,bold,red,green,sub})=>(<div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'6px 0',borderBottom:'1px solid #f5f5f5'}}>
    <div><span style={{fontSize:13,color:'#374151',fontWeight:bold?700:400}}>{l}</span>{sub&&<div style={{fontSize:10,color:'#94a3b8',marginTop:1}}>{sub}</div>}</div>
    <span style={{fontSize:13,fontWeight:bold?800:600,color:red?'#dc2626':green?'#16a34a':'#0f172a',flexShrink:0,marginLeft:8}}>{v}</span>
  </div>)

  const NameBtn=({name,pid,isIP})=>{
    const ipPat=pid?ipMap[pid]:db.ip_patients.find(p=>p.name.trim().toLowerCase()===name.trim().toLowerCase())
    const click=()=>{if(isIP&&gotoIP&&ipPat){gotoIP(ipPat.id,'rep')}else if(!isIP&&gotoOP){gotoOP(name,'rep')}}
    const canNav=isIP?(!!gotoIP&&!!ipPat):(!!gotoOP)
    return(<button onClick={canNav?click:undefined} style={{fontSize:13,fontWeight:700,color:isIP?'#2563eb':'#1d4ed8',background:'none',border:'none',cursor:canNav?'pointer':'default',padding:0,textAlign:'left',textDecoration:canNav?'underline':'none',textDecorationColor:'rgba(37,99,235,0.3)'}}>{name}</button>)
  }

  return(<>
    <div style={{display:'flex',gap:8,marginBottom:14}}>
      <input style={{...S.inp,flex:1}} type="date" value={rd} onChange={e=>setRd(e.target.value)}/>
      <GBtn onClick={()=>setRd(todayStr())}>Today</GBtn>
    </div>

    {/* OP CONSULTATION */}
    <SecL>OP Consultation</SecL>
    {Object.keys(opByPat).length===0
      ?<div style={{color:'#ccc',fontSize:13,padding:'8px 0',marginBottom:8}}>No OP consultations</div>
      :<Card>
        {Object.values(opByPat).map(pat=>{
          const total=pat.entries.reduce((a,e)=>a+e.amount,0)
          const consFee=pat.entries.reduce((a,e)=>a+(e.consultant_fee||0),0)
          const consName=pat.entries.find(e=>e.consultant_name)?.consultant_name
          const ref=pat.entries.find(e=>e.ref_doctor)?.ref_doctor
          return(<div key={pat.name} style={{padding:'9px 0',borderBottom:'1px solid #f5f5f5'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div style={{flex:1}}><NameBtn name={pat.name} pid={pat.pid} isIP={false}/>
                {ref&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>Ref: {ref}</div>}
                {consFee>0&&<div style={{fontSize:11,color:'#7c3aed',marginTop:2}}>Cons fee: {fmt(consFee)}{consName?' ('+consName+')':''}</div>}
              </div>
              <div style={{textAlign:'right'}}><div style={{fontSize:14,fontWeight:700,color:'#16a34a'}}>{fmt(total)}</div><TypeTag t="op"/></div>
            </div>
          </div>)
        })}
        <R l="OP Consultation Total" v={fmt(opInc)} bold green/>
      </Card>}

    {/* VC CONSULTATION */}
    <SecL>Visiting Consultant (VC)</SecL>
    {Object.keys(vcByPat).length===0
      ?<div style={{color:'#ccc',fontSize:13,padding:'8px 0',marginBottom:8}}>No VC consultations</div>
      :<Card>
        {Object.values(vcByPat).map(pat=>{
          const total=pat.entries.reduce((a,e)=>a+e.amount,0)
          const consFee=pat.entries.reduce((a,e)=>a+(e.consultant_fee||0),0)
          const consName=pat.entries.find(e=>e.consultant_name)?.consultant_name
          const profit=total-consFee
          return(<div key={pat.name} style={{padding:'9px 0',borderBottom:'1px solid #f5f5f5'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div style={{flex:1}}><NameBtn name={pat.name} pid={pat.pid} isIP={false}/>
                {consName&&<div style={{fontSize:11,color:'#7c3aed',marginTop:2}}>Consultant: {consName} - Fee paid: {fmt(consFee)}</div>}
                <div style={{fontSize:11,color:'#16a34a',marginTop:2}}>Hospital profit: {fmt(profit)}</div>
              </div>
              <div style={{textAlign:'right'}}><div style={{fontSize:14,fontWeight:700,color:'#16a34a'}}>{fmt(total)}</div><TypeTag t="vc"/></div>
            </div>
          </div>)
        })}
        <R l="VC Total collected" v={fmt(vcInc)} bold/>
        <R l="Consultant fees paid out" v={'- '+fmt(vcConsFee)} red/>
        <R l="Hospital profit from VC" v={fmt(vcProfit)} bold green/>
      </Card>}

    {/* OP PHARMACY */}
    <SecL>OP Pharmacy</SecL>
    {Object.keys(oprByPat).length===0
      ?<div style={{color:'#ccc',fontSize:13,padding:'8px 0',marginBottom:8}}>No OP pharmacy</div>
      :<Card>
        {Object.values(oprByPat).map(pat=>{
          const total=pat.entries.reduce((a,e)=>a+e.amount,0)
          const ref=pat.entries.find(e=>e.ref_doctor)?.ref_doctor
          return(<div key={pat.name} style={{padding:'9px 0',borderBottom:'1px solid #f5f5f5'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div><NameBtn name={pat.name} pid={pat.pid} isIP={false}/>{ref&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>Ref: {ref}</div>}</div>
              <div style={{textAlign:'right'}}><div style={{fontSize:14,fontWeight:700,color:'#16a34a'}}>{fmt(total)}</div><TypeTag t="op_r"/></div>
            </div>
          </div>)
        })}
        <R l="OP Pharmacy Total" v={fmt(oprInc)} bold green/>
      </Card>}

    {/* IP PATIENTS */}
    <SecL>IP Patients</SecL>
    {Object.keys(ipByPat).length===0
      ?<div style={{color:'#ccc',fontSize:13,padding:'8px 0',marginBottom:8}}>No IP entries today</div>
      :<Card>
        {Object.values(ipByPat).map(pat=>(<div key={pat.id||pat.name} style={{padding:'9px 0',borderBottom:'1px solid #f5f5f5'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{flex:1}}><NameBtn name={pat.name} pid={pat.id} isIP={true}/>
              <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:4}}>
                {pat.ip>0&&<span style={{fontSize:11,color:'#2563eb',fontWeight:600}}>IP Charges: {fmt(pat.ip)}</span>}
                {pat.ip_r>0&&<span style={{fontSize:11,color:'#16a34a',fontWeight:600}}>IP Pharmacy: {fmt(pat.ip_r)}</span>}
              </div>
              {pat.ref&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>Ref: {pat.ref}</div>}
            </div>
            <div style={{textAlign:'right'}}><div style={{fontSize:14,fontWeight:700,color:'#16a34a'}}>{fmt(pat.ip+pat.ip_r)}</div></div>
          </div>
        </div>))}
        <R l="IP Total" v={fmt(ipInc)} bold green/>
      </Card>}

    {/* LAB */}
    <SecL>Lab Income</SecL>
    {opLabEnts.length===0&&ipLabEnts.length===0
      ?<div style={{color:'#ccc',fontSize:13,padding:'8px 0',marginBottom:8}}>No lab entries today</div>
      :<Card>
        {opLabEnts.length>0&&<div style={{marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:700,color:'#6366f1',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>OP Lab</div>
          {opLabEnts.map((e,i)=>(<div key={e.name+i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f5f5f5'}}>
            <div><NameBtn name={e.name} pid={e.pid} isIP={false}/>{e.ref&&<div style={{fontSize:11,color:'#d97706'}}>Ref: {e.ref}</div>}</div>
            <div style={{textAlign:'right'}}><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(e.amount)}</div><TypeTag t="op_l"/></div>
          </div>))}
          <R l="OP Lab subtotal" v={fmt(opLabEnts.reduce((a,e)=>a+e.amount,0))} bold/>
        </div>}
        {ipLabEnts.length>0&&<div>
          <div style={{fontSize:11,fontWeight:700,color:'#7c3aed',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>IP Lab</div>
          {ipLabEnts.map((e,i)=>(<div key={e.name+i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f5f5f5'}}>
            <div><NameBtn name={e.name} pid={e.pid} isIP={true}/>{e.ref&&<div style={{fontSize:11,color:'#d97706'}}>Ref: {e.ref}</div>}</div>
            <div style={{textAlign:'right'}}><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(e.amount)}</div><TypeTag t="ip_l"/></div>
          </div>))}
          <R l="IP Lab subtotal" v={fmt(ipLabEnts.reduce((a,e)=>a+e.amount,0))} bold/>
        </div>}
        <R l="Lab Total" v={fmt(labInc)} bold green/>
      </Card>}

    {/* EXPENSES - split OP/IP and Lab */}
    <SecL>OP and IP Expenses</SecL>
    {dExpNonLab.length===0
      ?<div style={{color:'#ccc',fontSize:13,padding:'8px 0',marginBottom:8}}>No OP/IP expenses today</div>
      :<Card>
        {dExpNonLab.map((e,i)=>(<div key={e.id||i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid #f5f5f5'}}>
          <div><div style={{fontSize:13,color:'#0f172a',fontWeight:600,textTransform:'capitalize'}}>{(e.category||'misc').replace(/_/g,' ')}</div>{e.description&&<div style={{fontSize:11,color:'#94a3b8'}}>{e.description}</div>}</div>
          <div style={{fontSize:13,fontWeight:700,color:'#dc2626'}}>{fmt(e.amount)}</div>
        </div>))}
        <R l="Total OP/IP Expenses" v={fmt(nonLabExpTotal)} bold red/>
      </Card>}

    <SecL>Lab Expenses (Lab to Lab)</SecL>
    {dExpLab.length===0
      ?<div style={{color:'#ccc',fontSize:13,padding:'8px 0',marginBottom:8}}>No lab-to-lab expenses today</div>
      :<Card>
        {dExpLab.map((e,i)=>(<div key={e.id||i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid #f5f5f5'}}>
          <div><div style={{fontSize:13,color:'#0f172a',fontWeight:600}}>Lab to lab</div>{e.description&&<div style={{fontSize:11,color:'#94a3b8'}}>{e.description}</div>}</div>
          <div style={{fontSize:13,fontWeight:700,color:'#dc2626'}}>{fmt(e.amount)}</div>
        </div>))}
        <R l="Total Lab Expenses" v={fmt(labToLab)} bold red/>
      </Card>}

    {/* SEGMENT BREAKDOWN - only 2 cards */}
    <SecL>Segment breakdown</SecL>
    <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:16}}>
      {/* OP and IP Income */}
      <div style={{background:'#f0f9ff',border:'1px solid #bae6fd',borderRadius:14,padding:'16px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:'#0369a1'}}>OP and IP Income</div>
            <div style={{fontSize:10,color:'#7dd3fc',marginTop:2,lineHeight:1.5}}>OP + VC hospital profit + OP Pharmacy + IP Charges + IP Pharmacy{}minus all expenses except lab to lab</div>
          </div>
          <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
            <div style={{fontSize:10,color:'#7dd3fc'}}>Actual income</div>
            <div style={{fontSize:22,fontWeight:800,color:opIpActual>=0?'#0369a1':'#dc2626'}}>{fmt(opIpActual)}</div>
          </div>
        </div>
        <div style={{background:'rgba(255,255,255,0.8)',borderRadius:10,padding:'10px 12px',display:'flex',flexDirection:'column',gap:5}}>
          {opInc>0&&<R l="OP Consultation" v={fmt(opInc)} green/>}
          {vcProfit>0&&<R l="VC hospital profit" v={fmt(vcProfit)} green sub={'Collected '+fmt(vcInc)+' - Cons fee '+fmt(vcConsFee)}/>}
          {oprInc>0&&<R l="OP Pharmacy" v={fmt(oprInc)} green/>}
          {ipInc>0&&<R l="IP Charges + Pharmacy" v={fmt(ipInc)} green/>}
          {(opComm+oprComm+ipComm)>0&&<R l="Ref commissions" v={'- '+fmt(opComm+oprComm+ipComm)} red/>}
          {dExpNonLab.map((e,i)=>(<R key={i} l={(e.category||'misc').replace(/_/g,' ')} v={'- '+fmt(e.amount)} red/>))}
          <div style={{height:1,background:'#bae6fd'}}/>
          <R l="= Actual income" v={fmt(opIpActual)} bold/>
        </div>
      </div>
      {/* Laboratory */}
      <div style={{background:'#fdf4ff',border:'1px solid #e9d5ff',borderRadius:14,padding:'16px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}>
          <div>
            <div style={{fontSize:13,fontWeight:700,color:'#7c3aed'}}>Laboratory</div>
            <div style={{fontSize:10,color:'#c4b5fd',marginTop:2}}>OP-Lab + IP-Lab minus lab-to-lab expenses</div>
          </div>
          <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
            <div style={{fontSize:10,color:'#c4b5fd'}}>Actual income</div>
            <div style={{fontSize:22,fontWeight:800,color:labActual>=0?'#7c3aed':'#dc2626'}}>{fmt(labActual)}</div>
          </div>
        </div>
        <div style={{background:'rgba(255,255,255,0.8)',borderRadius:10,padding:'10px 12px',display:'flex',flexDirection:'column',gap:5}}>
          <R l="Lab income (OP-Lab + IP-Lab)" v={fmt(labInc)} green/>
          <R l="Ref commissions" v={'- '+fmt(labComm)} red/>
          {labToLab>0&&<R l="Lab to lab expenses" v={'- '+fmt(labToLab)} red/>}
          <div style={{height:1,background:'#e9d5ff'}}/>
          <R l="= Actual income" v={fmt(labActual)} bold/>
        </div>
      </div>
    </div>
    <SecL>Doctor referrals</SecL>
    <ReferralsReport db={db} income={dI} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs} actions={actions}/>
  </>)
}


const RepTab=({db,rv,setRv,rd,setRd,rm,setRm,ry,setRy,gotoIP,gotoOP,actions})=>{
  const [timelinePid,setTimelinePid]=useState(null)
  const [timelineSelPid,setTimelineSelPid]=useState('')
  const [timelineSearch,setTimelineSearch]=useState('')
  const [vcPer,setVcPer]=useState('month')
  const [customFrom,setCustomFrom]=useState(todayStr().slice(0,7)+'-01')
  const [customTo,setCustomTo]=useState(todayStr())
  const yrs=[...new Set([...db.income,...db.expenses].map(e=>e.date?.slice(0,4)))].filter(Boolean).sort().reverse()
  if(!yrs.includes(ry))yrs.unshift(ry)
  const allPaidComm=useMemo(()=>db.expenses.filter(e=>e.category==='ref_paid'),[db.expenses])
  const RVTABS=[{k:'daily',l:'Daily'},{k:'monthly',l:'Monthly'},{k:'yearly',l:'Yearly'},{k:'custom',l:'Custom'},{k:'referrals',l:'Referrals'},{k:'patlist',l:'Pat List'},{k:'timeline',l:'Timeline'},{k:'expenses',l:'Expenses'},{k:'realincome',l:'Real Income'},{k:'area',l:'Area-wise'}]
  const PLCards=({incList,exp,refComm,pkgList=[]})=>{
    const cash=cashTotal(incList);const credit=credTotal(incList);const pkgTotal=pkgList.reduce((a,py)=>a+py.amount,0);const pkgComm=pkgList.reduce((a,py)=>a+(py.commission||0),0);const vcFees=incList.filter(e=>e.type==='vc').reduce((a,e)=>a+(e.consultant_fee||0),0);const net=cash+pkgTotal-exp.total-refComm-pkgComm-vcFees
    return(<div style={{marginBottom:12}}>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
        <div style={{background:'#f0fdf4',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Cash collected</div><div style={{fontSize:18,fontWeight:700,color:'#15803d'}}>{fmt(cash)}</div></div>
        <div style={{background:credit>0?'#fff7ed':'#f9f9f9',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:credit>0?'#92400e':'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Credit given</div><div style={{fontSize:18,fontWeight:700,color:credit>0?'#c2410c':'#ccc'}}>{fmt(credit)}</div></div>
        <div style={{background:'#dbeafe',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#1d4ed8',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Package</div><div style={{fontSize:18,fontWeight:700,color:'#1d4ed8'}}>{fmt(pkgTotal)}</div></div>
        <div style={{background:'#f9f9f9',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Expenses</div><div style={{fontSize:18,fontWeight:700,color:'#ef4444'}}>{fmt(exp.total+refComm+pkgComm+vcFees)}</div></div>
      </div>
      <div style={{background:net>=0?'#f0fdf4':'#fef2f2',borderRadius:12,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontSize:11,color:net>=0?'#15803d':'#dc2626',fontWeight:700,textTransform:'uppercase'}}>Net cash profit</div></div>
        <div style={{fontSize:24,fontWeight:800,color:net>=0?'#15803d':'#dc2626'}}>{net>=0?'+':''}{fmt(net)}</div>
      </div>
    </div>)
  }
  const IncT=({incList})=>{const inc=sumInc(incList);return(<Card>{ITYPES.filter(t=>inc[t.key]>0).map(t=>{const cash=cashTotal(incList.filter(e=>e.type===t.key));const cred=credTotal(incList.filter(e=>e.type===t.key));return<Row key={t.key} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={t.key}/>{t.full}</span>} sub={'Cash: '+fmt(cash)+(cred>0?' - Credit: '+fmt(cred):'')} right={<span style={{color:'#16a34a',fontWeight:600}}>{fmt(inc[t.key])}</span>}/>})}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total billed</span><span>{fmt(inc.total)}</span></div></Card>)}
  const ExpT=({exp})=>{if(exp.total===0)return<div style={{textAlign:'center',padding:'12px 0',color:'#ccc',fontSize:13}}>No expenses</div>;return<Card>{ECATS.filter(c=>exp[c.key]>0).map(c=><Row key={c.key} left={c.label} right={<span style={{color:'#ef4444',fontWeight:600}}>{fmt(exp[c.key])}</span>}/>)}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total expenses</span><span>{fmt(exp.total)}</span></div></Card>}
  return(
    <div>
      <div style={{display:'flex',gap:6,marginBottom:16,overflowX:'auto',paddingBottom:4}}>
        {RVTABS.map(v=>(<button key={v.k} onClick={()=>setRv(v.k)} style={{flexShrink:0,padding:'7px 14px',borderRadius:20,border:rv===v.k?'none':'1.5px solid #e2e8f0',background:rv===v.k?'linear-gradient(135deg,#d97706,#f59e0b)':'#fff',color:rv===v.k?'#fff':'#64748b',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:rv===v.k?'0 4px 12px rgba(217,119,6,0.3)':'none',transition:'all .15s'}}>{v.l}</button>))}
      </div>
      {rv==='daily'&&<DailyDetailReport db={db} rd={rd} setRd={setRd} allPaidComm={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs} actions={actions} gotoIP={pid=>gotoIP(pid,'rep')} gotoTimeline={pid=>{setTimelineSelPid(pid);setRv('timeline')}} gotoOP={gotoOP}/>}
      {rv==='monthly'&&(()=>{const mI=db.income.filter(e=>e.date?.startsWith(rm));const mE=db.expenses.filter(e=>e.date?.startsWith(rm)&&e.category!=='ref_paid');const exp=sumExp(mE);const rc=totalRef(mI);const pkg=getPkgPayments(db.ip_patients,rm);const days=[...new Set(mI.map(e=>e.date))].sort();const[yr,mo]=rm.split('-');return(<><input style={{...S.inp,marginBottom:12}} type="month" value={rm} onChange={e=>setRm(e.target.value)}/><div style={{fontSize:14,fontWeight:600,color:'#555',margin:'0 0 14px'}}>{MOFULL[parseInt(mo)-1]} {yr}</div><PLCards incList={mI} exp={exp} refComm={rc} pkgList={pkg}/>{days.length>0&&<VBarChart title="Daily revenue trend" data={days.map(d=>{const dI=db.income.filter(e=>e.date===d);return{label:d.slice(8),v1:cashTotal(dI),color:'#16a34a'}})}/>}<SecL>Income by source</SecL><IncT incList={mI}/><SecL>Expenses</SecL><ExpT exp={exp}/><SecL>Referrals</SecL><ReferralsReport db={db} income={mI} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs} actions={actions}/></>)})()}
      {rv==='yearly'&&(()=>{const yI=db.income.filter(e=>e.date?.startsWith(ry));const yE=db.expenses.filter(e=>e.date?.startsWith(ry)&&e.category!=='ref_paid');const exp=sumExp(yE);const rc=totalRef(yI);const mons=[...new Set(yI.map(e=>e.date?.slice(0,7)))].sort();return(<><select style={{...S.sel,marginBottom:12}} value={ry} onChange={e=>setRy(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select><PLCards incList={yI} exp={exp} refComm={rc} pkgList={getPkgPayments(db.ip_patients,ry)}/>{mons.length>0&&<VBarChart title="Monthly revenue vs expenses" data={mons.map(ym=>{const mi=db.income.filter(e=>e.date?.startsWith(ym));const me=db.expenses.filter(e=>e.date?.startsWith(ym)&&e.category!=='ref_paid').reduce((a,e)=>a+e.amount,0);const[,m]=ym.split('-');return{label:MOS[parseInt(m)-1],v1:cashTotal(mi),v2:me,color:'#16a34a'}})}/>}<SecL>Income by source</SecL><IncT incList={yI}/><SecL>Referrals</SecL><ReferralsReport db={db} income={yI} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs} actions={actions}/></>)})()}
      {rv==='custom'&&(()=>{const incList=db.income.filter(e=>e.date>=customFrom&&e.date<=customTo);const expList=db.expenses.filter(e=>e.date>=customFrom&&e.date<=customTo&&e.category!=='ref_paid');const exp=sumExp(expList);const rc=totalRef(incList);const pkg=getPkgPayments(db.ip_patients,null).filter(py=>py.date>=customFrom&&py.date<=customTo);return(<><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}><FInp label="From" type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/><FInp label="To" type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}/></div><PLCards incList={incList} exp={exp} refComm={rc} pkgList={pkg}/><SecL>Income by source</SecL><IncT incList={incList}/><SecL>Expenses</SecL><ExpT exp={exp}/><SecL>Referrals</SecL><ReferralsReport db={db} income={incList} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs} actions={actions}/></>)})()}
      {rv==='referrals'&&<ReferralsReport db={db} income={db.income} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs} actions={actions}/>}
      {rv==='patlist'&&(timelinePid?<PatientTimeline db={db} pid={timelinePid} onBack={()=>setTimelinePid(null)}/>:<PatientListReport db={db} gotoTimeline={pid=>setTimelinePid(pid)}/>)}
      {rv==='timeline'&&(timelineSelPid?<PatientTimeline db={db} pid={timelineSelPid} onBack={()=>{setTimelineSelPid('');setTimelineSearch('')}}/>:
          <TimelinePatientList db={db} onSelect={pid=>setTimelineSelPid(pid)} search={timelineSearch} setSearch={setTimelineSearch}/>
        )}
      {rv==='expenses'&&<ExpensesReport db={db}/>}
      {rv==='realincome'&&<RealIncomeReport db={db}/>}
      {rv==='area'&&<AreaReport db={db} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs}/>}
    </div>
  )
}

/*  MAIN APP  */
export default function App(){
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [hospital,setHospital]=useState(null)
  const [isSuperAdmin,setIsSuperAdmin]=useState(false)
  const [previewHospital,setPreviewHospital]=useState(null)  // {hospital, db} - super admin preview mode
  const [editIPPatient,setEditIPPatient]=useState(null)
  const [showRegister,setShowRegister]=useState(false)
  const [showPayment,setShowPayment]=useState(()=>new URLSearchParams(window.location.search).get('upgrade')==='true'||sessionStorage.getItem('pendingUpgrade')==='1')
  const [loading,setLoading]=useState(true)
  const [db,setDb]=useState({income:[],expenses:[],ip_patients:[],ref_doctors:[],consultants:[]})
  const [dbLoading,setDbLoading]=useState(false)
  const [tab,setTab]=useState('dash')
  const [tabInitialized,setTabInitialized]=useState(false)
  const [eDate,setEDate]=useState(todayStr())
  const [itype,setItype]=useState('op')
  const [iF,setIF]=useState({amount:'',pid:'',pname:'',ref:'',pay:'cash',notes:'',consultant_fee:0,consultant_name:'',phone:'',op_type:'New OP',custom_commission:'',patient_area:''})
  const [ipv,setIpv]=useState('list')
  const [ipid,setIpid]=useState(null)
  const [pF,setPF]=useState({name:'',adm:todayStr(),dx:'',room:'',ref:'',is_package:false,phone:'',patient_type:'Regular',custom_commission:'',linkedRegNo:'',patient_area:''})
  const [cF,setCF]=useState({date:todayStr(),type:'ip',amt:'',pay:'cash',notes:''})
  const [pyF,setPyF]=useState({date:todayStr(),amt:'',pay:'cash'})
  const [exD,setExD]=useState(todayStr())
  const [exF,setExF]=useState({cat:'water',amt:'',desc:'',pay:'cash',mon:false})
  const [rv,setRv]=useState('daily')
  const [rd,setRd]=useState(todayStr())
  const [rm,setRm]=useState(todayStr().slice(0,7))
  const [ry,setRy]=useState(todayStr().slice(0,4))

  useEffect(()=>{
    const upgradeParam=new URLSearchParams(window.location.search).get('upgrade')==='true'||sessionStorage.getItem('pendingUpgrade')==='1'
    if(upgradeParam)sessionStorage.removeItem('pendingUpgrade')
    supabase.auth.getSession().then(({data:{session}})=>{setSession(session);setLoading(false);if(session&&upgradeParam)setShowPayment(true)})
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{setSession(session);if(!session){setProfile(null);setHospital(null);setIsSuperAdmin(false)};setLoading(false);if(session&&upgradeParam)setShowPayment(true)})
    return()=>subscription.unsubscribe()
  },[])

  useEffect(()=>{
    if(!session)return
    const init=async()=>{
      const {data:sa}=await supabase.from('super_admins').select('id').eq('id',session.user.id).maybeSingle()
      if(sa){setIsSuperAdmin(true);return}
      const {data:prof}=await supabase.from('profiles').select('*').eq('id',session.user.id).single()
      if(!prof?.hospital_id)return
      // Fetch hospital + all data in parallel (saves one round-trip)
      const [{data:hosp},[inc,exp,pts,rds,cons]]=await Promise.all([
        supabase.from('hospitals').select('*').eq('id',prof.hospital_id).single(),
        Promise.all([
          supabase.from('income').select('id,date,type,amount,patient_id,patient_name,payment,ref_doctor,notes,consultant_fee,consultant_name,op_type,custom_commission,reg_no,patient_area').eq('hospital_id',prof.hospital_id).order('date',{ascending:false}),
          supabase.from('expenses').select('id,date,category,amount,description,payment,is_monthly').eq('hospital_id',prof.hospital_id).order('date',{ascending:false}),
          supabase.from('ip_patients').select('*').eq('hospital_id',prof.hospital_id).order('admission_date',{ascending:false}),
          supabase.from('ref_doctors').select('*').eq('hospital_id',prof.hospital_id).order('name'),
          supabase.from('consultants').select('*').eq('hospital_id',prof.hospital_id).order('name')
        ])
      ])
      setProfile(prof)
      setHospital(hosp)
      if(hosp&&!hosp.is_active){alert('Hospital suspended. Contact support.');await supabase.auth.signOut();return}
      setDb({income:inc.data||[],expenses:exp.data||[],ip_patients:pts.data||[],ref_doctors:rds.data||[],consultants:cons.data||[]})
      // Set default tab based on role - admin/management open Reports
      if(!tabInitialized){
        const role=prof?.role
        if(role==='admin'||role==='management')setTab('rep')
        setTabInitialized(true)
      }
    }
    init()
  },[session])

  const actions={
    addIncome:async row=>{const hid=profile?.hospital_id;if(!hid){alert('Hospital not loaded yet, please wait and try again');return false}const {data,error}=await supabase.from('income').insert([{...row,hospital_id:hid}]).select();if(error){alert('Save failed: '+error.message);return false}if(data)setDb(d=>({...d,income:[data[0],...d.income]}));return true},
    delIncome:async id=>{await supabase.from('income').delete().eq('id',id);setDb(d=>({...d,income:d.income.filter(e=>e.id!==id)}))},
    editIncome:async row=>{
      const updates={amount:row.amount,ref_doctor:row.ref_doctor||'',payment:row.payment||'cash',notes:row.notes||'',date:row.date,op_type:row.op_type||'',custom_commission:row.custom_commission??null,consultant_fee:row.consultant_fee??null,consultant_name:row.consultant_name||'',patient_area:row.patient_area||''}
      const safe={amount:updates.amount,ref_doctor:updates.ref_doctor,payment:updates.payment,notes:updates.notes,date:updates.date}
      let {error}=await supabase.from('income').update(updates).eq('id',row.id)
      if(error){
        // Retry with core fields only (schema cache issue)
        const r2=await supabase.from('income').update(safe).eq('id',row.id)
        error=r2.error
      }
      if(error){alert('Could not save: '+error.message);return false}
      // Always update local state optimistically (works even if RLS blocks select)
      setDb(d=>({...d,income:d.income.map(e=>e.id===row.id?{...e,...safe}:e)}))
      return true
    },
    addExpense:async row=>{const hid=profile?.hospital_id;if(!hid){alert('Hospital not loaded, please wait');return false}const {data,error}=await supabase.from('expenses').insert([{...row,hospital_id:hid}]).select();if(error){alert('Save failed: '+error.message);return false}if(data)setDb(d=>({...d,expenses:[data[0],...d.expenses]}));return true},
    delExpense:async id=>{await supabase.from('expenses').delete().eq('id',id);setDb(d=>({...d,expenses:d.expenses.filter(e=>e.id!==id)}))},
    updateExpense:async(id,updates)=>{await supabase.from('expenses').update(updates).eq('id',id);setDb(d=>({...d,expenses:d.expenses.map(e=>e.id===id?{...e,...updates}:e)}))},
    admitPatient:async row=>{
      const hid=profile?.hospital_id;
      if(!hid){alert('Hospital not loaded, please wait a moment and try again');return false}
      const fullRow={...row,hospital_id:hid}
      let {data,error}=await supabase.from('ip_patients').insert([fullRow]).select()
      if(error&&(error.message?.includes('schema cache')||error.message?.includes('column'))){
        // Strip all optional/newer columns and retry with core fields only
        const safeRow={id:fullRow.id,hospital_id:hid,name:fullRow.name,admission_date:fullRow.admission_date,discharge_date:null,diagnosis:fullRow.diagnosis||'',room:fullRow.room||'',ref_doctor:fullRow.ref_doctor||'',is_package:fullRow.is_package||false}
        const r2=await supabase.from('ip_patients').insert([safeRow]).select()
        data=r2.data;error=r2.error
      }
      if(error){alert('Could not admit patient: '+error.message+'. Please run the SQL migrations in Supabase.');return false}
      if(data)setDb(d=>({...d,ip_patients:[data[0],...d.ip_patients]}))
      return true
    },
    dischargePatient:async id=>{const {data}=await supabase.from('ip_patients').update({discharge_date:todayStr()}).eq('id',id).select();if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(p=>p.id===id?data[0]:p)}))},
    addPayment:async(pid,payment)=>{const p=db.ip_patients.find(x=>x.id===pid);const np=[...(p.payments||[]),payment];const {data}=await supabase.from('ip_patients').update({payments:np}).eq('id',pid).select();if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(x=>x.id===pid?data[0]:x)}))},
    deletePayment:async(pid,payid)=>{const p=db.ip_patients.find(x=>x.id===pid);const np=(p.payments||[]).filter(py=>py.id!==payid);const {data}=await supabase.from('ip_patients').update({payments:np}).eq('id',pid).select();if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(x=>x.id===pid?data[0]:x)}))},
    deletePatient:async id=>{await supabase.from('income').delete().eq('patient_id',id);await supabase.from('ip_patients').delete().eq('id',id);setDb(d=>({...d,ip_patients:d.ip_patients.filter(p=>p.id!==id),income:d.income.filter(e=>e.patient_id!==id)}))},
    addRefDoctor:async form=>{const hid=profile?.hospital_id;const {data,error}=await supabase.from('ref_doctors').insert([{...form,hospital_id:hid}]).select();if(error){alert('Save failed: '+error.message);return}if(data)setDb(d=>({...d,ref_doctors:[...d.ref_doctors,data[0]].sort((a,b)=>a.name.localeCompare(b.name))}))},
    updateRefDoctor:async(id,form)=>{const {data,error}=await supabase.from('ref_doctors').update(form).eq('id',id).select();if(error){alert('Update failed: '+error.message);return}if(data)setDb(d=>({...d,ref_doctors:d.ref_doctors.map(r=>r.id===id?data[0]:r)}))},
    deleteRefDoctor:async id=>{await supabase.from('ref_doctors').delete().eq('id',id);setDb(d=>({...d,ref_doctors:d.ref_doctors.filter(r=>r.id!==id)}))},
    addConsultant:async form=>{const hid=profile?.hospital_id;const {data,error}=await supabase.from('consultants').insert([{...form,hospital_id:hid}]).select();if(error){alert('Save failed: '+error.message);return}if(data)setDb(d=>({...d,consultants:[...d.consultants,data[0]].sort((a,b)=>a.name.localeCompare(b.name))}))},
    updateConsultant:async(id,form)=>{const {data,error}=await supabase.from('consultants').update(form).eq('id',id).select();if(error){alert('Update failed: '+error.message);return}if(data)setDb(d=>({...d,consultants:d.consultants.map(r=>r.id===id?data[0]:r)}))},
    deleteConsultant:async id=>{await supabase.from('consultants').delete().eq('id',id);setDb(d=>({...d,consultants:d.consultants.filter(r=>r.id!==id)}))},

  }
  const [prevTab,setPrevTab]=useState(null)
  const [opNavSearch,setOpNavSearch]=useState('')
  const gotoIP=useCallback((pid,fromTab=null)=>{if(fromTab)setPrevTab(fromTab);setIpid(pid);setIpv('detail');setTab('ip')},[])
  const [opPrevTab,setOpPrevTab]=useState(null)
  const gotoOP=useCallback((patName,fromTab=null)=>{if(fromTab)setOpPrevTab(fromTab);setOpNavSearch(patName||'');setTab('op')},[])
  const isAdmin=profile?.role==='admin'
  const isManagement=profile?.role==='management'
  const canSeeReports=isAdmin||isManagement
  const TABS=[{k:'dash',l:'Dashboard'},{k:'entry',l:'Daily Entry'},{k:'ip',l:'IP Patients'},{k:'op',l:'OP Patients'},{k:'exp',l:'Expenses'},{k:'refdrs',l:'Ref Doctors'},{k:'consult',l:'Consultants'},...(canSeeReports?[{k:'rep',l:'Reports'},{k:'credit',l:'Credit'}]:[]),...(isAdmin?[{k:'admin',l:'Users'}]:[])]

  if(loading||dbLoading||(!profile&&session&&!isSuperAdmin))return(
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(160deg,#0a1628 0%,#0f2044 100%)'}}>
      <svg width="52" height="52" viewBox="0 0 40 40" fill="none" style={{marginBottom:16}}><rect width="40" height="40" rx="12" fill="rgba(0,192,107,0.15)"/><rect x="16" y="6" width="8" height="28" rx="4" fill="#00c06b"/><rect x="6" y="16" width="28" height="8" rx="4" fill="#00c06b"/><circle cx="20" cy="20" r="5" fill="#00e87f"/></svg>
      <div style={{fontSize:18,fontWeight:700,color:'#fff',marginBottom:4,letterSpacing:'-0.5px'}}>EasyMedical</div>
      <div style={{fontSize:12,color:'rgba(0,192,107,0.6)',marginBottom:24,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.12em'}}>Solutions</div>
      <div style={{display:'flex',gap:6}}>
        {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:'#00c06b',opacity:0.8,animation:'pulse 1.2s ease-in-out infinite',animationDelay:i*0.2+'s'}}/>)}
      </div>
      <style>{`@keyframes pulse{0%,100%{transform:scale(0.7);opacity:0.4}50%{transform:scale(1);opacity:1}}`}</style>
    </div>
  )
  if(editIPPatient)return(
    <div style={{position:'fixed',inset:0,background:'#f8fafc',zIndex:9999,overflowY:'auto'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #f0f0f0',padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,zIndex:10}}>
        <button onClick={()=>setEditIPPatient(null)} style={{background:'none',border:'none',color:'#3b82f6',fontSize:14,fontWeight:600,cursor:'pointer'}}>Cancel</button>
        <div style={{fontSize:15,fontWeight:700}}>Edit patient info</div>
        <button onClick={async()=>{
          const safe={name:editIPPatient.name,phone:editIPPatient.phone||'',diagnosis:editIPPatient.dx||'',room:editIPPatient.room||'',ref_doctor:editIPPatient.ref||'',admission_date:editIPPatient.adm||''}
          let {error}=await supabase.from('ip_patients').update({...safe,patient_area:editIPPatient.patient_area||''}).eq('id',editIPPatient.id)
          if(error){const r2=await supabase.from('ip_patients').update(safe).eq('id',editIPPatient.id);error=r2.error}
          if(error){alert('Save failed: '+error.message);return}
          setDb(d=>({...d,ip_patients:d.ip_patients.map(p=>p.id===editIPPatient.id?{...p,...safe,patient_area:editIPPatient.patient_area||''}:p)}))
          setEditIPPatient(null)
        }} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',fontSize:14,fontWeight:700,cursor:'pointer'}}>Save</button>
      </div>
      <div style={{padding:'16px',maxWidth:480,margin:'0 auto'}}>
        <FInp label="Patient name" type="text" value={editIPPatient.name||''} onChange={e=>setEditIPPatient(p=>({...p,name:e.target.value}))}/>
        <FInp label="Phone" type="tel" value={editIPPatient.phone||''} onChange={e=>setEditIPPatient(p=>({...p,phone:e.target.value}))}/>
        <FInp label="Admission date" type="date" value={editIPPatient.adm||''} onChange={e=>setEditIPPatient(p=>({...p,adm:e.target.value}))}/>
        <FInp label="Ward / Room" type="text" value={editIPPatient.room||''} onChange={e=>setEditIPPatient(p=>({...p,room:e.target.value}))}/>
        <FInp label="Diagnosis" type="text" value={editIPPatient.dx||''} onChange={e=>setEditIPPatient(p=>({...p,dx:e.target.value}))}/>
        <FInp label="Patient area (optional)" type="text" placeholder="e.g. Kukatpally, Miyapur" value={editIPPatient.patient_area||''} onChange={e=>setEditIPPatient(p=>({...p,patient_area:e.target.value}))}/>
        <FSel label="Referring doctor" value={editIPPatient.ref||''} onChange={e=>setEditIPPatient(p=>({...p,ref:e.target.value}))}>
          <option value="">- No referral / Self patient -</option>
          {(db?.ref_doctors||[]).map(d=><option key={d.id} value={d.name}>Dr. {d.name}{d.area?' ('+d.area+')':''}</option>)}
        </FSel>
        <button onClick={()=>setEditIPPatient(null)} style={{width:'100%',padding:'12px',background:'none',border:'1px solid #e5e7eb',borderRadius:12,fontSize:14,color:'#aaa',cursor:'pointer',marginTop:16}}>Cancel</button>
      </div>
    </div>
  )
  if(showPayment||new URLSearchParams(window.location.search).get('upgrade')==='true')return<PaymentPage onBack={()=>{setShowPayment(false);window.history.replaceState({},'',window.location.pathname)}}/>
  if(!session&&showRegister)return<HospitalOnboarding onBack={()=>setShowRegister(false)}/>
  if(!session)return<LoginPage onRegister={()=>setShowRegister(true)}/>
  if(isSuperAdmin&&!previewHospital)return<SuperAdminDashboard onPreview={(hosp,db)=>setPreviewHospital({hospital:hosp,db})}/>
  // Super admin previewing a hospital - render full app with their data
  if(isSuperAdmin&&previewHospital)return(
    <div style={{background:'#f8fafc',minHeight:'100vh'}}>
      <div style={{background:'#dc2626',color:'#fff',padding:'8px 16px',fontSize:12,fontWeight:700,display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,zIndex:1000}}>
        <span>SUPER ADMIN PREVIEW - {previewHospital.hospital.name}</span>
        <button onClick={()=>setPreviewHospital(null)} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'#fff',borderRadius:8,padding:'4px 12px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Exit preview</button>
      </div>
      <PreviewApp db={previewHospital.db} hospital={previewHospital.hospital} onExit={()=>setPreviewHospital(null)}/>
    </div>
  )
  if(hospital&&hospital.plan_end&&hospital.plan_end<todayStr()&&hospital.plan!=='pro'&&hospital.plan!=='enterprise'){
    return <PaymentPage/>
  }

  const TAB_COLORS={dash:{active:'#6366f1',bg:'#eef2ff'},entry:{active:'#16a34a',bg:'#f0fdf4'},ip:{active:'#2563eb',bg:'#eff6ff'},op:{active:'#7c3aed',bg:'#f5f3ff'},exp:{active:'#dc2626',bg:'#fff1f2'},rep:{active:'#d97706',bg:'#fffbeb'},credit:{active:'#c2410c',bg:'#fff7ed'},refdrs:{active:'#0891b2',bg:'#ecfeff'},consult:{active:'#7c3aed',bg:'#f5f3ff'},admin:{active:'#475569',bg:'#f8fafc'}}
  const tc=TAB_COLORS[tab]||{active:'#16a34a',bg:'#f0fdf4'}
  return(
    <div style={{maxWidth:520,margin:'0 auto',background:'#f8fafc',minHeight:'100vh'}}>
      <div style={{background:'#fff',borderBottom:'2px solid '+tc.bg,padding:'12px 16px 0',position:'sticky',top:0,zIndex:10,boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:34,height:34,borderRadius:10,background:tc.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,overflow:'hidden'}}>
              {hospital?.logo_url?<img src={hospital.logo_url} alt="logo" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:<svg width="18" height="18" viewBox="0 0 40 40" fill="none"><rect x="16" y="6" width="8" height="28" rx="4" fill={tc.active}/><rect x="6" y="16" width="28" height="8" rx="4" fill={tc.active}/><circle cx="20" cy="20" r="5" fill={tc.active} opacity="0.7"/></svg>}
            </div>
            <div>
              <div style={{fontWeight:800,fontSize:14,color:'#0f172a',letterSpacing:'-0.3px'}}>{hospital?.name||'EasyMedical'}</div>
              {profile&&<div style={{fontSize:10,color:'#94a3b8',marginTop:1,fontWeight:500}}>{profile.name||'Staff'}  {profile.role||'staff'}</div>}
            </div>
          </div>
          <div style={{display:'flex',gap:6,alignItems:'center'}}>
            {isAdmin&&<button onClick={()=>setShowPayment(true)} style={{fontSize:11,color:'#16a34a',background:'#f0fdf4',border:'1.5px solid #bbf7d0',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontWeight:700}}>Upgrade</button>}
            <button onClick={()=>supabase.auth.signOut()} style={{fontSize:11,color:'#94a3b8',background:'#f8fafc',border:'1.5px solid #e2e8f0',borderRadius:8,padding:'6px 12px',cursor:'pointer',fontWeight:600}}>Logout</button>
          </div>
        </div>
        {dbLoading&&<div style={{fontSize:11,color:'#3b82f6',marginBottom:6,textAlign:'center',fontWeight:600}}>Syncing...</div>}
        <div style={{display:'flex',overflowX:'auto',gap:4,marginBottom:-1,paddingBottom:0,WebkitOverflowScrolling:'touch'}}>
          {TABS.map(t=>{const tcolor=TAB_COLORS[t.k]||{active:'#16a34a',bg:'#f0fdf4'};const on=tab===t.k;return(<button key={t.k} onClick={()=>setTab(t.k)} style={{flexShrink:0,padding:'9px 12px',fontSize:11,fontWeight:700,border:'none',background:on?tcolor.bg:'transparent',color:on?tcolor.active:'#94a3b8',borderBottom:on?'2.5px solid '+tcolor.active:'2.5px solid transparent',cursor:'pointer',whiteSpace:'nowrap',borderRadius:'8px 8px 0 0',transition:'all .15s'}}>{t.l}</button>)})}
        </div>
      </div>
      <div style={{padding:'16px 16px 80px',minHeight:'50vh'}}>
        {tab==='dash'&&(canSeeReports?<AnalyticsDash db={db}/>:<div style={{textAlign:'center',padding:'40px 0',color:'#94a3b8',fontSize:13}}>Dashboard available for Admin and Management only</div>)}
        <div style={{display:tab==='entry'?'block':'none'}}><EntryTab db={db} actions={actions} eDate={eDate} setEDate={setEDate} itype={itype} setItype={setItype} iF={iF} setIF={setIF}/></div>
        <div style={{display:tab==='ip'?'block':'none'}}><IPTab db={db} actions={actions} ipv={ipv} setIpv={setIpv} ipid={ipid} setIpid={setIpid} pF={pF} setPF={setPF} cF={cF} setCF={setCF} pyF={pyF} setPyF={setPyF} gotoIP={gotoIP} prevTab={prevTab} setPrevTab={setPrevTab} setTab={setTab} setEditIPPatient={setEditIPPatient}/></div>
        {tab==='op'&&<OPTab db={db} actions={actions} opSearch={opNavSearch} setOpSearch={setOpNavSearch} opPrevTab={opPrevTab} setOpPrevTab={setOpPrevTab} setTab={setTab}/>}
        {tab==='exp'&&<ExpTab db={db} actions={actions} exD={exD} setExD={setExD} exF={exF} setExF={setExF}/>}
        {tab==='rep'&&<RepTab db={db} rv={rv} setRv={setRv} rd={rd} setRd={setRd} rm={rm} setRm={setRm} ry={ry} setRy={setRy} gotoIP={gotoIP} gotoOP={gotoOP} actions={actions}/>}
        {tab==='credit'&&<CreditTab db={db} actions={actions}/>}
        {tab==='refdrs'&&<RefDoctorsTab db={db} actions={actions}/>}
        {tab==='consult'&&<ConsultantsTab db={db} actions={actions}/>}
        {isAdmin&&tab==='admin'&&<AdminTab currentUser={profile} hospital={hospital} onLogoUpdate={url=>setHospital(h=>({...h,logo_url:url}))}/>}
      </div>
    </div>
  )
}


/*  REF DOCTORS TAB  */
const RefDoctorsTab=({db,actions})=>{
  const [showAdd,setShowAdd]=useState(false)
  const [editId,setEditId]=useState(null)
  const [busy,setBusy]=useState(false)
  const blank={name:'',phone:'',area:'',ip_pct:40,ip_r_pct:40,ip_l_pct:50,op_r_pct:0,op_l_pct:0}
  const [form,setForm]=useState(blank)
  const ipCats=[{key:'ip_pct',label:'IP Charges',color:'#16a34a'},{key:'ip_r_pct',label:'IP Pharmacy',color:'#b45309'},{key:'ip_l_pct',label:'IP Lab',color:'#9d174d'}]
  const opCats=[{key:'op_r_pct',label:'OP Pharmacy',color:'#c2410c'},{key:'op_l_pct',label:'OP Lab',color:'#7e22ce'}]
  const save=async()=>{
    if(!form.name.trim()){alert('Doctor name required');return}
    setBusy(true)
    if(editId){
      await actions.updateRefDoctor(editId,form)
      setEditId(null)
    } else {
      await actions.addRefDoctor(form)
    }
    setForm(blank);setShowAdd(false);setBusy(false)
  }
  const startEdit=d=>{setForm({name:d.name,phone:d.phone||'',area:d.area||'',ip_pct:d.ip_pct,ip_r_pct:d.ip_r_pct,ip_l_pct:d.ip_l_pct,op_r_pct:d.op_r_pct,op_l_pct:d.op_l_pct});setEditId(d.id);setShowAdd(true)}
  return(<div>
    {!showAdd&&<PBtn onClick={()=>{setShowAdd(true);setEditId(null);setForm(blank)}} style={{marginBottom:14}}>+ Add referral doctor</PBtn>}
    {showAdd&&<Card style={{border:'2px solid #e5e7eb'}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>{editId?'Edit doctor':'Add referral doctor'}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <FInp label="Doctor name *" type="text" placeholder="e.g. Dr. Ravi Kumar" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
        <FInp label="Phone (optional)" type="tel" placeholder="9999999999" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
      </div>
      <FInp label="Area / Location" type="text" placeholder="e.g. Kukatpally, Miyapur, Ameerpet" value={form.area||''} onChange={e=>setForm({...form,area:e.target.value})}/>

      <div style={{fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:10,marginTop:4}}>IP commission % per category</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
        {ipCats.map(c=>(<div key={c.key}>
          <label style={{display:'block',fontSize:10,color:c.color,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>{c.label}</label>
          <div style={{position:'relative'}}>
            <input style={{...S.inp,paddingRight:28}} type="number" inputMode="numeric" min="0" max="100" value={form[c.key]} onChange={e=>setForm({...form,[c.key]:parseFloat(e.target.value)||0})}/>
            <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'#aaa',fontWeight:700}}>%</span>
          </div>
        </div>))}
      </div>
      <div style={{fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:10}}>OP lab & pharmacy commission %</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        {opCats.map(c=>(<div key={c.key}>
          <label style={{display:'block',fontSize:10,color:c.color,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>{c.label}</label>
          <div style={{position:'relative'}}>
            <input style={{...S.inp,paddingRight:28}} type="number" inputMode="numeric" min="0" max="100" value={form[c.key]} onChange={e=>setForm({...form,[c.key]:parseFloat(e.target.value)||0})}/>
            <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'#aaa',fontWeight:700}}>%</span>
          </div>
        </div>))}
      </div>
      <div style={{display:'flex',gap:8,marginTop:14}}>
        <button onClick={()=>{setShowAdd(false);setEditId(null);setForm(blank)}} style={{flex:1,padding:'11px',background:'none',border:'1px solid #e5e7eb',borderRadius:12,fontSize:14,color:'#555',cursor:'pointer'}}>Cancel</button>
        <PBtn onClick={save} disabled={busy} style={{flex:2,marginTop:0}}>{busy?'Saving...':editId?'Save changes':'Add doctor'}</PBtn>
      </div>
    </Card>}
    <SecL>Registered doctors ({db.ref_doctors.length})</SecL>
    {!db.ref_doctors.length&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No referral doctors yet.<br/>Add doctors to link them to patients and auto-calculate commissions.</div>}
    {db.ref_doctors.map(d=>(<Card key={d.id} style={{marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
        <div>
          <div style={{fontSize:15,fontWeight:700}}>Dr. {d.name}</div>
          {d.phone&&<div style={{fontSize:12,color:'#aaa',marginTop:2}}>{d.phone}</div>}
          {d.area&&<div style={{fontSize:11,fontWeight:700,color:'#1d4ed8',marginTop:3}}>Area: {d.area}</div>}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>startEdit(d)} style={{padding:'5px 12px',background:'#f0f9ff',border:'1.5px solid #3b82f6',borderRadius:8,fontSize:12,color:'#1d4ed8',cursor:'pointer',fontWeight:600}}>Edit</button>
          <DBtn onClick={()=>{if(window.confirm('Delete Dr. '+d.name+'?'))actions.deleteRefDoctor(d.id)}}>Delete</DBtn>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:6}}>
        {ipCats.map(c=>(<div key={c.key} style={{background:'#f9f9f9',borderRadius:8,padding:'6px 8px',textAlign:'center'}}>
          <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>{c.label.replace(' Charges','').replace(' Pharmacy','Pharm').replace(' Lab','Lab')}</div>
          <div style={{fontSize:15,fontWeight:800,color:d[c.key]>0?c.color:'#ccc'}}>{d[c.key]}%</div>
        </div>))}
      </div>
      {(d.op_r_pct>0||d.op_l_pct>0)&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
        {opCats.map(c=>(<div key={c.key} style={{background:'#f9f9f9',borderRadius:8,padding:'6px 8px',textAlign:'center'}}>
          <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>{c.label.replace(' Pharmacy','OP Pharm').replace(' Lab','OP Lab')}</div>
          <div style={{fontSize:15,fontWeight:800,color:d[c.key]>0?c.color:'#ccc'}}>{d[c.key]}%</div>
        </div>))}
      </div>}
    </Card>))}
  </div>)
}

/*  CONSULTANTS TAB  */
const ConsultantsTab=({db,actions})=>{
  const [showAdd,setShowAdd]=useState(false)
  const [editId,setEditId]=useState(null)
  const [busy,setBusy]=useState(false)
  const blank={name:'',phone:'',fee_share_pct:0,op_l_pct:0,op_r_pct:0}
  const [form,setForm]=useState(blank)
  const save=async()=>{
    if(!form.name.trim()){alert('Consultant name required');return}
    setBusy(true)
    if(editId){await actions.updateConsultant(editId,form);setEditId(null)}
    else{await actions.addConsultant(form)}
    setForm(blank);setShowAdd(false);setBusy(false)
  }
  const startEdit=d=>{setForm({name:d.name,phone:d.phone||'',fee_share_pct:d.fee_share_pct||0,op_l_pct:d.op_l_pct||0,op_r_pct:d.op_r_pct||0});setEditId(d.id);setShowAdd(true)}
  return(<div>
    {!showAdd&&<PBtn onClick={()=>{setShowAdd(true);setEditId(null);setForm(blank)}} style={{marginBottom:14}}>+ Add visiting consultant</PBtn>}
    {showAdd&&<Card style={{border:'2px solid #7e22ce'}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:4,color:'#7e22ce'}}>{editId?'Edit consultant':'Add visiting consultant'}</div>
      <div style={{fontSize:12,color:'#aaa',marginBottom:14}}>Visiting consultants see OPD patients, split the fee with hospital, and get commission on lab & pharmacy.</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <FInp label="Consultant name *" type="text" placeholder="e.g. Dr. Tamanna" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/>
        <FInp label="Phone (optional)" type="tel" placeholder="9999999999" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/>
      </div>
      <div style={{background:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:10,padding:'12px 14px',marginBottom:12}}>
        <div style={{fontSize:11,fontWeight:700,color:'#7e22ce',textTransform:'uppercase',marginBottom:8}}>OP consultation fee share</div>
        <div style={{position:'relative'}}>
          <input style={{...S.inp,paddingRight:28,borderColor:'#d8b4fe'}} type="number" inputMode="numeric" min="0" max="100" value={form.fee_share_pct} onChange={e=>setForm({...form,fee_share_pct:parseFloat(e.target.value)||0})}/>
          <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'#7e22ce',fontWeight:700}}>%</span>
        </div>
        <div style={{fontSize:11,color:'#9333ea',marginTop:6}}>Doctor takes this % of what is collected. Hospital keeps the rest.</div>
        {form.fee_share_pct>0&&<div style={{marginTop:8,fontSize:12,color:'#7e22ce',fontWeight:600}}>e.g. collect Rs 700 - Dr. gets {fmt(700*form.fee_share_pct/100)} - Hospital keeps {fmt(700*(1-form.fee_share_pct/100))}</div>}
      </div>
      <div style={{fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:10}}>Commission on investigations ordered</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        {[{key:'op_l_pct',label:'OP Lab',color:'#7e22ce'},{key:'op_r_pct',label:'OP Pharmacy',color:'#c2410c'}].map(c=>(<div key={c.key}>
          <label style={{display:'block',fontSize:10,color:c.color,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>{c.label} commission %</label>
          <div style={{position:'relative'}}>
            <input style={{...S.inp,paddingRight:28}} type="number" inputMode="numeric" min="0" max="100" value={form[c.key]} onChange={e=>setForm({...form,[c.key]:parseFloat(e.target.value)||0})}/>
            <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'#aaa',fontWeight:700}}>%</span>
          </div>
        </div>))}
      </div>
      <div style={{display:'flex',gap:8,marginTop:14}}>
        <button onClick={()=>{setShowAdd(false);setEditId(null);setForm(blank)}} style={{flex:1,padding:'11px',background:'none',border:'1px solid #e5e7eb',borderRadius:12,fontSize:14,color:'#555',cursor:'pointer'}}>Cancel</button>
        <PBtn onClick={save} disabled={busy} style={{flex:2,marginTop:0,background:'#7e22ce'}}>{busy?'Saving...':editId?'Save changes':'Add consultant'}</PBtn>
      </div>
    </Card>}
    <SecL>Visiting consultants ({db.consultants.length})</SecL>
    {!db.consultants.length&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No visiting consultants yet.</div>}
    {db.consultants.map(d=>(<Card key={d.id} style={{marginBottom:12,borderLeft:'3px solid #7e22ce'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
        <div>
          <div style={{fontSize:15,fontWeight:700}}>Dr. {d.name}</div>
          {d.phone&&<div style={{fontSize:12,color:'#aaa',marginTop:2}}>{d.phone}</div>}
          {d.area&&<div style={{fontSize:11,fontWeight:700,color:'#1d4ed8',marginTop:3}}>Area: {d.area}</div>}
        </div>
        <div style={{display:'flex',gap:8}}>
          <button onClick={()=>startEdit(d)} style={{padding:'5px 12px',background:'#f3e8ff',border:'1.5px solid #9333ea',borderRadius:8,fontSize:12,color:'#7e22ce',cursor:'pointer',fontWeight:600}}>Edit</button>
          <DBtn onClick={()=>{if(window.confirm('Delete Dr. '+d.name+'?'))actions.deleteConsultant(d.id)}}>Delete</DBtn>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6}}>
        {[{l:'Fee share',v:d.fee_share_pct+'%',c:'#7e22ce',sub:'of consultation'},{l:'Lab comm',v:d.op_l_pct+'%',c:d.op_l_pct>0?'#7e22ce':'#ccc'},{l:'Pharmacy comm',v:d.op_r_pct+'%',c:d.op_r_pct>0?'#c2410c':'#ccc'}].map((m,i)=>(
          <div key={i} style={{background:'#f9f9f9',borderRadius:8,padding:'8px',textAlign:'center'}}>
            <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>{m.l}</div>
            <div style={{fontSize:16,fontWeight:800,color:m.c}}>{m.v}</div>
            {m.sub&&<div style={{fontSize:9,color:'#aaa'}}>{m.sub}</div>}
          </div>
        ))}
      </div>
    </Card>))}
  </div>)
}

/*  PAYMENT PAGE  */

const PaymentPage=({onBack=null})=>{
  const [plan,setPlan]=useState('pro')
  const [billing,setBilling]=useState('monthly')
  const [busy,setBusy]=useState(false)
  const [err,setErr]=useState('')
  const SUPABASE_URL='https://wlgbhrmycequuiabpwqf.supabase.co'
  const RZP_KEY='rzp_live_Siv0viAUFpkbJg'
  const PLANS={
    starter:{label:'Starter',monthly:600,yearly:6000,desc:'Unlimited patients, IP & OP, Referral commissions, 5 staff'},
    pro:{label:'Pro',monthly:900,yearly:9000,desc:'Everything + Area reports, Consultant module, All reports, Unlimited staff',popular:true},
    enterprise:{label:'Enterprise',monthly:1900,yearly:19000,desc:'Everything + Multi-hospital, Dedicated support, Phone support'},
  }
  const loadRazorpay=()=>new Promise(resolve=>{
    if(window.Razorpay){resolve(true);return}
    const s=document.createElement('script');s.src='https://checkout.razorpay.com/v1/checkout.js'
    s.onload=()=>resolve(true);s.onerror=()=>resolve(false)
    document.body.appendChild(s)
  })
  const pay=async()=>{
    setBusy(true);setErr('')
    const loaded=await loadRazorpay()
    if(!loaded){setErr('Failed to load payment. Check internet.');setBusy(false);return}
    const {data:{session}}=await supabase.auth.getSession()
    if(!session){window.location.href=window.location.pathname+'?upgrade=true#login';setErr('Please login or register first, then click Pay again.');setBusy(false);return}
    const {data:prof}=await supabase.from('profiles').select('*').eq('id',session.user.id).single()
    const hid=prof?.hospital_id
    if(!hid){setErr('Hospital not found.');setBusy(false);return}
    const {data:hosp}=await supabase.from('hospitals').select('*').eq('id',hid).single()
    const res=await fetch(SUPABASE_URL+'/functions/v1/create-order',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':'sb_publishable_1I_V4RUqeSpzu7d0NXlhVg_z4rs0UbZ'},
      body:JSON.stringify({hospital_id:hid,plan,billing})
    })
    const order=await res.json()
    if(!res.ok||order.error){setErr(order.error||'Order creation failed');setBusy(false);return}
    const p=PLANS[plan]
    const rzp=new window.Razorpay({
      key:RZP_KEY,amount:order.amount,currency:'INR',
      name:'Easy Medical Solutions',
      description:p.label+' plan - '+billing,
      order_id:order.order_id,
      prefill:{name:hosp?.name||'',email:session.user.email||'',contact:'7013211742'},
      theme:{color:'#16a34a'},
      handler:async(response)=>{
        const vres=await fetch(SUPABASE_URL+'/functions/v1/verify-payment',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':'sb_publishable_1I_V4RUqeSpzu7d0NXlhVg_z4rs0UbZ'},
          body:JSON.stringify({...response,hospital_id:hid,plan,billing})
        })
        const vdata=await vres.json()
        if(vdata.success){alert('Payment successful! '+p.label+' plan active until '+vdata.plan_end+'. App will now reload.');window.location.reload()}
        else{setErr('Verification failed. Contact support@easymedicalsolutions.in')}
        setBusy(false)
      },
      modal:{ondismiss:()=>setBusy(false)}
    })
    rzp.open()
  }
  return(
    <div style={{minHeight:'100vh',background:'linear-gradient(160deg,#0a1628 0%,#0f2044 100%)',display:'flex',alignItems:'center',justifyContent:'center',padding:20,fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif'}}>
      <div style={{width:'100%',maxWidth:480}}>
        <div style={{textAlign:'center',marginBottom:28}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:10,marginBottom:16}}>
            <div style={{width:40,height:40,borderRadius:12,background:'rgba(0,192,107,0.12)',border:'1px solid rgba(0,192,107,0.3)',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="22" height="22" viewBox="0 0 40 40" fill="none"><rect x="16" y="6" width="8" height="28" rx="4" fill="#00c06b"/><rect x="6" y="16" width="28" height="8" rx="4" fill="#00c06b"/><circle cx="20" cy="20" r="5" fill="#00e87f"/></svg>
            </div>
            <div style={{textAlign:'left'}}>
              <div style={{fontSize:15,fontWeight:900,color:'#fff',letterSpacing:'-0.5px'}}>EasyMedical</div>
              <div style={{fontSize:9,fontWeight:700,color:'rgba(0,192,107,0.8)',textTransform:'uppercase',letterSpacing:'.15em'}}>Solutions</div>
            </div>
          </div>
          <div style={{fontSize:22,fontWeight:900,color:'#fff',letterSpacing:'-0.8px',marginBottom:8}}>Choose your plan</div>
          <div style={{fontSize:13,color:'rgba(255,255,255,0.4)'}}>Your free trial has ended. Activate to continue.</div>
        </div>
        <div style={{display:'flex',justifyContent:'center',marginBottom:20}}>
          <div style={{display:'flex',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:100,padding:4}}>
            {['monthly','yearly'].map(b=>(<button key={b} onClick={()=>setBilling(b)} style={{padding:'8px 22px',borderRadius:100,border:'none',fontFamily:'inherit',fontSize:12,fontWeight:700,cursor:'pointer',background:billing===b?'linear-gradient(135deg,#16a34a,#22c55e)':'transparent',color:billing===b?'#0a1628':'rgba(255,255,255,0.5)',transition:'all .2s'}}>
              {b==='monthly'?'Monthly':<span>Yearly <span style={{background:'rgba(0,192,107,0.2)',color:'#00e87f',fontSize:9,padding:'1px 6px',borderRadius:100,marginLeft:4}}>Save 17%</span></span>}
            </button>))}
          </div>
        </div>
        <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:20}}>
          {Object.entries(PLANS).map(([k,pl])=>(
            <div key={k} onClick={()=>setPlan(k)} style={{background:plan===k?'rgba(0,192,107,0.08)':'rgba(255,255,255,0.03)',border:plan===k?'2px solid rgba(0,192,107,0.5)':'1px solid rgba(255,255,255,0.08)',borderRadius:16,padding:'16px',cursor:'pointer',transition:'all .2s',position:'relative'}}>
              {pl.popular&&<div style={{position:'absolute',top:-10,right:16,background:'linear-gradient(135deg,#16a34a,#22c55e)',color:'#0a1628',fontSize:9,fontWeight:800,padding:'3px 12px',borderRadius:100}}>POPULAR</div>}
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                <div style={{display:'flex',alignItems:'center',gap:10}}>
                  <div style={{width:20,height:20,borderRadius:'50%',border:'2px solid',borderColor:plan===k?'#00c06b':'rgba(255,255,255,0.2)',background:plan===k?'#00c06b':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    {plan===k&&<div style={{width:8,height:8,borderRadius:'50%',background:'#0a1628'}}/>}
                  </div>
                  <div style={{fontSize:15,fontWeight:800,color:'#fff'}}>{pl.label}</div>
                </div>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:22,fontWeight:900,color:plan===k?'#00c06b':'#fff'}}>Rs {(billing==='monthly'?pl.monthly:pl.yearly).toLocaleString('en-IN')}</div>
                  <div style={{fontSize:10,color:'rgba(255,255,255,0.35)'}}>per {billing==='monthly'?'month':'year'}</div>
                </div>
              </div>
              <div style={{fontSize:11,color:'rgba(255,255,255,0.4)',paddingLeft:30}}>{pl.desc}</div>
            </div>
          ))}
        </div>
        {err&&<div style={{background:'rgba(220,38,38,0.12)',border:'1px solid rgba(220,38,38,0.25)',borderRadius:10,padding:'10px 14px',color:'#fca5a5',fontSize:13,textAlign:'center',marginBottom:12}}>{err}</div>}
        <button onClick={pay} disabled={busy} style={{width:'100%',padding:'15px',background:busy?'rgba(0,192,107,0.3)':'linear-gradient(135deg,#00c06b,#00e87f)',color:busy?'rgba(255,255,255,0.4)':'#0a1628',border:'none',borderRadius:14,fontSize:16,fontWeight:800,cursor:busy?'not-allowed':'pointer',letterSpacing:'-0.3px',boxShadow:busy?'none':'0 8px 24px rgba(0,192,107,0.3)'}}>
          {busy?'Opening payment...':'Pay Rs '+(billing==='monthly'?PLANS[plan].monthly:PLANS[plan].yearly).toLocaleString('en-IN')+' & Activate'}
        </button>
        <div style={{textAlign:'center',marginTop:14,fontSize:11,color:'rgba(255,255,255,0.25)'}}>
          Secured by Razorpay &nbsp;&nbsp; UPI, Cards, NetBanking, Wallets
          <br/>support@easymedicalsolutions.in &nbsp;&nbsp; 7013211742
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:20,marginTop:14}}>
          {onBack&&<button onClick={onBack} style={{fontSize:11,color:'rgba(255,255,255,0.4)',background:'none',border:'none',cursor:'pointer',fontWeight:600}}>Back to app</button>}
          <button onClick={()=>supabase.auth.signOut()} style={{fontSize:11,color:'rgba(255,255,255,0.2)',background:'none',border:'none',cursor:'pointer'}}>Logout</button>
        </div>
      </div>
    </div>
  )
}

/*  SMART REMINDERS  */
const SmartReminders=({db})=>{
  const [dismissed,setDismissed]=useState([])
  try{
    const today=todayStr()
    const yest=(()=>{const d=new Date();d.setDate(d.getDate()-1);return d.toISOString().split('T')[0]})()
    const inc=db.income||[]
    const pts=db.ip_patients||[]
    const exps=db.expenses||[]

    const todayOPs=inc.filter(e=>e.date===today&&['op','op_r','op_l','vc'].includes(e.type)).length
    const yesterdayOPs=inc.filter(e=>e.date===yest&&['op','op_r','op_l','vc'].includes(e.type)).length
    const opsDown=yesterdayOPs>0&&todayOPs<yesterdayOPs

    const paidRec=exps.filter(e=>e.category==='ref_paid')
    const unpaid=pts.filter(p=>{
      try{
        if(!p.discharge_date||!p.ref_doctor||!p.ref_doctor.trim())return false
        const dDays=Math.floor((Date.now()-new Date(p.discharge_date+'T00:00:00').getTime())/86400000)
        if(dDays<1)return false
        const earned=inc.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+getComm(e),0)
        if(earned<=0)return false
        const paid=paidRec.filter(e=>e.description===p.ref_doctor).reduce((a,e)=>a+e.amount,0)
        return paid<earned
      }catch{return false}
    })

    const items=[]
    if(opsDown){
      items.push({
        key:'ops-'+todayStr(),
        color:'#f97316',bg:'#fff7ed',border:'#fed7aa',tx:'#92400e',
        title:'OP patients are down today',
        sub:'Today '+todayOPs+' vs Yesterday '+yesterdayOPs,
        actions:['Call your referral doctors and check in','Brief your marketing executive','Plan a health camp or awareness event','Ask staff to follow up with review patients']
      })
    }
    unpaid.forEach(p=>{
      try{
        const earned=inc.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+getComm(e),0)
        const paid=paidRec.filter(e=>e.description===p.ref_doctor).reduce((a,e)=>a+e.amount,0)
        const days=Math.floor((Date.now()-new Date(p.discharge_date+'T00:00:00').getTime())/86400000)
        items.push({
          key:'comm-'+p.id,
          color:'#dc2626',bg:'#fef2f2',border:'#fecaca',tx:'#991b1b',
          title:'Commission not paid - Dr. '+p.ref_doctor,
          sub:p.name+' discharged '+days+' day'+(days!==1?'s':'')+' ago  |  Balance: '+fmt(earned-paid),
          actions:['Go to Reports > Referrals > Commission to record payment']
        })
      }catch{/* skip */}
    })

    const visible=items.filter(r=>!dismissed.includes(r.key))
    if(!visible.length)return null

    return(
      <div style={{marginBottom:20}}>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:'#ef4444'}}/>
          <span style={{fontSize:11,fontWeight:700,color:'#ef4444',textTransform:'uppercase',letterSpacing:'.08em'}}>{visible.length} Reminder{visible.length!==1?'s':''}</span>
        </div>
        {visible.map((r,i)=>(
          <div key={r.key||i} style={{background:r.bg,border:'1px solid '+r.border,borderLeft:'4px solid '+r.color,borderRadius:12,padding:'14px 16px',marginBottom:10,position:'relative'}}>
            <button onClick={()=>setDismissed(d=>[...d,r.key])} style={{position:'absolute',top:10,right:10,background:'none',border:'none',fontSize:16,color:r.color,cursor:'pointer',lineHeight:1,padding:'2px 6px',borderRadius:6,opacity:0.7}}>x</button>
            <div style={{fontSize:14,fontWeight:700,color:r.tx,marginBottom:4,paddingRight:28}}>{r.title}</div>
            <div style={{fontSize:12,color:r.color,fontWeight:600,marginBottom:10}}>{r.sub}</div>
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {r.actions.map((a,j)=>(
                <div key={j} style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{width:4,height:4,borderRadius:'50%',background:r.color,flexShrink:0}}/>
                  <span style={{fontSize:13,color:r.tx}}>{a}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    )
  }catch{return null}
}

/*  ANALYTICS DASHBOARD  */
const AnalyticsDash=({db})=>{
  const today=todayStr()
  const thisMonth=today.slice(0,7)
  const lastMonth=(()=>{const d=new Date(today);d.setMonth(d.getMonth()-1);return d.toISOString().slice(0,7)})()
  const thisYear=today.slice(0,4)

  const inc=useMemo(()=>db.income||[],[db.income])
  const exp=useMemo(()=>(db.expenses||[]).filter(e=>e.category!=='ref_paid'),[db.expenses])

  // Period helpers
  const incBy=(prefix)=>inc.filter(e=>e.date?.startsWith(prefix))
  const expBy=(prefix)=>exp.filter(e=>e.date?.startsWith(prefix)&&e.category!=='ref_paid')
  const sum=(arr)=>arr.reduce((a,e)=>a+e.amount,0)
  const comm=(arr)=>arr.reduce((a,e)=>a+getComm(e),0)
  const credit=(arr)=>arr.reduce((a,e)=>a+(isCredit(e)?e.amount:0),0)

  // This month vs last month
  const tmInc=incBy(thisMonth);const lmInc=incBy(lastMonth)
  const tmExp=expBy(thisMonth);const lmExp=expBy(lastMonth)
  const tmTotal=sum(tmInc);const lmTotal=sum(lmInc)
  const tmComm=comm(tmInc);const lmComm=comm(lmInc)
  const tmExpTotal=sum(tmExp);const lmExpTotal=sum(lmExp)
  const tmReal=tmTotal-tmComm-tmExpTotal
  const lmReal=lmTotal-lmComm-lmExpTotal
  const tmCredit=credit(tmInc)
  const growthPct=lmTotal>0?Math.round((tmTotal-lmTotal)/lmTotal*100):null
  const realGrowthPct=lmReal>0?Math.round((tmReal-lmReal)/lmReal*100):null

  // Today
  const todayInc=incBy(today);const todayExp=expBy(today)
  const todayTotal=sum(todayInc);const todayComm=comm(todayInc)
  const todayCredit=credit(todayInc);const todayExpTotal=sum(todayExp)

  // Year totals
  const yrInc=incBy(thisYear)
  const yrTotal=sum(yrInc);const yrComm=comm(yrInc);const yrExp=sum(expBy(thisYear))
  const yrReal=yrTotal-yrComm-yrExp

  // Income by type - this month
  const byType={}
  tmInc.forEach(e=>{if(!byType[e.type])byType[e.type]={total:0,comm:0,count:0};byType[e.type].total+=e.amount;byType[e.type].comm+=getComm(e);byType[e.type].count++})
  const typeList=Object.entries(byType).sort((a,b)=>b[1].total-a[1].total)

  // Top referral doctors - this month
  const refMap={}
  tmInc.forEach(e=>{if(!e.ref_doctor||!e.ref_doctor.trim())return;if(!refMap[e.ref_doctor])refMap[e.ref_doctor]={name:e.ref_doctor,income:0,comm:0,count:0};refMap[e.ref_doctor].income+=e.amount;refMap[e.ref_doctor].comm+=getComm(e);refMap[e.ref_doctor].count++})
  const topRefs=Object.values(refMap).sort((a,b)=>b.income-a.income).slice(0,5)

  // Last 7 days trend
  const svAllPats=[...new Set(tmInc.filter(e=>e.patient_name).map(e=>e.patient_name.trim().toLowerCase()))]
  const svRefPats=[...new Set(tmInc.filter(e=>e.patient_name&&e.ref_doctor&&e.ref_doctor.trim()).map(e=>e.patient_name.trim().toLowerCase()))]
  const svSelfCount=svAllPats.filter(p=>!svRefPats.includes(p)).length
  const svRefCount=svRefPats.length
  const svTotal=svAllPats.length||1
  const svRefPct=Math.round((svRefCount/svTotal)*100)
  const svSelfPct=100-svRefPct
  const svRefInc=sum(tmInc.filter(e=>e.ref_doctor&&e.ref_doctor.trim()))
  const svSelfInc=sum(tmInc.filter(e=>!e.ref_doctor||!e.ref_doctor.trim()))
  const svRefComm=comm(tmInc.filter(e=>e.ref_doctor&&e.ref_doctor.trim()))
  const [chartMonths,setChartMonths]=useState(()=>{const months=[];for(let i=5;i>=0;i--){const d=new Date(today);d.setMonth(d.getMonth()-i);months.push(d.toISOString().slice(0,7))}return months})
  const last7=Array.from({length:7},(_,i)=>{const d=new Date(today);d.setDate(d.getDate()-6+i);const ds=d.toISOString().slice(0,10);const dayInc=inc.filter(e=>e.date===ds);return{date:ds,label:d.toLocaleDateString('en-IN',{weekday:'short'}),total:sum(dayInc),credit:credit(dayInc)}})
  const maxDay=Math.max(...last7.map(d=>d.total),1)

  // IP stats
  const activeIP=db.ip_patients.filter(p=>!p.discharge_date).length
  const dischargedTM=db.ip_patients.filter(p=>p.discharge_date?.startsWith(thisMonth)).length
  const admittedTM=db.ip_patients.filter(p=>p.admission_date?.startsWith(thisMonth)).length


  return(
    <div>
      <SmartReminders db={db}/>
            {/* TODAY STRIP */}
      <div style={{background:'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)',borderRadius:16,padding:'16px',marginBottom:14,color:'#fff'}}>
        <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:10}}>Today  {new Date(today+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'})}</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
          {[{l:'Collected',v:fmt(todayTotal-todayCredit),c:'#4ade80'},{l:'Credit',v:fmt(todayCredit),c:'#f87171'},{l:'Expenses',v:fmt(todayExpTotal),c:'#fbbf24'},{l:'Real profit',v:fmt(todayTotal-todayComm-todayExpTotal),c:'#34d399'}].map((m,i)=>(
            <div key={i} style={{textAlign:'center'}}>
              <div style={{fontSize:9,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',fontWeight:700,marginBottom:4}}>{m.l}</div>
              <div style={{fontSize:14,fontWeight:800,color:m.c}}>{m.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 7-DAY CHART */}
      <Card>
        <div style={{fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:14}}>Last 7 days</div>
        <div style={{display:'flex',alignItems:'flex-end',gap:6,height:80}}>
          {last7.map((d,i)=>{const h=Math.max(4,Math.round((d.total/maxDay)*80));const isToday=d.date===today;const bar=(<div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}><div style={{fontSize:8,color:'#94a3b8',fontWeight:600}}>{d.total>0?fmt(d.total).replace('Rs ',''):'-'}</div><div style={{width:'100%',height:h,borderRadius:'4px 4px 0 0',background:isToday?'linear-gradient(180deg,#22c55e,#16a34a)':'linear-gradient(180deg,#3b82f6,#2563eb)',opacity:isToday?1:0.6,minHeight:4}}/><div style={{fontSize:9,color:isToday?'#16a34a':'#94a3b8',fontWeight:isToday?700:500}}>{d.label}</div></div>);return bar})}
        </div>
      </Card>

      {/* THIS MONTH VS LAST MONTH */}
      <SecL>This month vs last month</SecL>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
        {[
          {l:'Total income',tm:tmTotal,lm:lmTotal,c:'#16a34a'},
          {l:'Real income',tm:tmReal,lm:lmReal,c:'#0891b2'},
          {l:'Commission paid',tm:tmComm,lm:lmComm,c:'#d97706'},
          {l:'Expenses',tm:tmExpTotal,lm:lmExpTotal,c:'#dc2626'},
        ].map((m,i)=>{const pct=m.lm>0?Math.round((m.tm-m.lm)/m.lm*100):null;const up=pct===null||pct>=0;return(
          <div key={i} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:14,padding:'14px'}}>
            <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',marginBottom:6}}>{m.l}</div>
            <div style={{fontSize:18,fontWeight:800,color:m.c,marginBottom:4}}>{fmt(m.tm)}</div>
            <div style={{display:'flex',alignItems:'center',gap:6}}>
              <span style={{fontSize:10,color:'#94a3b8'}}>Last: {fmt(m.lm)}</span>
              {pct!==null&&<span style={{fontSize:10,fontWeight:700,color:up?'#16a34a':'#dc2626'}}>{up?'+':''}{pct}%</span>}
            </div>
          </div>
        )})}
      </div>

      {/* IP PATIENTS */}
      <SecL>Inpatients  {thisMonth}</SecL>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
        {[{l:'Active now',v:activeIP,c:'#2563eb'},{l:'Admitted',v:admittedTM,c:'#16a34a'},{l:'Discharged',v:dischargedTM,c:'#6b7280'}].map((m,i)=>(
          <div key={i} style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:12,padding:'12px',textAlign:'center'}}>
            <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>{m.l}</div>
            <div style={{fontSize:26,fontWeight:900,color:m.c}}>{m.v}</div>
          </div>
        ))}
      </div>

      {/* INCOME BY TYPE */}
      <SecL>Income breakdown  {thisMonth}</SecL>
      <Card>
        {typeList.length===0&&<div style={{textAlign:'center',padding:'16px 0',color:'#ccc',fontSize:13}}>No income this month yet</div>}
        {typeList.map(([tk,v])=>{const it=ITYPES.find(t=>t.key===tk);const pct=Math.round((v.total/tmTotal)*100)||0;return(
          <div key={tk} style={{marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12,fontWeight:600}}><TypeTag t={tk}/>{it?.full||tk}</span>
              <div style={{textAlign:'right'}}>
                <span style={{fontSize:13,fontWeight:700}}>{fmt(v.total)}</span>
                {v.comm>0&&<span style={{fontSize:10,color:'#d97706',marginLeft:6}}>-{fmt(v.comm)}</span>}
                <span style={{fontSize:10,color:'#94a3b8',marginLeft:6}}>{pct}%</span>
              </div>
            </div>
            <div style={{height:5,background:'#f1f5f9',borderRadius:3,overflow:'hidden'}}>
              <div style={{height:'100%',width:pct+'%',background:'linear-gradient(90deg,#16a34a,#22c55e)',borderRadius:3,transition:'width .5s'}}/>
            </div>
          </div>
        )}
      )}
      </Card>

      {/* TOP REFERRAL DOCTORS */}
      {topRefs.length>0&&<div>
        <SecL>Top referral doctors - {thisMonth}</SecL>
        <Card>{topRefs.map((doc,i)=><div key={doc.name} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 0',borderBottom:i<topRefs.length-1?'1px solid #f1f5f9':'none'}}><div style={{width:26,height:26,borderRadius:'50%',background:['#dbeafe','#dcfce7','#fef3c7','#fce7f3','#ede9fe'][i],display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:['#1d4ed8','#16a34a','#b45309','#9d174d','#6d28d9'][i],flexShrink:0}}>{i+1}</div><div style={{flex:1}}><div style={{fontSize:13,fontWeight:700,color:'#0f172a'}}>Dr. {doc.name}</div><div style={{fontSize:10,color:'#94a3b8'}}>{doc.count} visit{doc.count!==1?'s':''}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(doc.income)}</div>{doc.comm>0&&<div style={{fontSize:10,color:'#d97706'}}>comm: {fmt(doc.comm)}</div>}</div></div>)}</Card>
      </div>}

      {/* MONTH SUMMARY */}
      <SecL>This month summary</SecL>
      <div style={{background:'linear-gradient(135deg,#0f172a,#1e3a5f)',borderRadius:16,padding:'16px',marginBottom:12,color:'#fff'}}>
        <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',marginBottom:12}}>{new Date(thisMonth+'-01').toLocaleDateString('en-IN',{month:'long',year:'numeric'})}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
          <div style={{background:'rgba(74,222,128,0.1)',borderRadius:10,padding:'10px 12px'}}>
            <div style={{fontSize:9,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',fontWeight:700,marginBottom:4}}>Gross income</div>
            <div style={{fontSize:18,fontWeight:900,color:'#4ade80'}}>{fmt(tmTotal)}</div>
          </div>
          <div style={{background:'rgba(52,211,153,0.1)',borderRadius:10,padding:'10px 12px'}}>
            <div style={{fontSize:9,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',fontWeight:700,marginBottom:4}}>Real profit</div>
            <div style={{fontSize:18,fontWeight:900,color:'#34d399'}}>{fmt(tmReal)}</div>
          </div>
        </div>
        {tmCredit>0&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:'rgba(248,113,113,0.1)',borderRadius:8,marginBottom:8}}>
          <span style={{fontSize:11,color:'rgba(255,255,255,0.5)'}}>Credit outstanding</span>
          <span style={{fontSize:13,fontWeight:700,color:'#f87171'}}>{fmt(tmCredit)}</span>
        </div>}
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 10px',background:'rgba(251,191,36,0.08)',borderRadius:8}}>
          <span style={{fontSize:11,color:'rgba(255,255,255,0.4)'}}>Ref commissions</span>
          <span style={{fontSize:13,fontWeight:700,color:'#fbbf24'}}>{fmt(tmComm)}</span>
        </div>
      </div>

      <SecL>Expenses this month</SecL>
      <Card>
        {tmExpTotal===0&&<div style={{textAlign:'center',padding:'12px 0',color:'#94a3b8',fontSize:13}}>No expenses recorded this month</div>}
        {(()=>{
          const bycat={}
          tmExp.forEach(e=>{if(!bycat[e.category])bycat[e.category]={total:0,count:0};bycat[e.category].total+=e.amount;bycat[e.category].count++})
          return Object.entries(bycat).sort((a,b)=>b[1].total-a[1].total).map(([cat,v])=>(<div key={cat} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #f1f5f9'}}><div><div style={{fontSize:13,fontWeight:600,color:'#0f172a',textTransform:'capitalize'}}>{cat.replace(/_/g,' ')}</div><div style={{fontSize:11,color:'#94a3b8'}}>{v.count} entr{v.count!==1?'ies':'y'}</div></div><div style={{fontSize:14,fontWeight:700,color:'#dc2626'}}>{fmt(v.total)}</div></div>))
        })()}
        {tmExpTotal>0&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',paddingTop:10,marginTop:4,borderTop:'1px solid #e2e8f0'}}><span style={{fontSize:13,fontWeight:700,color:'#64748b'}}>Total expenses</span><span style={{fontSize:14,fontWeight:800,color:'#dc2626'}}>{fmt(tmExpTotal)}</span></div>}
      </Card>

      {/* ACTUAL INCOME CARD */}
      <div style={{borderRadius:20,overflow:'hidden',marginBottom:8}}>
        {/* Header */}
        <div style={{background:'linear-gradient(135deg,#16a34a 0%,#059669 100%)',padding:'20px 20px 0'}}>
          <div style={{fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.12em',color:'rgba(255,255,255,0.65)',marginBottom:6}}>Actual income  this month</div>
          <div style={{fontSize:11,color:'rgba(255,255,255,0.5)',marginBottom:16}}>After referral commissions and all expenses</div>
          <div style={{fontSize:36,fontWeight:900,color:'#fff',letterSpacing:'-1px',lineHeight:1,marginBottom:4}}>{fmt(tmReal-tmExpTotal)}</div>
          <div style={{display:'flex',alignItems:'center',gap:8,paddingBottom:20}}>
            {(()=>{const pct=lmReal>0?Math.round(((tmReal-tmExpTotal)-(lmReal-lmExpTotal))/(lmReal-lmExpTotal)*100):null;if(pct===null)return null;const up=pct>=0;return(<span style={{display:'inline-flex',alignItems:'center',gap:4,background:'rgba(255,255,255,0.15)',color:'#fff',fontSize:12,fontWeight:700,padding:'3px 10px',borderRadius:100}}>{up?'+ ':''}{pct}% vs last month</span>)})()}
          </div>
        </div>
        {/* Breakdown */}
        <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderTop:'none',padding:'16px 20px',borderRadius:'0 0 20px 20px'}}>
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'#16a34a',flexShrink:0}}/>
                <span style={{fontSize:12,color:'#374151'}}>Gross income</span>
              </div>
              <span style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(tmTotal)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'#d97706',flexShrink:0}}/>
                <span style={{fontSize:12,color:'#374151'}}>Ref commissions</span>
              </div>
              <span style={{fontSize:13,fontWeight:700,color:'#d97706'}}>- {fmt(tmComm)}</span>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:8,height:8,borderRadius:'50%',background:'#dc2626',flexShrink:0}}/>
                <span style={{fontSize:12,color:'#374151'}}>Total expenses</span>
              </div>
              <span style={{fontSize:13,fontWeight:700,color:'#dc2626'}}>- {fmt(tmExpTotal)}</span>
            </div>
            <div style={{height:1,background:'#d1fae5',margin:'2px 0'}}/>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <div style={{width:10,height:10,borderRadius:'50%',background:'#059669',flexShrink:0}}/>
                <span style={{fontSize:13,fontWeight:800,color:'#065f46'}}>Actual income</span>
              </div>
              <span style={{fontSize:15,fontWeight:900,color:'#059669'}}>{fmt(tmReal-tmExpTotal)}</span>
            </div>
          </div>
        </div>
      </div>
      {/* MONTHLY COMPARISON CHART */}
      <SecL>Monthly actual income comparison</SecL>
      <Card>
        <div style={{fontSize:11,color:'#94a3b8',marginBottom:12}}>Tap months to toggle on/off</div>
        <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:16}}>
          {(()=>{const opts=[];for(let i=11;i>=0;i--){const d=new Date(today);d.setDate(1);d.setMonth(d.getMonth()-i);const m=d.toISOString().slice(0,7);const on=chartMonths.includes(m);const label=d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'});opts.push(<button key={m} onClick={()=>setChartMonths(prev=>on?prev.filter(x=>x!==m):[...prev,m].sort())} style={{padding:'4px 10px',borderRadius:100,border:on?'none':'1.5px solid #e2e8f0',background:on?'linear-gradient(135deg,#16a34a,#22c55e)':'#fff',color:on?'#fff':'#94a3b8',fontSize:11,fontWeight:700,cursor:'pointer'}}>{label}</button>)};return opts})()}
        </div>
        {chartMonths.length===0&&<div style={{textAlign:'center',padding:'24px 0',color:'#94a3b8',fontSize:13}}>Select at least one month above</div>}
        {chartMonths.length>0&&(()=>{
          const bars=chartMonths.map(m=>{const mInc=inc.filter(e=>e.date&&e.date.startsWith(m));const mExp=exp.filter(e=>e.date&&e.date.startsWith(m));const gross=sum(mInc);const comms=comm(mInc);const exps=sum(mExp);const actual=gross-comms-exps;const d=new Date(m+'-01');return{m,label:d.toLocaleDateString('en-IN',{month:'short',year:'2-digit'}),gross,comms,exps,actual}})
          const maxVal=Math.max(...bars.map(b=>Math.max(b.gross,1)))
          return(<div>
            <div style={{display:'flex',alignItems:'flex-end',gap:8,height:140,marginBottom:8}}>
              {bars.map(b=>{const grossH=Math.max(2,Math.round((b.gross/maxVal)*130));const actualH=Math.max(2,Math.round((Math.max(0,b.actual)/maxVal)*130));const cur=b.m===thisMonth;return(<div key={b.m} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}><div style={{fontSize:8,color:'#16a34a',fontWeight:700,textAlign:'center'}}>{b.actual>0?fmt(b.actual).replace('Rs ',''):''}</div><div style={{width:'100%',position:'relative',display:'flex',gap:2,alignItems:'flex-end',height:130}}><div style={{flex:1,height:grossH,background:cur?'linear-gradient(180deg,#93c5fd,#3b82f6)':'linear-gradient(180deg,#bfdbfe,#93c5fd)',borderRadius:'3px 3px 0 0'}}/><div style={{flex:1,height:actualH,background:cur?'linear-gradient(180deg,#4ade80,#16a34a)':'linear-gradient(180deg,#86efac,#4ade80)',borderRadius:'3px 3px 0 0'}}/></div><div style={{fontSize:9,color:cur?'#16a34a':'#94a3b8',fontWeight:cur?800:500,textAlign:'center'}}>{b.label}</div></div>)})}
            </div>
            <div style={{display:'flex',gap:16,justifyContent:'center',marginBottom:12}}>
              <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'#64748b'}}><div style={{width:10,height:10,borderRadius:2,background:'#93c5fd'}}/> Gross</div>
              <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'#64748b'}}><div style={{width:10,height:10,borderRadius:2,background:'#4ade80'}}/> Actual</div>
            </div>
            <div style={{borderTop:'1px solid #f1f5f9',paddingTop:10}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,marginBottom:6}}>
                <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,textTransform:'uppercase'}}>Month</div>
                <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,textAlign:'right',minWidth:60}}>Gross</div>
                <div style={{fontSize:9,color:'#dc2626',fontWeight:700,textAlign:'right',minWidth:60}}>Deduct</div>
                <div style={{fontSize:9,color:'#16a34a',fontWeight:700,textAlign:'right',minWidth:60}}>Actual</div>
              </div>
              {bars.map(b=><div key={b.m} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'6px 0',borderBottom:'1px solid #f8fafc',alignItems:'center'}}><span style={{fontSize:11,fontWeight:b.m===thisMonth?700:500,color:b.m===thisMonth?'#16a34a':'#374151'}}>{b.label}{b.m===thisMonth?' (now)':''}</span><span style={{fontSize:11,textAlign:'right',minWidth:60}}>{fmt(b.gross)}</span><span style={{fontSize:11,textAlign:'right',minWidth:60,color:'#dc2626'}}>-{fmt(b.comms+b.exps)}</span><span style={{fontSize:12,textAlign:'right',minWidth:60,color:'#059669',fontWeight:700}}>{fmt(b.actual)}</span></div>)}
            </div>
          </div>)
        })()}
      </Card>

      {/* SEGMENT BREAKDOWN */}
      <SecL>This month - segment breakdown</SecL>
      {(()=>{
        const clinInc=tmInc.filter(e=>['op','op_r','ip','ip_r'].includes(e.type))
        const clinGross=sum(clinInc);const clinComm=comm(clinInc)
        const clinExp=sum(tmExp.filter(e=>e.category!=='lab_to_lab'))
        const clinActual=clinGross-clinComm-clinExp
        const clinExpCats={}
        tmExp.filter(e=>e.category!=='lab_to_lab').forEach(e=>{if(!clinExpCats[e.category])clinExpCats[e.category]=0;clinExpCats[e.category]+=e.amount})
        const labInc=tmInc.filter(e=>['op_l','ip_l'].includes(e.type))
        const labGross=sum(labInc);const labComm=comm(labInc)
        const labToLab=sum(tmExp.filter(e=>e.category==='lab_to_lab'))
        const labActual=labGross-labComm-labToLab
        const SegCard=({title,color,bg,gross,commAmt,expBreakdown,actual,incTypes})=>(<div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:16,padding:'16px',marginBottom:12,boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12}}><div><div style={{fontSize:13,fontWeight:800,color:'#0f172a'}}>{title}</div><div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>{incTypes}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:10,color:'#94a3b8',fontWeight:600}}>Actual income</div><div style={{fontSize:20,fontWeight:900,color:actual>=0?color:'#dc2626'}}>{fmt(actual)}</div></div></div><div style={{background:'#f8fafc',borderRadius:10,padding:'10px 12px',display:'flex',flexDirection:'column',gap:7}}><div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#475569'}}>Gross income</span><span style={{fontWeight:700,color:'#16a34a'}}>{fmt(gross)}</span></div><div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#475569'}}>Ref commissions</span><span style={{fontWeight:700,color:'#d97706'}}>- {fmt(commAmt)}</span></div>{Object.entries(expBreakdown).filter(([,v])=>v>0).map(([cat,v])=>(<div key={cat} style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#475569',textTransform:'capitalize'}}>{cat.replace(/_/g,' ')}</span><span style={{fontWeight:600,color:'#dc2626'}}>- {fmt(v)}</span></div>))}<div style={{height:1,background:'#e2e8f0',margin:'2px 0'}}/><div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:800}}><span style={{color:'#0f172a'}}>= Actual</span><span style={{color:actual>=0?color:'#dc2626'}}>{fmt(actual)}</span></div></div></div>)
        return(<><SegCard title="Clinical and Pharmacy" color="#0891b2" bg="#ecfeff" gross={clinGross} commAmt={clinComm} expBreakdown={clinExpCats} actual={clinActual} incTypes="OP + OP-Pharmacy + IP + IP-Pharmacy"/><SegCard title="Laboratory" color="#7c3aed" bg="#f5f3ff" gross={labGross} commAmt={labComm} expBreakdown={{'Lab to lab':labToLab}} actual={labActual} incTypes="OP-Lab + IP-Lab"/></>)
      })()}

      {/* MEDICAL SUPPLIES */}
      <SecL>Medical supplies ordered - this month</SecL>
      <Card>
        {(()=>{
          const supplies=tmExp.filter(e=>e.category==='supplies').slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))
          const totalSupplies=sum(supplies)
          if(!supplies.length)return(<div style={{textAlign:'center',padding:'16px 0',color:'#94a3b8',fontSize:13}}>No medical supplies recorded this month</div>)
          return(<div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,paddingBottom:10,borderBottom:'2px solid #f1f5f9'}}><span style={{fontSize:12,color:'#64748b',fontWeight:600}}>{supplies.length} entr{supplies.length!==1?'ies':'y'}</span><span style={{fontSize:15,fontWeight:900,color:'#dc2626'}}>Total: {fmt(totalSupplies)}</span></div>{supplies.map((e,i)=>(<div key={e.id||i} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'9px 0',borderBottom:'1px solid #f8fafc'}}><div style={{flex:1,paddingRight:12}}><div style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>{e.description||'Medical supplies'}</div><div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{fmtD(e.date)} - {e.payment||'cash'}</div></div><div style={{fontSize:14,fontWeight:700,color:'#dc2626',flexShrink:0}}>{fmt(e.amount)}</div></div>))}</div>)
        })()}
      </Card>

      {/* AREA PIE CHART */}
      <SecL>Area-wise patients - this month</SecL>
      <Card>
        {(()=>{
          const areaMap={}
          db.ref_doctors.forEach(d=>{areaMap[d.name]=d.area||'No area'})
          const areaData={}
          tmInc.forEach(e=>{if(!e.ref_doctor||!e.ref_doctor.trim())return;const area=areaMap[e.ref_doctor]||'No area';if(!areaData[area])areaData[area]={area,pats:new Set(),docs:new Set(),income:0};if(e.patient_name)areaData[area].pats.add(e.patient_name.trim().toLowerCase());areaData[area].docs.add(e.ref_doctor);areaData[area].income+=e.amount})
          const areas=Object.values(areaData).map(a=>({...a,patients:a.pats.size,doctors:a.docs.size})).sort((a,b)=>b.patients-a.patients)
          if(!areas.length)return(<div style={{textAlign:'center',padding:'16px 0',color:'#94a3b8',fontSize:13}}>No referral data this month. Add area to doctors in Ref Doctors tab.</div>)
          const totalPats=areas.reduce((a,r)=>a+r.patients,0)||1
          const COLORS=['#3b82f6','#16a34a','#d97706','#7c3aed','#dc2626','#0891b2','#db2777','#65a30d']
          const size=160;const cx=80;const cy=80;const r=68;const ir=36
          let startAngle=0
          const slices=areas.map((a,i)=>{const pct=a.patients/totalPats;const angle=pct*2*Math.PI;const x1=cx+r*Math.sin(startAngle);const y1=cy-r*Math.cos(startAngle);const x2=cx+r*Math.sin(startAngle+angle);const y2=cy-r*Math.cos(startAngle+angle);const ix1=cx+ir*Math.sin(startAngle);const iy1=cy-ir*Math.cos(startAngle);const ix2=cx+ir*Math.sin(startAngle+angle);const iy2=cy-ir*Math.cos(startAngle+angle);const large=angle>Math.PI?1:0;const path='M '+ix1+' '+iy1+' L '+x1+' '+y1+' A '+r+' '+r+' 0 '+large+' 1 '+x2+' '+y2+' L '+ix2+' '+iy2+' A '+ir+' '+ir+' 0 '+large+' 0 '+ix1+' '+iy1+' Z';startAngle+=angle;return{...a,path,color:COLORS[i%COLORS.length],pct:Math.round(pct*100)}})
          return(<div><div style={{display:'flex',alignItems:'center',gap:16,marginBottom:16}}><svg width={size} height={size} viewBox={'0 0 '+size+' '+size}>{slices.map((s,i)=><path key={i} d={s.path} fill={s.color} stroke="#fff" strokeWidth="2"/>)}<text x={cx} y={cy-5} textAnchor="middle" style={{fontSize:'11px',fontWeight:'bold',fill:'#0f172a'}}>{totalPats}</text><text x={cx} y={cy+9} textAnchor="middle" style={{fontSize:'9px',fill:'#94a3b8'}}>patients</text></svg><div style={{flex:1}}>{slices.map((s,i)=><div key={i} style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}><div style={{width:10,height:10,borderRadius:'50%',background:s.color,flexShrink:0}}/><div style={{flex:1}}><div style={{fontSize:12,fontWeight:700,color:'#0f172a'}}>{s.area}</div><div style={{fontSize:10,color:'#94a3b8'}}>{s.doctors} dr</div></div><div style={{textAlign:'right'}}><div style={{fontSize:12,fontWeight:700}}>{s.patients} pts</div><div style={{fontSize:10,color:'#94a3b8'}}>{s.pct}%</div></div></div>)}</div></div><div style={{borderTop:'1px solid #f1f5f9',paddingTop:10,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}><div style={{background:'#f8fafc',borderRadius:8,padding:'8px',textAlign:'center'}}><div style={{fontSize:9,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>Total areas</div><div style={{fontSize:16,fontWeight:800,color:'#6366f1'}}>{areas.length}</div></div><div style={{background:'#f8fafc',borderRadius:8,padding:'8px',textAlign:'center'}}><div style={{fontSize:9,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>Patients</div><div style={{fontSize:16,fontWeight:800,color:'#16a34a'}}>{totalPats}</div></div></div></div>)
        })()}
      </Card>

      {/* SELF vs REFERRAL */}
      <SecL>Self vs referral patients - this month</SecL>
      <Card>
        <div style={{marginBottom:20}}>
          <div style={{display:'flex',borderRadius:12,overflow:'hidden',height:28,marginBottom:8}}>
            <div style={{width:svSelfPct+'%',background:'linear-gradient(90deg,#3b82f6,#60a5fa)',display:'flex',alignItems:'center',justifyContent:'center',minWidth:svSelfPct>10?'auto':0}}>
              {svSelfPct>12&&<span style={{fontSize:11,fontWeight:800,color:'#fff'}}>{svSelfPct}%</span>}
            </div>
            <div style={{flex:1,background:'linear-gradient(90deg,#16a34a,#22c55e)',display:'flex',alignItems:'center',justifyContent:'center'}}>
              {svRefPct>12&&<span style={{fontSize:11,fontWeight:800,color:'#fff'}}>{svRefPct}%</span>}
            </div>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#94a3b8',fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em'}}>
            <span>Self patients</span>
            <span>Referral patients</span>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:16}}>
          <div style={{background:'linear-gradient(160deg,#eff6ff,#dbeafe)',border:'1px solid #bfdbfe',borderRadius:14,padding:'16px 14px'}}>
            <div style={{fontSize:10,color:'#1d4ed8',fontWeight:700,textTransform:'uppercase',marginBottom:8}}>Self patients</div>
            <div style={{fontSize:32,fontWeight:900,color:'#1d4ed8',lineHeight:1,marginBottom:4}}>{svSelfCount}</div>
            <div style={{fontSize:11,color:'#3b82f6',fontWeight:600,marginBottom:8}}>{svSelfPct}% of all</div>
            <div style={{height:1,background:'#bfdbfe',marginBottom:8}}/>
            <div style={{fontSize:11,color:'#1d4ed8',fontWeight:600}}>{fmt(svSelfInc)}</div>
            <div style={{fontSize:10,color:'#93c5fd',marginTop:2}}>No commission</div>
          </div>
          <div style={{background:'linear-gradient(160deg,#f0fdf4,#dcfce7)',border:'1px solid #bbf7d0',borderRadius:14,padding:'16px 14px'}}>
            <div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:8}}>Referral patients</div>
            <div style={{fontSize:32,fontWeight:900,color:'#15803d',lineHeight:1,marginBottom:4}}>{svRefCount}</div>
            <div style={{fontSize:11,color:'#16a34a',fontWeight:600,marginBottom:8}}>{svRefPct}% of all</div>
            <div style={{height:1,background:'#bbf7d0',marginBottom:8}}/>
            <div style={{fontSize:11,color:'#15803d',fontWeight:600}}>{fmt(svRefInc)}</div>
            <div style={{fontSize:10,color:'#86efac',marginTop:2}}>Commission: {fmt(svRefComm)}</div>
          </div>
        </div>
        <div style={{background:'#f8fafc',borderRadius:10,padding:'12px 14px',display:'flex',alignItems:'flex-start',gap:12}}>
          <div style={{width:32,height:32,borderRadius:8,background:svRefPct>50?'#f0fdf4':'#eff6ff',border:'1.5px solid '+(svRefPct>50?'#bbf7d0':'#bfdbfe'),display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,fontSize:'1.1rem'}}>{svRefPct>50?'G':'B'}</div>
          <div style={{fontSize:12,color:'#475569',lineHeight:1.7}}>
            {svRefPct>60&&<span><strong style={{color:'#15803d'}}>Referral-heavy hospital.</strong> Over 60% patients come via referral doctors. Keep those relationships strong.</span>}
            {svRefPct>30&&svRefPct<=60&&<span><strong style={{color:'#1d4ed8'}}>Good balance.</strong> Healthy mix of self and referred patients.</span>}
            {svRefPct<=30&&<span><strong style={{color:'#1d4ed8'}}>Self-driven practice.</strong> Most patients come directly. Adding referral doctors could grow income.</span>}
          </div>
        </div>
      </Card>

      {/* LOST REFERRAL DOCTORS */}
      <SecL>Referral doctors - activity tracker</SecL>
      <Card>
        {(()=>{
          const months=[]
          for(let i=1;i<=7;i++){const d=new Date(today);d.setDate(1);d.setMonth(d.getMonth()-i);months.push(d.toISOString().slice(0,7))}
          // Build doctor activity map - which months each doctor sent patients
          const docActivity={}
          inc.forEach(e=>{
            if(!e.ref_doctor||!e.ref_doctor.trim())return
            const m=e.date&&e.date.slice(0,7)
            if(!m)return
            if(!docActivity[e.ref_doctor])docActivity[e.ref_doctor]={name:e.ref_doctor,byMonth:{},timeline:[]}
            if(!docActivity[e.ref_doctor].byMonth[m])docActivity[e.ref_doctor].byMonth[m]=[]
            docActivity[e.ref_doctor].byMonth[m].push(e)
            docActivity[e.ref_doctor].timeline.push(e)
          })
          // Find doctors who sent patients in past 7 months but NOT this month
          const lostDocs=Object.values(docActivity).filter(d=>{
            const hasThisMonth=!!(d.byMonth[thisMonth]&&d.byMonth[thisMonth].length)
            const hasPast=months.some(m=>d.byMonth[m]&&d.byMonth[m].length)
            return hasPast&&!hasThisMonth
          })
          // Group by how many months ago they last sent
          const groups={}
          lostDocs.forEach(d=>{
            let lastActive=null
            for(let i=1;i<=7;i++){
              const m=months[i-1]
              if(d.byMonth[m]&&d.byMonth[m].length){lastActive=i;break}
            }
            if(lastActive){
              if(!groups[lastActive])groups[lastActive]=[]
              groups[lastActive].push({...d,lastActive})
            }
          })
          if(!lostDocs.length)return(<div style={{textAlign:'center',padding:'20px 0',color:'#94a3b8',fontSize:13}}>All your referral doctors are active this month!</div>)
          return(<div>
            <div style={{display:'flex',alignItems:'center',gap:8,padding:'10px 12px',background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:10,marginBottom:16}}>
              <div style={{fontSize:'1.1rem'}}>A</div>
              <div style={{fontSize:12,color:'#92400e'}}><strong>{lostDocs.length} referral doctor{lostDocs.length!==1?'s':''}</strong> sent patients recently but not this month. Time to reconnect!</div>
            </div>
            {[1,2,3,4,5,6,7].map(n=>{
              const grp=groups[n]||[]
              if(!grp.length)return null
              const d2=new Date(today);d2.setDate(1);d2.setMonth(d2.getMonth()-n)
              const mLabel=d2.toLocaleDateString('en-IN',{month:'long',year:'numeric'})
              const urgency=n===1?{bg:'#fef2f2',border:'#fecaca',dot:'#ef4444',tx:'#991b1b',label:'Last month - follow up now'}:n<=3?{bg:'#fff7ed',border:'#fed7aa',dot:'#f97316',tx:'#9a3412',label:`${n} months ago - needs attention`}:{bg:'#f8fafc',border:'#e2e8f0',dot:'#94a3b8',tx:'#475569',label:`${n} months ago`}
              return(<div key={n} style={{marginBottom:16}}>
                <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
                  <div style={{width:10,height:10,borderRadius:'50%',background:urgency.dot,flexShrink:0}}/>
                  <div style={{fontSize:12,fontWeight:700,color:urgency.tx}}>{mLabel}</div>
                  <div style={{fontSize:11,color:'#94a3b8'}}>{urgency.label}</div>
                  <div style={{marginLeft:'auto',fontSize:11,fontWeight:700,color:urgency.tx}}>{grp.length} doctor{grp.length!==1?'s':''}</div>
                </div>
                {grp.map(doc=>{
                  const lastMonthEntries=doc.byMonth[months[n-1]]||[]
                  const allRecent=doc.timeline.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).slice(0,5)
                  const totalInc=doc.timeline.reduce((a,e)=>a+e.amount,0)
                  const [open,setOpen]=useState(false)
                  return(<div key={doc.name} style={{background:urgency.bg,border:'1px solid '+urgency.border,borderRadius:12,padding:'12px 14px',marginBottom:8}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,cursor:'pointer'}} onClick={()=>setOpen(!open)}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:700,color:'#0f172a'}}>Dr. {doc.name}</div>
                        <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>Last active: {mLabel} - {lastMonthEntries.length} patient{lastMonthEntries.length!==1?'s':''} - Total: {fmt(totalInc)}</div>
                      </div>
                      <div style={{fontSize:18,color:'#94a3b8',fontWeight:300}}>{open?'-':'+'}</div>
                    </div>
                    {open&&<div style={{marginTop:10,paddingTop:10,borderTop:'1px solid '+urgency.border}}>
                      <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Recent activity (last 5 entries)</div>
                      {allRecent.map((e,i)=>{const it=ITYPES.find(t=>t.key===e.type);return(<div key={i} style={{display:'flex',alignItems:'center',gap:8,padding:'5px 0',borderBottom:'1px solid rgba(0,0,0,0.05)'}}><div style={{fontSize:11,color:'#64748b',flexShrink:0,minWidth:72}}>{fmtD(e.date)}</div><div style={{flex:1,fontSize:11,color:'#0f172a',fontWeight:500}}>{e.patient_name||'Patient'}</div><TypeTag t={e.type}/><div style={{fontSize:11,fontWeight:700,color:'#16a34a',flexShrink:0}}>{fmt(e.amount)}</div></div>)})}
                      <div style={{marginTop:8,fontSize:11,color:'#475569'}}>Total over lifetime: <strong style={{color:'#0f172a'}}>{doc.timeline.length} entries - {fmt(totalInc)}</strong></div>
                    </div>}
                  </div>)
                })}
              </div>)
            })}
          </div>)
        })()}
      </Card>
    </div>
  )
}

import{createRoot}from'react-dom/client';createRoot(document.getElementById('root')).render(<App/>)
