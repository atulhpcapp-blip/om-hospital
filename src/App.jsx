import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase.js'

const ITYPES=[{key:'op',label:'OP',full:'OP Consultation'},{key:'ip',label:'IP',full:'IP Charges'},{key:'op_r',label:'OP-R',full:'OP Pharmacy'},{key:'ip_r',label:'IP-R',full:'IP Pharmacy'},{key:'op_l',label:'OP-L',full:'OP Lab'},{key:'ip_l',label:'IP-L',full:'IP Lab'},{key:'vc',label:'VC',full:'Visiting Consultant'}]
const ECATS=[{key:'ref_paid',label:'Referral commission paid'},{key:'rent',label:'Hospital rent'},{key:'electricity',label:'Electricity'},{key:'water',label:'Water'},{key:'salary',label:'Staff salary'},{key:'supplies',label:'Medical supplies'},{key:'lab_to_lab',label:'Lab to lab expenses'},{key:'consultant_fee',label:'Consultant fee paid'},{key:'municipality',label:'Municipality'},{key:'biomedical_bags',label:'Biomedical waste bags'},{key:'stationary',label:'Stationary'},{key:'washroom_cleaner',label:'Washroom cleaner'},{key:'biomedical_yearly',label:'Biomedical waste (yearly)'},{key:'misc',label:'Miscellaneous'}]
const PMODES=['cash','upi','card','credit','other']
const MOS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MOFULL=['January','February','March','April','May','June','July','August','September','October','November','December']
const COMM={op:0,ip:0.40,op_r:0.40,ip_r:0.40,op_l:0.50,ip_l:0.50,vc:0}
const CLBL={op:'None',ip:'40%',op_r:'40%',ip_r:'40%',op_l:'50%',ip_l:'50%',vc:'None'}
const TC={op:['#dbeafe','#1d4ed8'],ip:['#dcfce7','#16a34a'],op_r:['#fef3c7','#b45309'],ip_r:['#ffedd5','#c2410c'],op_l:['#fce7f3','#9d174d'],ip_l:['#f3e8ff','#7e22ce'],vc:['#f0fdf4','#065f46']}
const ROLES=['admin','management','accounts','staff']
const PLANS=[{key:'trial',label:'Trial (30 days)',price:0},{key:'starter',label:'Starter',price:999},{key:'pro',label:'Pro',price:1999},{key:'enterprise',label:'Enterprise',price:4999}]
const toEmail=u=>`${u.toLowerCase().replace(/\s+/g,'')}@omhospital.app`

const todayStr=()=>new Date().toISOString().split('T')[0]
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6)
const fmt=n=>'₹'+(Math.round(n)||0).toLocaleString('en-IN')
const fmtD=d=>{if(!d)return'—';const x=new Date(d+'T00:00:00');return`${x.getDate()} ${MOS[x.getMonth()]} ${x.getFullYear()}`}
const getRefDoc=(e,pats)=>e.ref_doctor||pats.find(p=>p.id===e.patient_id)?.ref_doctor||null
const getComm=e=>(e.payment==='credit'||!e.ref_doctor)?0:e.amount*(COMM[e.type]||0)
const isCredit=e=>e.payment==='credit'
const sumInc=list=>{const r={};ITYPES.forEach(t=>{r[t.key]=list.filter(e=>e.type===t.key).reduce((a,e)=>a+e.amount,0)});r.total=Object.values(r).reduce((a,b)=>a+b,0);return r}
const sumExp=list=>{const r={};ECATS.forEach(c=>{r[c.key]=list.filter(e=>e.category===c.key).reduce((a,e)=>a+e.amount,0)});r.total=Object.values(r).reduce((a,b)=>a+b,0);return r}
const totalRef=(list,pats)=>list.reduce((a,e)=>a+(getRefDoc(e,pats)?getComm(e):0),0)
const cashTotal=list=>list.filter(e=>!isCredit(e)).reduce((a,e)=>a+e.amount,0)
const credTotal=list=>list.filter(e=>isCredit(e)).reduce((a,e)=>a+e.amount,0)
// Get all package payments from all patients, optionally filtered by date prefix
const getPkgPayments=(pats,datePrefix)=>{
  const all=[]
  pats.forEach(p=>{(p.payments||[]).forEach(py=>{
    if(!datePrefix||py.date?.startsWith(datePrefix))
      all.push({...py,patient_name:p.name,patient_id:p.id,ref_doctor:py.ref_doctor||p.ref_doctor||''})
  })})
  return all
}
const buildRef=(income,pats)=>{const docs={};income.forEach(e=>{const doc=getRefDoc(e,pats);const comm=getComm(e);if(!doc||!comm)return;if(!docs[doc])docs[doc]={name:doc,total_income:0,total_commission:0,by_type:{}};docs[doc].total_income+=e.amount;docs[doc].total_commission+=comm;if(!docs[doc].by_type[e.type])docs[doc].by_type[e.type]={income:0,commission:0};docs[doc].by_type[e.type].income+=e.amount;docs[doc].by_type[e.type].commission+=comm});return Object.values(docs).sort((a,b)=>b.total_commission-a.total_commission)}

const S={
  inp:{width:'100%',padding:'11px 14px',border:'1px solid #e5e7eb',borderRadius:12,fontSize:16,background:'#fff',color:'#111',boxSizing:'border-box',fontFamily:'inherit',outline:'none'},
  sel:{width:'100%',padding:'11px 14px',border:'1px solid #e5e7eb',borderRadius:12,fontSize:16,background:'#fff',color:'#111',boxSizing:'border-box',fontFamily:'inherit',outline:'none'},
  card:{background:'#fff',border:'1px solid #f0f0f0',borderRadius:14,padding:'14px 16px',marginBottom:12},
  sec:{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:'.06em',marginTop:16,marginBottom:8},
  pbtn:{width:'100%',padding:'13px',background:'#111',color:'#fff',border:'none',borderRadius:12,fontSize:15,fontWeight:700,cursor:'pointer',marginTop:4},
  gbtn:{padding:'9px 14px',background:'none',border:'1px solid #e5e7eb',borderRadius:10,fontSize:14,color:'#555',cursor:'pointer'},
  dbtn:{padding:'4px 10px',background:'none',border:'1px solid #fca5a5',borderRadius:6,fontSize:12,color:'#ef4444',cursor:'pointer'},
}
const Card=({children,style={}})=><div style={{...S.card,...style}}>{children}</div>
const SecL=({children})=><div style={S.sec}>{children}</div>
const PBtn=({children,onClick,disabled,style={}})=><button style={{...S.pbtn,opacity:disabled?.5:1,...style}} onClick={onClick} disabled={disabled}>{children}</button>
const GBtn=({children,onClick,style={}})=><button style={{...S.gbtn,...style}} onClick={onClick}>{children}</button>
const DBtn=({children,onClick})=><button style={S.dbtn} onClick={onClick}>{children}</button>
const Pill=({label,bg='#e5e7eb',tx='#555'})=><span style={{fontSize:10,padding:'2px 7px',borderRadius:20,background:bg,color:tx,fontWeight:700,marginLeft:4}}>{label}</span>
const TypeTag=({t})=>{const [bg,tx]=TC[t]||['#f0f0f0','#555'];const it=ITYPES.find(x=>x.key===t);return<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:bg,color:tx,fontWeight:700}}>{it?.label||t}</span>}
const Row=({left,sub,right,onClick})=>(
  <div onClick={onClick} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f5f5f5',cursor:onClick?'pointer':'default'}}>
    <div style={{flex:1,minWidth:0,paddingRight:8}}>
      <div style={{fontSize:13,fontWeight:500,color:'#111'}}>{left}</div>
      {sub&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>{sub}</div>}
    </div>
    <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>{right}</div>
  </div>
)
const MetGrid=({items})=>(
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
    {items.map((m,i)=>(
      <div key={i} style={{background:'#f9f9f9',borderRadius:12,padding:'10px 14px'}}>
        <div style={{fontSize:10,color:'#aaa',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:4,fontWeight:600}}>{m.label}</div>
        <div style={{fontSize:18,fontWeight:700,color:m.color||'#111'}}>{m.value}</div>
        {m.sub&&<div style={{fontSize:10,color:'#aaa',marginTop:2}}>{m.sub}</div>}
      </div>
    ))}
  </div>
)
const FInp=({label,value,onChange,...rest})=>(
  <div style={{marginBottom:10}}>
    {label&&<label style={{display:'block',fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:5,fontWeight:700}}>{label}</label>}
    <input style={S.inp} value={value} onChange={onChange} {...rest}/>
  </div>
)
const FSel=({label,value,onChange,children})=>(
  <div style={{marginBottom:10}}>
    {label&&<label style={{display:'block',fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:5,fontWeight:700}}>{label}</label>}
    <select style={S.sel} value={value} onChange={onChange}>{children}</select>
  </div>
)

/* ── CHART COMPONENTS ── */
const HBarChart=({data,title})=>{
  if(!data||!data.length)return null
  const max=Math.max(...data.map(d=>d.value),1)
  const rowH=34,labelW=72,W=300
  const h=data.length*rowH+16
  return(
    <div style={{marginTop:12,marginBottom:4}}>
      {title&&<div style={{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>{title}</div>}
      <svg viewBox={`0 0 ${W} ${h}`} style={{width:'100%',display:'block'}}>
        {data.map((d,i)=>{
          const bw=Math.max(d.value>0?(d.value/max)*(W-labelW-52):0,0)
          const y=i*rowH+8
          return(
            <g key={i}>
              <text x={labelW-6} y={y+13} textAnchor="end" fontSize={10} fill="#888" fontFamily="system-ui">{d.label}</text>
              {bw>0&&<rect x={labelW} y={y} width={bw} height={20} fill={d.color||'#111'} rx={4} opacity={0.85}/>}
              {bw===0&&<rect x={labelW} y={y+8} width={3} height={4} fill="#e5e7eb" rx={1}/>}
              <text x={labelW+bw+5} y={y+14} fontSize={10} fill={d.color||'#555'} fontFamily="system-ui" fontWeight="600">{d.fmt||fmt(d.value)}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
const VBarChart=({data,title})=>{
  if(!data||!data.length)return null
  const max=Math.max(...data.map(d=>Math.max(d.v1||0,d.v2||0)),1)
  const W=300,H=110,PB=20,PT=6,bw=Math.max(Math.floor((W-16)/data.length)-2,3),cH=H-PB-PT
  return(
    <div style={{marginTop:12,marginBottom:4}}>
      {title&&<div style={{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>{title}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} style={{width:'100%',display:'block'}}>
        <line x1={8} y1={PT} x2={8} y2={H-PB} stroke="#f0f0f0" strokeWidth={1}/>
        <line x1={8} y1={H-PB} x2={W} y2={H-PB} stroke="#f0f0f0" strokeWidth={1}/>
        {data.map((d,i)=>{
          const x=10+i*(bw+2)
          const half=d.v2!==undefined?Math.floor(bw/2)-1:bw
          const h1=Math.max(d.v1>0?(d.v1/max)*cH:0,0)
          const h2=d.v2!==undefined?Math.max(d.v2>0?(d.v2/max)*cH:0,0):0
          return(
            <g key={i}>
              {d.v2!==undefined&&h2>0&&<rect x={x} y={PT+cH-h2} width={half} height={h2} fill="#ef4444" rx={2} opacity={0.75}/>}
              {h1>0&&<rect x={d.v2!==undefined?x+half+1:x} y={PT+cH-h1} width={half} height={h1} fill={d.color||'#16a34a'} rx={2} opacity={0.85}/>}
              {data.length<=14&&<text x={x+bw/2} y={H-5} textAnchor="middle" fontSize={7} fill="#bbb" fontFamily="system-ui">{d.label}</text>}
            </g>
          )
        })}
      </svg>
      {data[0]?.v2!==undefined&&<div style={{display:'flex',gap:12,marginTop:4}}>
        <span style={{fontSize:10,color:'#ef4444',display:'flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:2,background:'#ef4444',display:'inline-block'}}/> Expenses</span>
        <span style={{fontSize:10,color:'#16a34a',display:'flex',alignItems:'center',gap:4}}><span style={{width:8,height:8,borderRadius:2,background:'#16a34a',display:'inline-block'}}/> Revenue</span>
      </div>}
    </div>
  )
}
const DonutChart=({segments,title,centerLabel})=>{
  if(!segments||!segments.length)return null
  const total=segments.reduce((a,s)=>a+s.value,0)
  if(!total)return null
  const CX=65,CY=65,R=52,ri=30
  let angle=-Math.PI/2
  const paths=segments.map(s=>{
    const sweep=(s.value/total)*2*Math.PI
    const x1=CX+R*Math.cos(angle),y1=CY+R*Math.sin(angle)
    angle+=sweep
    const x2=CX+R*Math.cos(angle),y2=CY+R*Math.sin(angle)
    const xi1=CX+ri*Math.cos(angle),yi1=CY+ri*Math.sin(angle)
    const xi2=CX+ri*Math.cos(angle-sweep),yi2=CY+ri*Math.sin(angle-sweep)
    const lg=sweep>Math.PI?1:0
    return{d:`M${x1} ${y1}A${R} ${R} 0 ${lg} 1 ${x2} ${y2}L${xi1} ${yi1}A${ri} ${ri} 0 ${lg} 0 ${xi2} ${yi2}Z`,color:s.color,label:s.label,value:s.value}
  })
  return(
    <div style={{marginTop:12}}>
      {title&&<div style={{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>{title}</div>}
      <div style={{display:'flex',alignItems:'center',gap:16}}>
        <svg viewBox="0 0 130 130" style={{width:120,flexShrink:0}}>
          {paths.map((p,i)=><path key={i} d={p.d} fill={p.color} opacity={0.9}/>)}
          <text x={CX} y={CY-4} textAnchor="middle" fontSize={10} fill="#555" fontFamily="system-ui" fontWeight="700">{centerLabel||'Total'}</text>
          <text x={CX} y={CY+10} textAnchor="middle" fontSize={9} fill="#aaa" fontFamily="system-ui">income</text>
        </svg>
        <div style={{flex:1}}>
          {segments.map((s,i)=>(
            <div key={i} style={{display:'flex',alignItems:'center',gap:6,marginBottom:8}}>
              <div style={{width:10,height:10,borderRadius:3,background:s.color,flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:10,color:'#888'}}>{s.label}</div>
                <div style={{fontSize:13,fontWeight:700,color:s.color}}>{s.fmt||fmt(s.value)}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── COMMISSION PAYMENT FORM ── standalone to prevent keyboard close */
const CommPayForm=({docName,balance,onSave,onCancel})=>{
  const [date,setDate]=useState(todayStr())
  const [amount,setAmount]=useState(String(Math.round(balance)))
  const [pay,setPay]=useState('cash')
  const [busy,setBusy]=useState(false)
  const go=async()=>{
    const amt=parseFloat(amount);if(!amt||amt<=0){alert('Enter amount');return}
    setBusy(true);await onSave(amt,date,pay);setBusy(false)
  }
  return(
    <div style={{background:'#f9fafb',borderRadius:10,padding:'12px 14px',border:'1px solid #e5e7eb',marginTop:10}}>
      <div style={{fontSize:12,fontWeight:700,color:'#111',marginBottom:10}}>Pay Dr. {docName}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
        <div>
          <label style={{display:'block',fontSize:10,color:'#888',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:4,fontWeight:700}}>Date</label>
          <input style={S.inp} type="date" value={date} onChange={e=>setDate(e.target.value)}/>
        </div>
        <div>
          <label style={{display:'block',fontSize:10,color:'#888',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:4,fontWeight:700}}>Amount (₹)</label>
          <input style={S.inp} type="number" inputMode="numeric" placeholder="0" value={amount} onChange={e=>setAmount(e.target.value)}/>
        </div>
      </div>
      <div style={{marginBottom:10}}>
        <label style={{display:'block',fontSize:10,color:'#888',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:6,fontWeight:700}}>Payment mode</label>
        <div style={{display:'flex',gap:8}}>
          {['cash','upi','card'].map(m=>(
            <button key={m} onClick={()=>setPay(m)} style={{flex:1,padding:'9px 4px',border:pay===m?'2px solid #111':'1px solid #e5e7eb',borderRadius:8,background:pay===m?'#111':'#fff',color:pay===m?'#fff':'#555',fontSize:13,fontWeight:600,cursor:'pointer'}}>
              {m[0].toUpperCase()+m.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={onCancel} style={{flex:1,padding:'10px',background:'none',border:'1px solid #e5e7eb',borderRadius:10,fontSize:13,color:'#555',cursor:'pointer'}}>Cancel</button>
        <button onClick={go} disabled={busy} style={{flex:2,padding:'10px',background:'#16a34a',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer',opacity:busy?.6:1}}>
          {busy?'Saving…':'✓ Save payment'}
        </button>
      </div>
    </div>
  )
}

/* ── LOGIN ── */


/* ── SETTINGS PANEL ── */
const SettingsPanel=()=>{
  const [plans,setPlans]=useState({
    trial:{label:'Trial',days:30,price:0},
    starter:{label:'Starter',price:999,days:365},
    pro:{label:'Pro',price:1999,days:365},
    enterprise:{label:'Enterprise',price:4999,days:365},
  })
  const [appName,setAppName]=useState('HospTrack')
  const [support,setSupport]=useState('support@hosptrack.in')
  const [saved,setSaved]=useState(false)
  const save=()=>{
    // Save to localStorage for persistence
    localStorage.setItem('sa_settings',JSON.stringify({plans,appName,support}))
    setSaved(true)
    setTimeout(()=>setSaved(false),2000)
  }
  useEffect(()=>{
    const s=localStorage.getItem('sa_settings')
    if(s){const d=JSON.parse(s);setPlans(d.plans||plans);setAppName(d.appName||appName);setSupport(d.support||support)}
  },[])
  return(
    <div>
      <Card>
        <div style={{fontSize:14,fontWeight:700,marginBottom:16}}>App settings</div>
        <FInp label="App name" type="text" value={appName} onChange={e=>setAppName(e.target.value)}/>
        <FInp label="Support email" type="email" value={support} onChange={e=>setSupport(e.target.value)}/>
      </Card>
      <SecL>Plan pricing</SecL>
      {Object.entries(plans).map(([key,plan])=>(
        <Card key={key}>
          <div style={{fontSize:13,fontWeight:700,color:'#111',marginBottom:12,display:'flex',alignItems:'center',gap:8}}>
            {plan.label}
            {key==='trial'&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#fef3c7',color:'#b45309',fontWeight:700}}>FREE</span>}
            {key==='pro'&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#dcfce7',color:'#16a34a',fontWeight:700}}>POPULAR</span>}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div>
              <label style={{display:'block',fontSize:10,color:'#888',textTransform:'uppercase',fontWeight:700,marginBottom:4}}>Price (₹/month)</label>
              <input style={{...S.inp,background:key==='trial'?'#f9f9f9':'#fff'}} type="number" inputMode="numeric" value={plan.price} disabled={key==='trial'} onChange={e=>setPlans({...plans,[key]:{...plan,price:parseInt(e.target.value)||0}})}/>
            </div>
            <div>
              <label style={{display:'block',fontSize:10,color:'#888',textTransform:'uppercase',fontWeight:700,marginBottom:4}}>Trial days</label>
              <input style={S.inp} type="number" inputMode="numeric" value={plan.days} onChange={e=>setPlans({...plans,[key]:{...plan,days:parseInt(e.target.value)||30}})}/>
            </div>
          </div>
          <div style={{fontSize:11,color:'#aaa',marginTop:4}}>
            {key==='trial'?`Free for ${plan.days} days then requires upgrade`:`₹${plan.price}/month · Billed monthly`}
          </div>
        </Card>
      ))}
      {saved&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'10px 14px',marginBottom:12,fontSize:13,color:'#16a34a',fontWeight:600}}>✅ Settings saved!</div>}
      <PBtn onClick={save}>Save settings</PBtn>
      <div style={{marginTop:16,background:'#f9f9f9',borderRadius:12,padding:'14px 16px'}}>
        <div style={{fontSize:11,fontWeight:700,color:'#aaa',textTransform:'uppercase',marginBottom:10}}>Current plan summary</div>
        {Object.entries(plans).map(([key,plan])=>(
          <div key={key} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f0f0f0',fontSize:13}}>
            <span style={{fontWeight:600}}>{plan.label}</span>
            <span style={{color:key==='trial'?'#b45309':'#111',fontWeight:key==='pro'?700:400}}>
              {key==='trial'?`Free · ${plan.days} days`:fmt(plan.price)+'/month'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── SUPER ADMIN DASHBOARD ── */
const SuperAdminDashboard=()=>{
  const [hospitals,setHospitals]=useState([])
  const [loading,setLoading]=useState(true)
  const [view,setView]=useState('list')
  const [sel,setSel]=useState(null)
  const [selUsers,setSelUsers]=useState([])
  const [nH,setNH]=useState({name:'',city:'',phone:'',plan:'trial',adminName:'',adminUser:'',adminPass:''})
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState(null)
  const planClr={trial:['#fef3c7','#b45309'],starter:['#dbeafe','#1d4ed8'],pro:['#dcfce7','#16a34a'],enterprise:['#f3e8ff','#7e22ce']}
  const load=async()=>{setLoading(true);const {data}=await supabase.from('hospitals').select('*').order('created_at',{ascending:false});setHospitals(data||[]);setLoading(false)}
  useEffect(()=>{load()},[])
  const openHosp=async h=>{setSel(h);setView('detail');const {data}=await supabase.from('profiles').select('*').eq('hospital_id',h.id);setSelUsers(data||[])}
  const updatePlan=async(id,plan)=>{const planEnd=plan==='trial'?new Date(Date.now()+30*86400000).toISOString().split('T')[0]:'2099-12-31';await supabase.from('hospitals').update({plan,plan_end:planEnd,is_active:true}).eq('id',id);load();if(sel)setSel({...sel,plan,plan_end:planEnd})}
  const toggleActive=async(id,cur)=>{await supabase.from('hospitals').update({is_active:!cur}).eq('id',id);load();if(sel)setSel({...sel,is_active:!cur})}
  const create=async()=>{
    if(!nH.name.trim()||!nH.adminName.trim()||!nH.adminUser.trim()||!nH.adminPass.trim()){setMsg({ok:false,t:'Fill all fields'});return}
    if(nH.adminPass.length<6){setMsg({ok:false,t:'Password min 6 chars'});return}
    setBusy(true);setMsg(null)
    const planEnd=nH.plan==='trial'?new Date(Date.now()+30*86400000).toISOString().split('T')[0]:'2099-12-31'
    const {data:hosp,error:he}=await supabase.from('hospitals').insert([{name:nH.name,city:nH.city,phone:nH.phone,plan:nH.plan,plan_end:planEnd}]).select().single()
    if(he){setMsg({ok:false,t:he.message});setBusy(false);return}
    const {data:au,error:ae}=await supabase.auth.signUp({email:toEmail(nH.adminUser),password:nH.adminPass,options:{data:{name:nH.adminName}}})
    if(ae){setMsg({ok:false,t:ae.message});setBusy(false);return}
    await supabase.from('profiles').upsert({id:au.user.id,name:nH.adminName,username:nH.adminUser.toLowerCase(),role:'admin',hospital_id:hosp.id})
    setMsg({ok:true,t:'Created!',u:nH.adminUser,p:nH.adminPass,h:nH.name})
    setNH({name:'',city:'',phone:'',plan:'trial',adminName:'',adminUser:'',adminPass:''})
    load();setBusy(false)
  }
  if(view==='detail'&&sel)return(
    <div style={{maxWidth:520,margin:'0 auto',background:'#f7f7f7',minHeight:'100vh'}}>
      <div style={{background:'#111',color:'#fff',padding:'14px 16px',position:'sticky',top:0,zIndex:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontWeight:700,fontSize:15}}>🏥 {sel.name}</div><div style={{fontSize:11,color:'#9ca3af'}}>{sel.city} · Super Admin</div></div>
        <button onClick={()=>setView('list')} style={{color:'#9ca3af',background:'none',border:'1px solid #374151',borderRadius:8,padding:'5px 10px',fontSize:12,cursor:'pointer'}}>← Back</button>
      </div>
      <div style={{padding:'16px 16px 60px'}}>
        <Card><Row left="City" right={sel.city||'—'}/><Row left="Phone" right={sel.phone||'—'}/><Row left="Plan" right={<span style={{fontSize:11,padding:'3px 9px',borderRadius:20,background:(planClr[sel.plan]||planClr.trial)[0],color:(planClr[sel.plan]||planClr.trial)[1],fontWeight:700}}>{sel.plan}</span>}/><Row left="Plan end" right={fmtD(sel.plan_end)}/><Row left="Status" right={sel.is_active?<span style={{color:'#16a34a',fontWeight:600}}>✅ Active</span>:<span style={{color:'#ef4444',fontWeight:600}}>❌ Suspended</span>}/></Card>
        <SecL>Change plan</SecL>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>{PLANS.map(p=>(<button key={p.key} onClick={()=>updatePlan(sel.id,p.key)} style={{padding:'10px 8px',border:sel.plan===p.key?'2px solid #111':'1px solid #e5e7eb',borderRadius:12,background:sel.plan===p.key?'#111':'#fff',color:sel.plan===p.key?'#fff':'#555',cursor:'pointer',textAlign:'center'}}><div style={{fontSize:12,fontWeight:700}}>{p.label}</div>{p.price>0&&<div style={{fontSize:10,marginTop:2,opacity:.7}}>{fmt(p.price)}/mo</div>}</button>))}</div>
        <button onClick={()=>toggleActive(sel.id,sel.is_active)} style={{width:'100%',padding:'12px',background:sel.is_active?'#fef2f2':'#f0fdf4',color:sel.is_active?'#dc2626':'#16a34a',border:`1px solid ${sel.is_active?'#fecaca':'#bbf7d0'}`,borderRadius:12,fontSize:14,fontWeight:600,cursor:'pointer',marginBottom:14}}>{sel.is_active?'🚫 Suspend':'✅ Activate'}</button>
        <SecL>Staff ({selUsers.length})</SecL>
        <Card>{selUsers.length===0?<div style={{textAlign:'center',padding:'12px 0',color:'#ccc',fontSize:13}}>No staff</div>:selUsers.map(u=><Row key={u.id} left={u.name||'—'} sub={`@${u.username||'—'}`} right={<span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:'#f0f0f0',color:'#555',fontWeight:600}}>{u.role}</span>}/>)}</Card>
      </div>
    </div>
  )
  return(
    <div style={{maxWidth:520,margin:'0 auto',background:'#f7f7f7',minHeight:'100vh'}}>
      <div style={{background:'#111',color:'#fff',padding:'14px 16px 0',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div><div style={{fontWeight:700,fontSize:15}}>⚡ Super Admin</div><div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>All hospitals</div></div>
          <button onClick={()=>supabase.auth.signOut()} style={{color:'#9ca3af',background:'none',border:'1px solid #374151',borderRadius:8,padding:'5px 10px',fontSize:12,cursor:'pointer'}}>Logout</button>
        </div>
        <div style={{display:'flex',gap:0,marginBottom:-1}}>
          {[{k:'list',l:'Hospitals'},{k:'add',l:'+ Add'},{k:'settings',l:'⚙️ Settings'}].map(t=>(<button key={t.k} onClick={()=>{setView(t.k);setMsg(null)}} style={{padding:'9px 14px',fontSize:12,fontWeight:600,border:'none',background:'none',color:view===t.k?'#fff':'#6b7280',borderBottom:view===t.k?'2px solid #fff':'2px solid transparent',cursor:'pointer'}}>{t.l}</button>))}
        </div>
      </div>
      <div style={{padding:'16px 16px 60px'}}>
        {view==='list'&&(<>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
            {[{label:'Total',value:hospitals.length},{label:'Active',value:hospitals.filter(h=>h.is_active).length,color:'#16a34a'},{label:'Trial',value:hospitals.filter(h=>h.plan==='trial').length,color:'#b45309'},{label:'Paid',value:hospitals.filter(h=>h.plan!=='trial'&&h.is_active).length,color:'#1d4ed8'}].map((m,i)=>(<div key={i} style={{background:'#f9f9f9',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#aaa',textTransform:'uppercase',fontWeight:600,marginBottom:4}}>{m.label}</div><div style={{fontSize:22,fontWeight:700,color:m.color||'#111'}}>{m.value}</div></div>))}
          </div>
          {loading?<div style={{textAlign:'center',padding:32,color:'#ccc'}}>Loading…</div>:hospitals.length===0?<div style={{textAlign:'center',padding:'40px 0',color:'#ccc',fontSize:13}}>No hospitals yet</div>:hospitals.map(h=>(
            <Card key={h.id} style={{cursor:'pointer'}} >
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}} onClick={()=>openHosp(h)}>
                <div><div style={{fontSize:14,fontWeight:700}}>{h.name}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>{h.city||'—'} · {fmtD(h.created_at?.split('T')[0])}</div><div style={{marginTop:6,display:'flex',gap:6,flexWrap:'wrap'}}><span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:(planClr[h.plan]||planClr.trial)[0],color:(planClr[h.plan]||planClr.trial)[1],fontWeight:700}}>{h.plan}</span>{!h.is_active&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#fee2e2',color:'#dc2626',fontWeight:700}}>Suspended</span>}</div></div>
                <span style={{fontSize:18,color:'#aaa'}}>›</span>
              </div>
            </Card>
          ))}
        </>)}
        {view==='add'&&(
          <Card>
            <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Add new hospital</div>
            <SecL>Hospital details</SecL>
            <FInp label="Hospital name *" type="text" placeholder="City Care Hospital" value={nH.name} onChange={e=>setNH({...nH,name:e.target.value})}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <FInp label="City" type="text" placeholder="Hyderabad" value={nH.city} onChange={e=>setNH({...nH,city:e.target.value})}/>
              <FInp label="Phone" type="tel" placeholder="9999999999" value={nH.phone} onChange={e=>setNH({...nH,phone:e.target.value})}/>
            </div>
            <FSel label="Plan" value={nH.plan} onChange={e=>setNH({...nH,plan:e.target.value})}>{PLANS.map(p=><option key={p.key} value={p.key}>{p.label}{p.price>0?' — ₹'+p.price+'/mo':' — Free 30 days'}</option>)}</FSel>
            <SecL>Admin account</SecL>
            <FInp label="Admin full name *" type="text" placeholder="Admin name" value={nH.adminName} onChange={e=>setNH({...nH,adminName:e.target.value})}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <FInp label="Username *" type="text" placeholder="admin" value={nH.adminUser} onChange={e=>setNH({...nH,adminUser:e.target.value.toLowerCase().replace(/\s+/g,'')})} autoCapitalize="none"/>
              <FInp label="Password *" type="text" placeholder="min 6 chars" value={nH.adminPass} onChange={e=>setNH({...nH,adminPass:e.target.value})}/>
            </div>
            {msg&&<div style={{fontSize:13,color:msg.ok?'#16a34a':'#dc2626',marginBottom:10,padding:'10px 12px',borderRadius:8,background:msg.ok?'#f0fdf4':'#fef2f2'}}>{msg.t}</div>}
            <PBtn onClick={create} disabled={busy}>{busy?'Creating…':'Create hospital & admin'}</PBtn>
            {msg?.ok&&<div style={{marginTop:12,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:'14px 16px',fontSize:13,lineHeight:2}}>🏥 {msg.h}<br/>👤 Username: <strong>{msg.u}</strong><br/>🔑 Password: <strong>{msg.p}</strong></div>}
          </Card>
        )}
        {view==='settings'&&(
          <SettingsPanel/>
        )}
      </div>
    </div>
  )
}

/* ── HOSPITAL ONBOARDING (self-signup) ── */
const HospitalOnboarding=({onBack})=>{
  const [step,setStep]=useState(1)
  const [hF,setHF]=useState({name:'',city:'',phone:''})
  const [aF,setAF]=useState({name:'',username:'',pass:'',confirm:''})
  const [busy,setBusy]=useState(false)
  const [err,setErr]=useState('')
  const [done,setDone]=useState(null)
  const submit=async()=>{
    if(!aF.name.trim()||!aF.username.trim()||!aF.pass.trim()){setErr('All fields required');return}
    if(aF.pass.length<6){setErr('Password min 6 characters');return}
    if(aF.pass!==aF.confirm){setErr('Passwords do not match');return}
    setBusy(true);setErr('')
    const trialEnd=new Date(Date.now()+30*86400000).toISOString().split('T')[0]
    const {data:hosp,error:he}=await supabase.from('hospitals').insert([{name:hF.name,city:hF.city,phone:hF.phone,plan:'trial',plan_end:trialEnd}]).select().single()
    if(he){setErr(he.message);setBusy(false);return}
    const {data:au,error:ae}=await supabase.auth.signUp({email:toEmail(aF.username),password:aF.pass,options:{data:{name:aF.name}}})
    if(ae){setErr(ae.message);setBusy(false);return}
    await supabase.from('profiles').upsert({id:au.user.id,name:aF.name,username:aF.username.toLowerCase(),role:'admin',hospital_id:hosp.id})
    setDone({u:aF.username,p:aF.pass,h:hF.name,t:trialEnd});setBusy(false)
  }
  if(done)return(
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#f0f9ff 0%,#f7f7f7 100%)',padding:20}}>
      <div style={{width:'100%',maxWidth:400,textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:12}}>🎉</div>
        <div style={{fontSize:22,fontWeight:800,color:'#111',marginBottom:4}}>{done.h}</div>
        <div style={{fontSize:14,color:'#aaa',marginBottom:20}}>Your hospital is ready!</div>
        <Card style={{border:'1px solid #bbf7d0',background:'#f0fdf4',textAlign:'left'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#15803d',marginBottom:10}}>Save your login details:</div>
          <div style={{fontSize:14,color:'#111',lineHeight:2.2}}>👤 Username: <strong>{done.u}</strong><br/>🔑 Password: <strong>{done.p}</strong><br/>⏰ Trial expires: <strong>{fmtD(done.t)}</strong></div>
        </Card>
        <PBtn onClick={()=>window.location.reload()} style={{marginTop:14}}>Login to your hospital →</PBtn>
      </div>
    </div>
  )
  return(
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#f0f9ff 0%,#f7f7f7 100%)',padding:20}}>
      <div style={{maxWidth:420,margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:40,marginBottom:8}}>🏥</div>
          <div style={{fontSize:22,fontWeight:800,color:'#111'}}>Register your hospital</div>
          <div style={{fontSize:13,color:'#aaa',marginTop:4}}>Free 30-day trial · No credit card</div>
        </div>
        <div style={{display:'flex',gap:8,marginBottom:20}}>{[1,2].map(s=>(<div key={s} style={{flex:1,height:4,borderRadius:2,background:step>=s?'#111':'#e5e7eb'}}/>))}</div>
        {step===1&&(<Card>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Step 1 — Hospital details</div>
          <FInp label="Hospital / Clinic name *" type="text" placeholder="e.g. City Care Hospital" value={hF.name} onChange={e=>setHF({...hF,name:e.target.value})}/>
          <FInp label="City" type="text" placeholder="Your city" value={hF.city} onChange={e=>setHF({...hF,city:e.target.value})}/>
          <FInp label="Phone" type="tel" placeholder="9999999999" value={hF.phone} onChange={e=>setHF({...hF,phone:e.target.value})}/>
          {err&&<div style={{fontSize:13,color:'#dc2626',marginBottom:8}}>{err}</div>}
          <PBtn onClick={()=>{if(!hF.name.trim()){setErr('Hospital name required');return};setErr('');setStep(2)}}>Next →</PBtn>
        </Card>)}
        {step===2&&(<Card>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Step 2 — Your admin account</div>
          <FInp label="Your full name *" type="text" placeholder="Your name" value={aF.name} onChange={e=>setAF({...aF,name:e.target.value})}/>
          <FInp label="Username *" type="text" placeholder="e.g. admin" value={aF.username} onChange={e=>setAF({...aF,username:e.target.value.toLowerCase().replace(/\s+/g,'')})} autoCapitalize="none"/>
          <FInp label="Password *" type="password" placeholder="Min 6 characters" value={aF.pass} onChange={e=>setAF({...aF,pass:e.target.value})}/>
          <FInp label="Confirm password *" type="password" placeholder="Repeat password" value={aF.confirm} onChange={e=>setAF({...aF,confirm:e.target.value})}/>
          {err&&<div style={{fontSize:13,color:'#dc2626',marginBottom:8}}>{err}</div>}
          <div style={{display:'flex',gap:8}}><GBtn onClick={()=>{setStep(1);setErr('')}} style={{flex:1}}>← Back</GBtn><button onClick={submit} disabled={busy} style={{flex:2,...S.pbtn,marginTop:0,opacity:busy?.5:1}}>{busy?'Creating…':'Create account'}</button></div>
        </Card>)}
        <div style={{textAlign:'center',marginTop:14}}><button onClick={onBack} style={{fontSize:13,color:'#aaa',background:'none',border:'none',cursor:'pointer'}}>Already have an account? Login →</button></div>
      </div>
    </div>
  )
}

const LoginPage=({onRegister=()=>{}})=>{
  const [username,setUsername]=useState('')
  const [pass,setPass]=useState('')
  const [err,setErr]=useState('')
  const [busy,setBusy]=useState(false)
  const [show,setShow]=useState(false)
  const go=async()=>{
    if(!username.trim()||!pass){setErr('Enter username and password');return}
    setBusy(true);setErr('')
    const isEmail=username.includes('@')
    let error
    if(isEmail){const r=await supabase.auth.signInWithPassword({email:username,password:pass});error=r.error}
    else{const r=await supabase.auth.signInWithPassword({email:toEmail(username),password:pass});error=r.error;if(error){const r2=await supabase.auth.signInWithPassword({email:username,password:pass});if(!r2.error)error=null}}
    if(error)setErr('Wrong username or password. Please try again.')
    setBusy(false)
  }
  return(
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#f0f9ff 0%,#f7f7f7 100%)',padding:20}}>
      <div style={{width:'100%',maxWidth:380}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:56,marginBottom:12}}>🏥</div>
          <div style={{fontSize:26,fontWeight:800,color:'#111'}}>Om Hospital</div>
          <div style={{fontSize:14,color:'#aaa',marginTop:6}}>Accounts & Finance System</div>
        </div>
        <Card style={{boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>
          <div style={{fontSize:16,fontWeight:700,color:'#111',marginBottom:16,textAlign:'center'}}>Staff Login</div>
          <FInp label="Username" type="text" placeholder="Enter your username" value={username} onChange={e=>setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off"/>
          <div style={{marginBottom:10}}>
            <label style={{display:'block',fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:5,fontWeight:700}}>Password</label>
            <div style={{position:'relative'}}>
              <input style={{...S.inp,paddingRight:50}} type={show?'text':'password'} placeholder="Enter your password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go()}/>
              <button onClick={()=>setShow(!show)} style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#aaa'}}>{show?'🙈':'👁️'}</button>
            </div>
          </div>
          {err&&<div style={{fontSize:13,color:'#dc2626',marginBottom:10,padding:'8px 12px',borderRadius:8,background:'#fef2f2',textAlign:'center'}}>{err}</div>}
          <PBtn onClick={go} disabled={busy||!username||!pass} style={{marginTop:8}}>{busy?'Logging in…':'Login'}</PBtn>
        </Card>
      </div>
    </div>
  )
}

/* ── ADMIN ── */
const AdminTab=({currentUser,hospital=null})=>{
  const [users,setUsers]=useState([])
  const [loading,setLoading]=useState(true)
  const [showAdd,setShowAdd]=useState(false)
  const [nF,setNF]=useState({name:'',username:'',pass:'',role:'staff'})
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState(null)
  useEffect(()=>{supabase.from('profiles').select('*').order('name').then(({data})=>{setUsers(data||[]);setLoading(false)})},[])
  const createUser=async()=>{
    if(!nF.name.trim()||!nF.username.trim()||!nF.pass.trim()){setMsg({ok:false,t:'Fill in all fields'});return}
    if(nF.pass.length<6){setMsg({ok:false,t:'Password must be at least 6 characters'});return}
    setBusy(true);setMsg(null)
    const {data,error}=await supabase.auth.signUp({email:toEmail(nF.username),password:nF.pass,options:{data:{name:nF.name}}})
    if(error){setMsg({ok:false,t:error.message});setBusy(false);return}
    if(data.user){
      await supabase.from('profiles').upsert({id:data.user.id,name:nF.name,username:nF.username.toLowerCase(),role:nF.role})
      setMsg({ok:true,t:`Account created!`,user:nF.username,pass:nF.pass})
      setNF({name:'',username:'',pass:'',role:'staff'});setShowAdd(false)
      const {data:ud}=await supabase.from('profiles').select('*').order('name');setUsers(ud||[])
    }
    setBusy(false)
  }
  const RC={admin:['#fee2e2','#dc2626'],management:['#fef3c7','#d97706'],accounts:['#dbeafe','#2563eb'],staff:['#f0fdf4','#16a34a']}
  // hospital info banner rendered inside return
  return(
    <div>
      {hospital&&(<div style={{background:'linear-gradient(135deg,#1d4ed8 0%,#1e40af 100%)',borderRadius:14,padding:'14px 16px',marginBottom:12,color:'#fff'}}>
        <div style={{fontSize:11,color:'#bfdbfe',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Your hospital</div>
        <div style={{fontSize:16,fontWeight:700}}>{hospital.name}</div>
        <div style={{display:'flex',gap:8,marginTop:6,flexWrap:'wrap'}}>
          <span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:'rgba(255,255,255,0.2)',color:'#fff',fontWeight:700}}>{hospital.plan?.toUpperCase()}</span>
          <span style={{fontSize:11,color:'#bfdbfe'}}>Expires: {fmtD(hospital.plan_end)}</span>
        </div>
      </div>)}
      <div style={{background:'linear-gradient(135deg,#111 0%,#374151 100%)',borderRadius:16,padding:'20px 16px',marginBottom:16,color:'#fff'}}>
        <div style={{fontSize:12,color:'#9ca3af',fontWeight:600,textTransform:'uppercase',marginBottom:4}}>Logged in as</div>
        <div style={{fontSize:18,fontWeight:700}}>{currentUser.name||'Admin'}</div>
        <div style={{fontSize:12,color:'#9ca3af',marginTop:2}}>Administrator</div>
      </div>
      <PBtn onClick={()=>setShowAdd(!showAdd)} style={{marginBottom:16,background:showAdd?'#6b7280':'#111'}}>{showAdd?'Cancel':'+ Add new staff account'}</PBtn>
      {showAdd&&(
        <Card>
          <FInp label="Full name" type="text" placeholder="e.g. Manasa" value={nF.name} onChange={e=>setNF({...nF,name:e.target.value})}/>
          <FInp label="Username" type="text" placeholder="e.g. manasa" value={nF.username} onChange={e=>setNF({...nF,username:e.target.value.toLowerCase().replace(/\s+/g,'')})} autoCapitalize="none"/>
          <FInp label="Password (min 6 chars)" type="text" placeholder="Set a password" value={nF.pass} onChange={e=>setNF({...nF,pass:e.target.value})}/>
          <FSel label="Role" value={nF.role} onChange={e=>setNF({...nF,role:e.target.value})}>{ROLES.map(r=><option key={r} value={r}>{r[0].toUpperCase()+r.slice(1)}</option>)}</FSel>
          {msg&&<div style={{fontSize:13,color:msg.ok?'#16a34a':'#dc2626',marginBottom:10,padding:'8px 12px',borderRadius:8,background:msg.ok?'#f0fdf4':'#fef2f2'}}>{msg.t}</div>}
          <PBtn onClick={createUser} disabled={busy}>{busy?'Creating…':'Create account'}</PBtn>
          {msg?.ok&&<div style={{marginTop:12,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'12px 14px',fontSize:13,lineHeight:1.8}}>Share with staff:<br/>Username: <strong>{msg.user}</strong><br/>Password: <strong>{msg.pass}</strong></div>}
        </Card>
      )}
      <SecL>All staff ({users.length})</SecL>
      {loading?<div style={{textAlign:'center',padding:24,color:'#ccc'}}>Loading…</div>:(
        <Card>{users.map(u=>{const [bg,tx]=(RC[u.role]||RC.staff);return(
          <Row key={u.id} left={<span style={{fontSize:14,fontWeight:600}}>{u.name||'—'}</span>} sub={`@${u.username||'—'}`} right={<span style={{fontSize:11,padding:'3px 9px',borderRadius:20,background:bg,color:tx,fontWeight:700}}>{u.role||'staff'}</span>}/>
        )})}</Card>
      )}
    </div>
  )
}

/* ── CREDIT TAB ── */
const CreditTab=({db})=>{
  const allCredit=db.income.filter(e=>isCredit(e))
  const totalCred=allCredit.reduce((a,e)=>a+e.amount,0)
  const byPatient={}
  allCredit.forEach(e=>{
    const key=e.patient_name||'Walk-in / OP'
    if(!byPatient[key])byPatient[key]={name:key,total:0,byType:{}}
    byPatient[key].total+=e.amount
    if(!byPatient[key].byType[e.type])byPatient[key].byType[e.type]=0
    byPatient[key].byType[e.type]+=e.amount
  })
  const pts=Object.values(byPatient).sort((a,b)=>b.total-a.total)
  return(
    <div>
      <div style={{background:'linear-gradient(135deg,#c2410c 0%,#9a3412 100%)',borderRadius:16,padding:'20px 16px',marginBottom:16,color:'#fff'}}>
        <div style={{fontSize:12,color:'#fed7aa',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6}}>Total credit outstanding</div>
        <div style={{fontSize:36,fontWeight:800}}>{fmt(totalCred)}</div>
        <div style={{fontSize:13,color:'#fed7aa',marginTop:6}}>{pts.length} patient{pts.length!==1?'s':''} · {allCredit.length} entr{allCredit.length!==1?'ies':'y'}</div>
      </div>
      {totalCred===0&&<div style={{textAlign:'center',padding:'48px 20px',color:'#aaa'}}><div style={{fontSize:40,marginBottom:12}}>🎉</div><div style={{fontSize:16,fontWeight:600,color:'#555'}}>No outstanding credit!</div></div>}
      {totalCred>0&&(<>
        <SecL>Category-wise total</SecL>
        <Card>
          {ITYPES.map(t=>{const ta=allCredit.filter(e=>e.type===t.key).reduce((a,e)=>a+e.amount,0);if(!ta)return null;return(
            <Row key={t.key} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={t.key}/>{t.full}</span>} right={<span style={{color:'#c2410c',fontWeight:700,fontSize:14}}>{fmt(ta)}</span>}/>
          )})}
          <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #f0f0f0',fontSize:14,fontWeight:700,color:'#c2410c'}}><span>Total</span><span>{fmt(totalCred)}</span></div>
        </Card>
        <SecL>Patient-wise breakdown</SecL>
        {pts.map(pt=>(
          <Card key={pt.name} style={{border:'1px solid #fed7aa',marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,paddingBottom:10,borderBottom:'1px solid #fed7aa'}}>
              <div style={{fontSize:15,fontWeight:700,color:'#111'}}>{pt.name}</div>
              <div style={{fontSize:22,fontWeight:800,color:'#c2410c'}}>{fmt(pt.total)}</div>
            </div>
            {Object.entries(pt.byType).map(([tk,amt])=>{const it=ITYPES.find(t=>t.key===tk);return(
              <div key={tk} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #fef3c7'}}>
                <span style={{display:'flex',alignItems:'center',gap:8,fontSize:13}}><TypeTag t={tk}/>{it?.full||tk}</span>
                <span style={{color:'#c2410c',fontWeight:600,fontSize:14}}>{fmt(amt)}</span>
              </div>
            )})}
            {Object.keys(pt.byType).length>1&&<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:2,fontSize:13,fontWeight:700,color:'#92400e'}}><span>Total due</span><span>{fmt(pt.total)}</span></div>}
          </Card>
        ))}
      </>)}
    </div>
  )
}

/* ── DAILY ENTRY ── */
const EntryTab=({db,actions,eDate,setEDate,itype,setItype,iF,setIF})=>{
  const di=db.income.filter(e=>e.date===eDate)
  const tots={};ITYPES.forEach(t=>{tots[t.key]=di.filter(e=>e.type===t.key).reduce((a,e)=>a+e.amount,0)})
  const tot=Object.values(tots).reduce((a,b)=>a+b,0)
  const isIP=['ip','ip_r','ip_l'].includes(itype)
  const aps=db.ip_patients.filter(p=>!p.discharge_date)
  const prev=iF.amount&&COMM[itype]?parseFloat(iF.amount)*COMM[itype]:0
  const todayCash=cashTotal(di);const todayCredit=credTotal(di)
  const go=async()=>{
    const amt=parseFloat(iF.amount);if(!amt||amt<=0){alert('Enter a valid amount');return}
    let pid=null,pname=''
    if(isIP){pid=iF.pid||null;if(pid){pname=db.ip_patients.find(p=>p.id===pid)?.name||''}}
    else{if(!iF.pname.trim()&&itype!=='vc'){alert('Patient name is required');return};pname=iF.pname}
    await actions.addIncome({id:uid(),date:eDate,type:itype,amount:amt,patient_id:pid,patient_name:pname,patient_phone:iF.phone||'',payment:iF.pay,ref_doctor:isIP?'':iF.ref,notes:iF.notes,consultant_fee:itype==='vc'?parseFloat(iF.consultant_fee||0):0})
    setIF({amount:'',pid:'',pname:'',ref:'',pay:'cash',notes:'',consultant_fee:'',phone:''})
  }
  return(
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <input style={{...S.inp,flex:1}} type="date" value={eDate} onChange={e=>setEDate(e.target.value)}/>
        <GBtn onClick={()=>setEDate(todayStr())}>Today</GBtn>
      </div>
      <SecL>Select income type</SecL>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
        {ITYPES.map(t=>{const [bg,tx]=TC[t.key];const on=itype===t.key;return(
          <button key={t.key} onClick={()=>setItype(t.key)} style={{padding:'10px 4px',border:on?`2px solid ${tx}`:'1px solid #e5e7eb',borderRadius:12,background:on?bg:'#fafafa',cursor:'pointer',textAlign:'center'}}>
            <div style={{fontSize:12,fontWeight:700,color:on?tx:'#555'}}>{t.label}</div>
            <div style={{fontSize:9,color:on?tx:'#aaa',marginTop:2}}>{t.full}</div>
            {COMM[t.key]>0&&<div style={{fontSize:9,color:on?tx:'#ccc',marginTop:1}}>Ref: {CLBL[t.key]}</div>}
          </button>
        )})}
      </div>
      <Card>
        <FInp label="Amount (₹)" type="number" inputMode="numeric" placeholder="0" value={iF.amount} onChange={e=>setIF({...iF,amount:e.target.value})}/>
        {prev>0&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:10,fontSize:13}}>Commission: <strong style={{color:'#c2410c'}}>{fmt(prev)}</strong> ({CLBL[itype]})</div>}
        {isIP?<FSel label="IP Patient" value={iF.pid} onChange={e=>setIF({...iF,pid:e.target.value})}><option value="">— select admitted patient —</option>{aps.map(p=><option key={p.id} value={p.id}>{p.name}{p.ref_doctor?' (Ref: '+p.ref_doctor+')':''}</option>)}</FSel>
          :<>
            <FInp label="Patient name *" type="text" placeholder="Required" value={iF.pname} onChange={e=>setIF({...iF,pname:e.target.value})}/>
            <FInp label="Phone (optional)" type="tel" placeholder="9999999999" value={iF.phone||''} onChange={e=>setIF({...iF,phone:e.target.value})}/>
            {COMM[itype]>0&&<FInp label="Referring doctor" type="text" placeholder="Doctor name" value={iF.ref} onChange={e=>setIF({...iF,ref:e.target.value})}/>}
            {itype==='vc'&&<>
              <FInp label="Consultant name" type="text" placeholder="e.g. Dr. Sharma (Neurologist)" value={iF.ref} onChange={e=>setIF({...iF,ref:e.target.value})}/>
              <FInp label="Consultant fee to pay (₹)" type="number" inputMode="numeric" placeholder="Amount you give to consultant" value={iF.consultant_fee||''} onChange={e=>setIF({...iF,consultant_fee:e.target.value})}/>
              {iF.amount&&iF.consultant_fee&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13}}>
                <span style={{color:'#065f46',fontWeight:600}}>Your income: </span>
                <span style={{color:'#16a34a',fontWeight:700,fontSize:15}}>{fmt(parseFloat(iF.amount||0)-parseFloat(iF.consultant_fee||0))}</span>
                <span style={{color:'#888',fontSize:11,marginLeft:6}}>(₹{iF.amount} collected − ₹{iF.consultant_fee} to consultant)</span>
              </div>}
            </>}
          </>}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FSel label="Payment" value={iF.pay} onChange={e=>setIF({...iF,pay:e.target.value})}>{PMODES.map(m=><option key={m} value={m}>{m==='credit'?'Credit (Due)':m[0].toUpperCase()+m.slice(1)}</option>)}</FSel>
          <FInp label="Notes" type="text" placeholder="Optional" value={iF.notes} onChange={e=>setIF({...iF,notes:e.target.value})}/>
        </div>
        {iF.pay==='credit'&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#92400e'}}>Recording as credit — not yet collected</div>}
        <PBtn onClick={go}>Save income entry</PBtn>
      </Card>
      {di.length>0&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:4}}>
          <div style={{background:'#f0fdf4',borderRadius:12,padding:'10px 14px'}}>
            <div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Cash collected</div>
            <div style={{fontSize:18,fontWeight:700,color:'#15803d'}}>{fmt(todayCash)}</div>
          </div>
          <div style={{background:todayCredit>0?'#fff7ed':'#f9f9f9',borderRadius:12,padding:'10px 14px'}}>
            <div style={{fontSize:10,color:todayCredit>0?'#92400e':'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Credit given</div>
            <div style={{fontSize:18,fontWeight:700,color:todayCredit>0?'#c2410c':'#ccc'}}>{fmt(todayCredit)}</div>
          </div>
        </div>
      )}
      <SecL>Entries for {fmtD(eDate)} — {fmt(tot)}</SecL>
      {di.length===0&&<div style={{textAlign:'center',padding:'24px 0',color:'#ccc',fontSize:13}}>No entries yet</div>}
      {ITYPES.map(t=>{
        const ents=di.filter(e=>e.type===t.key);if(!ents.length)return null
        return(<div key={t.key}>
          <SecL>{t.full} — {fmt(tots[t.key])}</SecL>
          <Card>{ents.map(e=>{const doc=getRefDoc(e,db.ip_patients);const comm=getComm(e);const cr=isCredit(e);return(
            <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}>
              <div style={{flex:1,minWidth:0,paddingRight:8}}>
                <div style={{fontSize:13,fontWeight:500,color:'#111',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                  <TypeTag t={t.key}/>{e.patient_name||'—'}
                  {cr&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#fed7aa',color:'#92400e',fontWeight:700}}>CREDIT</span>}
                </div>
                <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{cr?'Credit (not collected)':e.payment}{e.type==='vc'&&e.ref_doctor?' · Consultant: '+e.ref_doctor:doc?' · Ref: '+doc:''}{comm?' · Comm: '+fmt(comm):''}{e.type==='vc'&&e.consultant_fee>0?' · Fee to consultant: '+fmt(e.consultant_fee)+' · Your income: '+fmt(e.amount-e.consultant_fee):''}{e.notes?' · '+e.notes:''}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                <span style={{color:cr?'#c2410c':'#16a34a',fontWeight:600,fontSize:13}}>{fmt(e.amount)}</span>
                <DBtn onClick={()=>actions.delIncome(e.id)}>✕</DBtn>
              </div>
            </div>
          )})}</Card>
        </div>)
      })}
    </div>
  )
}

/* ── IP PATIENTS ── */
const IPTab=({db,actions,ipv,setIpv,ipid,setIpid,pF,setPF,cF,setCF,pyF,setPyF,gotoIP})=>{
  const getBill=pid=>{
    const en=db.income.filter(e=>e.patient_id===pid)
    const total=en.reduce((a,e)=>a+e.amount,0)
    const comm=en.reduce((a,e)=>a+getComm(e),0)
    const credit=credTotal(en)
    const pats=db.ip_patients.find(p=>p.id===pid)
    const payments=pats?.payments||[]
    const pkgPaid=payments.reduce((a,e)=>a+e.amount,0)
    const pkgComm=payments.reduce((a,py)=>a+(py.commission||0),0)
    // Regular patients: cash/upi/card = already collected, balance = credit only
    // Package patients: balance = 0 (package payments tracked separately)
    const paid=pats?.is_package?pkgPaid:cashTotal(en)
    const balance=pats?.is_package?0:credit
    return{total,paid,balance,commission:comm+pkgComm,credit,pkgComm}
  }
  if(ipv==='detail'&&ipid){
    const p=db.ip_patients.find(p=>p.id===ipid)
    if(!p)return<button onClick={()=>setIpv('list')} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer'}}>← Back</button>
    const b=getBill(p.id);const ents=db.income.filter(e=>e.patient_id===p.id)
    return(
      <div>
        <button onClick={()=>setIpv('list')} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer',marginBottom:12,display:'block'}}>← All patients</button>
        <Card>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div>
              <div style={{fontSize:17,fontWeight:700}}>{p.name}</div>
              <div style={{fontSize:11,color:'#aaa',marginTop:4}}>Admitted: {fmtD(p.admission_date)}{p.discharge_date?' · Discharged: '+fmtD(p.discharge_date):<Pill label="Active" bg="#dcfce7" tx="#16a34a"/>}</div>
              {p.diagnosis&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>Dx: {p.diagnosis}</div>}
              {p.room&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>Room: {p.room}</div>}
              {p.phone&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>📞 {p.phone}</div>}
              {p.ref_doctor&&<div style={{fontSize:12,color:'#d97706',fontWeight:700,marginTop:6}}>Ref: Dr. {p.ref_doctor}</div>}
              <div style={{marginTop:8}}>
                {p.is_package
                  ?<span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#dbeafe',color:'#1d4ed8',fontWeight:700}}>📦 Package patient</span>
                  :<span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#f0fdf4',color:'#16a34a',fontWeight:700}}>Regular IP patient</span>
                }
              </div>
            </div>
            {!p.discharge_date&&<GBtn onClick={()=>actions.dischargePatient(p.id)}>Discharge</GBtn>}
          </div>
        </Card>
        <MetGrid items={[
          {label:'Total billed',value:fmt(b.total)},
          {label:'Cash collected',value:fmt(b.paid),color:'#16a34a'},
          {label:'Credit (not collected)',value:fmt(b.credit),color:b.credit>0?'#c2410c':'#111'},
          {label:'Balance due',value:fmt(b.balance),color:b.balance>0?'#ef4444':'#16a34a'},
        ]}/>
        {/* IP Report — category breakdown */}
        {ents.length>0&&(
          <Card style={{marginBottom:12}}>
            <div style={{fontSize:11,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:10}}>Charges breakdown</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,marginBottom:6}}>
              <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Type</div>
              <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:60}}>Billed</div>
              <div style={{fontSize:9,color:'#ef4444',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:60}}>Deduction</div>
              <div style={{fontSize:9,color:'#16a34a',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:60}}>Real</div>
            </div>
            {ITYPES.map(t=>{
              const te=ents.filter(e=>e.type===t.key)
              if(!te.length)return null
              const inc=te.reduce((a,e)=>a+e.amount,0)
              const cm=te.reduce((a,e)=>a+getComm(e),0)
              return(
                <div key={t.key} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'6px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center'}}>
                  <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}><TypeTag t={t.key}/>{t.full}</span>
                  <span style={{fontSize:12,textAlign:'right',minWidth:60}}>{fmt(inc)}</span>
                  <span style={{fontSize:12,textAlign:'right',color:'#ef4444',minWidth:60}}>{cm>0?'-'+fmt(cm):'—'}</span>
                  <span style={{fontSize:12,textAlign:'right',color:'#16a34a',fontWeight:600,minWidth:60}}>{fmt(inc-cm)}</span>
                </div>
              )
            })}
            {b.pkgComm>0&&(p.payments||[]).length>0&&(
              <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'6px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center'}}>
                <span style={{fontSize:12,color:'#1d4ed8'}}>📦 Package received</span>
                <span style={{fontSize:12,textAlign:'right',color:'#1d4ed8',minWidth:60}}>{fmt((p.payments||[]).reduce((a,py)=>a+py.amount,0))}</span>
                <span style={{fontSize:12,textAlign:'right',color:'#ef4444',minWidth:60}}>{b.pkgComm>0?'-'+fmt(b.pkgComm):'—'}</span>
                <span style={{fontSize:12,textAlign:'right',color:'#16a34a',fontWeight:600,minWidth:60}}>{fmt((p.payments||[]).reduce((a,py)=>a+py.amount,0)-b.pkgComm)}</span>
              </div>
            )}
            {(()=>{
              const allInc=ents.reduce((a,e)=>a+e.amount,0)
              const allComm=ents.reduce((a,e)=>a+getComm(e),0)
              const pkgPd=(p.payments||[]).reduce((a,py)=>a+py.amount,0)
              const totalDeductions=allComm+b.pkgComm
              return(
                <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'8px 0 2px',marginTop:2,borderTop:'2px solid #111'}}>
                  <span style={{fontSize:13,fontWeight:800}}>Total</span>
                  <span style={{fontSize:13,fontWeight:800,textAlign:'right',minWidth:60}}>{fmt(allInc+pkgPd)}</span>
                  <span style={{fontSize:13,fontWeight:800,textAlign:'right',color:'#ef4444',minWidth:60}}>{totalDeductions>0?'-'+fmt(totalDeductions):'—'}</span>
                  <span style={{fontSize:13,fontWeight:800,textAlign:'right',color:'#16a34a',minWidth:60}}>{fmt(allInc+pkgPd-totalDeductions)}</span>
                </div>
              )
            })()}
          </Card>
        )}
        {b.credit>0&&(<>
          <SecL>Credit by type</SecL>
          <Card style={{border:'1px solid #fed7aa',background:'#fffbf5'}}>
            {['ip','ip_r','ip_l'].map(tk=>{const te=ents.filter(e=>e.type===tk&&isCredit(e));if(!te.length)return null;const ta=te.reduce((a,e)=>a+e.amount,0);return(
              <Row key={tk} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={tk}/>{ITYPES.find(t=>t.key===tk)?.full}</span>} sub={`${te.length} credit entr${te.length>1?'ies':'y'}`} right={<span style={{color:'#c2410c',fontWeight:700}}>{fmt(ta)}</span>}/>
            )})}
            <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #fed7aa',fontSize:14,fontWeight:700,color:'#c2410c'}}><span>Total credit</span><span>{fmt(b.credit)}</span></div>
          </Card>
        </>)}
        {p.ref_doctor&&!p.is_package&&ents.length>0&&(<>
          <SecL>Commission breakdown</SecL>
          <Card style={{border:'1px solid #fed7aa',background:'#fffbf5'}}>
            {!p.is_package&&['ip','ip_r','ip_l'].map(tk=>{const te=ents.filter(e=>e.type===tk);if(!te.length)return null;const inc=te.reduce((a,e)=>a+e.amount,0);const cm=te.reduce((a,e)=>a+getComm(e),0);return(
              <Row key={tk} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={tk}/>{ITYPES.find(t=>t.key===tk)?.full}</span>} sub={`${fmt(inc)} × ${CLBL[tk]}`} right={<span style={{color:'#d97706',fontWeight:700}}>{fmt(cm)}</span>}/>
            )})}
            <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #fed7aa',fontSize:14,fontWeight:700,color:'#c2410c'}}><span>Total to pay {p.ref_doctor}</span><span>{fmt(b.commission)}</span></div>
          </Card>
        </>)}
        {!p.discharge_date&&!p.is_package&&(
          <>
            <SecL>Add charge</SecL>
            <Card>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <FInp label="Date" type="date" value={cF.date} onChange={e=>setCF({...cF,date:e.target.value})}/>
                <FSel label="Type" value={cF.type} onChange={e=>setCF({...cF,type:e.target.value})}>
                  <option value="ip">IP Charges (40%)</option>
                  <option value="ip_r">IP Pharmacy (40%)</option>
                  <option value="ip_l">IP Lab/Scan (50%)</option>
                </FSel>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <FInp label="Amount (₹)" type="number" inputMode="numeric" placeholder="0" value={cF.amt} onChange={e=>setCF({...cF,amt:e.target.value})}/>
                <FSel label="Payment" value={cF.pay} onChange={e=>setCF({...cF,pay:e.target.value})}>{PMODES.map(m=><option key={m} value={m}>{m==='credit'?'Credit (Due)':m[0].toUpperCase()+m.slice(1)}</option>)}</FSel>
              </div>
              {cF.pay==='credit'&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'7px 10px',marginBottom:8,fontSize:13,color:'#92400e'}}>Recording as credit — amount not yet collected</div>}
              {cF.amt&&p.ref_doctor&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'7px 10px',marginBottom:8,fontSize:13,color:'#92400e'}}>Commission to {p.ref_doctor}: <strong>{fmt(parseFloat(cF.amt)*(COMM[cF.type]||0))}</strong></div>}
              <FInp label="Notes" type="text" placeholder="e.g. Day 3 medicines" value={cF.notes} onChange={e=>setCF({...cF,notes:e.target.value})}/>
              <PBtn onClick={async()=>{const amt=parseFloat(cF.amt);if(!amt||amt<=0){alert('Enter amount');return};await actions.addIncome({id:uid(),date:cF.date,type:cF.type,amount:amt,patient_id:p.id,patient_name:p.name,payment:cF.pay,ref_doctor:p.ref_doctor||'',notes:cF.notes});setCF({...cF,amt:'',notes:''})}}>Add charge</PBtn>
            </Card>
          </>
        )}
        {!p.discharge_date&&p.is_package&&(
          <>
            <SecL>Package payment received</SecL>
            <Card style={{border:'1px solid #d1fae5',background:'#f0fdf4'}}>
              <div style={{fontSize:11,color:'#065f46',fontWeight:600,marginBottom:10}}>
                📦 Package payment — 40% referral commission auto-calculated
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
                <FInp label="Date" type="date" value={pyF.date} onChange={e=>setPyF({...pyF,date:e.target.value})}/>
                <FInp label="Package amount (₹)" type="number" inputMode="numeric" placeholder="0" value={pyF.amt} onChange={e=>setPyF({...pyF,amt:e.target.value})}/>
              </div>
              {pyF.amt&&p.ref_doctor&&(
                <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#92400e'}}>
                  Commission to {p.ref_doctor}: <strong>{fmt(parseFloat(pyF.amt||0)*0.40)}</strong> (40%) · Net: <strong style={{color:'#16a34a'}}>{fmt(parseFloat(pyF.amt||0)*0.60)}</strong>
                </div>
              )}
              <FSel label="Payment mode" value={pyF.pay} onChange={e=>setPyF({...pyF,pay:e.target.value})}>{PMODES.map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}</FSel>
              <PBtn style={{background:'#16a34a'}} onClick={async()=>{
                const amt=parseFloat(pyF.amt);if(!amt||amt<=0){alert('Enter amount');return}
                const comm=p.ref_doctor?Math.round(amt*0.40):0
                await actions.addPayment(p.id,{id:uid(),date:pyF.date,amount:amt,payment:pyF.pay,commission:comm,ref_doctor:p.ref_doctor||''})
                setPyF({...pyF,amt:''})
              }}>Save package payment</PBtn>
            </Card>
          </>
        )}
        {!p.is_package&&['ip','ip_r','ip_l'].map(tk=>{const te=ents.filter(e=>e.type===tk);if(!te.length)return null;const it=ITYPES.find(t=>t.key===tk);return(
          <div key={tk}><SecL>{it.full} — {fmt(te.reduce((a,e)=>a+e.amount,0))}</SecL>
          <Card>{te.map(e=>{const cr=isCredit(e);return(
            <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13,fontWeight:500,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                  {fmtD(e.date)}{cr&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#fed7aa',color:'#92400e',fontWeight:700}}>CREDIT</span>}
                </div>
                <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{cr?'Credit':e.payment}{e.notes?' · '+e.notes:''} · Commission: {fmt(getComm(e))}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <span style={{color:cr?'#c2410c':'#16a34a',fontWeight:600,fontSize:13}}>{fmt(e.amount)}</span>
                <DBtn onClick={()=>actions.delIncome(e.id)}>✕</DBtn>
              </div>
            </div>
          )})}</Card></div>
        )})}
        {p.payments?.length>0&&(
          <>
            <SecL>Package payments received</SecL>
            <Card>
              {p.payments.map(py=>(
                <div key={py.id} style={{padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:500,color:'#111'}}>{fmtD(py.date)} · {py.payment}</div>
                      {py.commission>0&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>
                        Commission to {py.ref_doctor||'Ref doctor'}: {fmt(py.commission)} (40%)
                      </div>}
                      {py.commission>0&&<div style={{fontSize:11,color:'#16a34a',marginTop:1}}>
                        Net to hospital: {fmt(py.amount-py.commission)}
                      </div>}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}>
                      <span style={{color:'#16a34a',fontWeight:700,fontSize:14}}>{fmt(py.amount)}</span>
                      <DBtn onClick={()=>{if(window.confirm('Delete this payment of '+fmt(py.amount)+'?'))actions.deletePayment(p.id,py.id)}}>Delete</DBtn>
                    </div>
                  </div>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #f0f0f0',fontSize:13,fontWeight:700}}>
                <span>Total received</span>
                <span style={{color:'#16a34a'}}>{fmt((p.payments||[]).reduce((a,py)=>a+py.amount,0))}</span>
              </div>
              {p.ref_doctor&&(p.payments||[]).some(py=>py.commission>0)&&(
                <div style={{display:'flex',justifyContent:'space-between',paddingTop:6,fontSize:13,fontWeight:700,color:'#d97706'}}>
                  <span>Total commission (40%)</span>
                  <span>{fmt((p.payments||[]).reduce((a,py)=>a+(py.commission||0),0))}</span>
                </div>
              )}
            </Card>
          </>
        )}
        <div style={{marginTop:24,paddingTop:16,borderTop:'2px solid #fecaca'}}>
          <button style={{width:'100%',padding:'12px',background:'#fef2f2',color:'#dc2626',border:'2px solid #fecaca',borderRadius:12,fontSize:14,fontWeight:700,cursor:'pointer'}}
            onClick={()=>{if(window.confirm('Delete '+p.name+' and ALL their records? This cannot be undone.')){actions.deletePatient(p.id);setIpv('list')}}}>
            🗑️ Delete this patient and all records
          </button>
        </div>
      </div>
    )
  }
  if(ipv==='add')return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <span style={{fontSize:16,fontWeight:700}}>Admit new patient</span>
        <GBtn onClick={()=>setIpv('list')}>Cancel</GBtn>
      </div>
      <Card>
        <FInp label="Patient name *" type="text" placeholder="Full name" value={pF.name} onChange={e=>setPF({...pF,name:e.target.value})}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FInp label="Admission date" type="date" value={pF.adm} onChange={e=>setPF({...pF,adm:e.target.value})}/>
          <FInp label="Ward / Room" type="text" placeholder="Ward 2" value={pF.room} onChange={e=>setPF({...pF,room:e.target.value})}/>
        </div>
        <FInp label="Diagnosis" type="text" placeholder="Condition" value={pF.dx} onChange={e=>setPF({...pF,dx:e.target.value})}/>
        {/* Patient type toggle */}
        <div style={{marginBottom:12}}>
          <label style={{display:'block',fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8,fontWeight:700}}>Patient type</label>
          <div style={{display:'flex',gap:0,border:'1px solid #e5e7eb',borderRadius:12,overflow:'hidden'}}>
            <button onClick={()=>setPF({...pF,is_package:false})} style={{flex:1,padding:'11px',border:'none',background:!pF.is_package?'#111':'#fff',color:!pF.is_package?'#fff':'#888',fontWeight:600,fontSize:14,cursor:'pointer'}}>
              Regular IP
            </button>
            <button onClick={()=>setPF({...pF,is_package:true})} style={{flex:1,padding:'11px',border:'none',borderLeft:'1px solid #e5e7eb',background:pF.is_package?'#1d4ed8':'#fff',color:pF.is_package?'#fff':'#888',fontWeight:600,fontSize:14,cursor:'pointer'}}>
              📦 Package
            </button>
          </div>
          {pF.is_package&&<div style={{fontSize:11,color:'#1d4ed8',marginTop:6}}>Package patient — only package payment will be recorded, 40% referral commission auto-applied</div>}
        </div>
        <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:12,padding:'12px 14px',marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:'#92400e',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>Referral details</div>
          <FInp label="Referring doctor name" type="text" placeholder="Doctor name" value={pF.ref} onChange={e=>setPF({...pF,ref:e.target.value})}/>
          <div style={{fontSize:11,color:'#b45309'}}>{pF.is_package?'Package commission: 40% on each package payment':'Commission: IP 40% · Pharmacy 40% · Lab 50%'}</div>
        </div>
        <PBtn onClick={async()=>{if(!pF.name.trim()){alert('Name required');return};await actions.admitPatient({id:uid(),name:pF.name,phone:pF.phone||'',admission_date:pF.adm,discharge_date:null,diagnosis:pF.dx,room:pF.room,ref_doctor:pF.ref,is_package:pF.is_package,payments:[]});setIpv('list');setPF({name:'',adm:todayStr(),dx:'',room:'',ref:'',is_package:false,phone:''})}}>Admit patient</PBtn>
      </Card>
    </div>
  )
  const active=db.ip_patients.filter(p=>!p.discharge_date);const disc=db.ip_patients.filter(p=>p.discharge_date)
  const qb=pid=>{const en=db.income.filter(e=>e.patient_id===pid);const t=en.reduce((a,e)=>a+e.amount,0);const p=db.ip_patients.find(pt=>pt.id===pid);const cr=credTotal(en);const balance=p?.is_package?0:cr;return{total:t,balance,credit:cr}}
  return(
    <div>
      <PBtn onClick={()=>setIpv('add')} style={{marginBottom:16}}>+ Admit new patient</PBtn>
      {active.length>0&&(<><SecL>Active inpatients ({active.length})</SecL>
        <Card>{active.map(p=>{const b=qb(p.id);return<Row key={p.id} onClick={()=>{setIpid(p.id);setIpv('detail')}}
          left={<span style={{fontSize:14}}>{p.name}{p.is_package&&<Pill label="📦 Pkg" bg="#dbeafe" tx="#1d4ed8"/>}{p.ref_doctor&&<Pill label={'Ref: '+p.ref_doctor} bg="#fff7ed" tx="#b45309"/>}</span>}
          sub={`Since ${fmtD(p.admission_date)}`}
          right={<div style={{textAlign:'right'}}><div style={{fontWeight:600}}>{fmt(b.total)}</div>{b.credit>0&&<div style={{fontSize:11,color:'#c2410c'}}>credit: {fmt(b.credit)}</div>}{b.balance>0&&<div style={{fontSize:11,color:'#ef4444'}}>due: {fmt(b.balance)}</div>}</div>}
        />})}</Card></>)}
      {disc.length>0&&(<><SecL>Discharged patients</SecL>
        <Card>{disc.slice().reverse().map(p=>{const b=qb(p.id);return<Row key={p.id} onClick={()=>{setIpid(p.id);setIpv('detail')}}
          left={<span>{p.name}<Pill label="Discharged"/></span>}
          sub={`${fmtD(p.admission_date)} → ${fmtD(p.discharge_date)}`}
          right={<div style={{textAlign:'right'}}><div style={{fontWeight:600}}>{fmt(b.total)}</div>{b.balance>0&&<div style={{fontSize:11,color:'#ef4444'}}>due {fmt(b.balance)}</div>}</div>}
        />})}</Card></>)}
      {!db.ip_patients.length&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No inpatients yet</div>}
    </div>
  )
}

/* ── EXPENSES ── */
const ExpTab=({db,actions,exD,setExD,exF,setExF})=>{
  const exp=db.expenses.filter(e=>e.date===exD);const etot=exp.reduce((a,e)=>a+e.amount,0)
  const go=async()=>{
    const amt=parseFloat(exF.amt);if(!amt||amt<=0){alert('Enter amount');return}
    await actions.addExpense({id:uid(),date:exD,category:exF.cat,amount:amt,description:exF.desc,payment:exF.pay,is_monthly:exF.mon})
    setExF({...exF,amt:'',desc:''})
  }
  return(
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <input style={{...S.inp,flex:1}} type="date" value={exD} onChange={e=>setExD(e.target.value)}/>
        <GBtn onClick={()=>setExD(todayStr())}>Today</GBtn>
      </div>
      <Card>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FSel label="Category" value={exF.cat} onChange={e=>setExF({...exF,cat:e.target.value})}>{ECATS.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}</FSel>
          <FInp label="Amount (₹)" type="number" inputMode="numeric" placeholder="0" value={exF.amt} onChange={e=>setExF({...exF,amt:e.target.value})}/>
        </div>
        <FInp label="Description" type="text" placeholder="Details" value={exF.desc} onChange={e=>setExF({...exF,desc:e.target.value})}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,alignItems:'center'}}>
          <FSel label="Payment" value={exF.pay} onChange={e=>setExF({...exF,pay:e.target.value})}>{PMODES.map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}</FSel>
          <div style={{paddingTop:16}}><label style={{display:'flex',alignItems:'center',gap:8,fontSize:14,cursor:'pointer'}}><input type="checkbox" checked={exF.mon} onChange={e=>setExF({...exF,mon:e.target.checked})} style={{width:18,height:18}}/>Monthly</label></div>
        </div>
        <PBtn onClick={go}>Save expense</PBtn>
      </Card>
      <SecL>Expenses — {fmtD(exD)} · {fmt(etot)}</SecL>
      {exp.length===0?<div style={{textAlign:'center',padding:'24px 0',color:'#ccc',fontSize:13}}>No expenses</div>
        :<Card>{exp.map(e=>{const c=ECATS.find(c=>c.key===e.category);return<Row key={e.id}
          left={<span>{c?.label||e.category}{e.is_monthly&&<Pill label="monthly" bg="#dbeafe" tx="#1d4ed8"/>}</span>}
          sub={`${e.description||'—'} · ${e.payment}`}
          right={<><span style={{color:'#ef4444',fontWeight:600,fontSize:13}}>{fmt(e.amount)}</span><DBtn onClick={()=>actions.delExpense(e.id)}>✕</DBtn></>}
        />})}</Card>}
    </div>
  )
}

/* ── REPORT SUB-COMPONENTS (all defined outside RepTab to avoid hook violations) ── */

const ReferralsReport=({db,income,allPaid,rm,setRm,ry,setRy,yrs})=>{
  const [refPer,setRefPer]=useState('month')
  const fi=refPer==='month'?income.filter(e=>e.date?.startsWith(rm)):income.filter(e=>e.date?.startsWith(ry))
  const [payDoc,setPayDoc]=useState(null)
  const docs=buildRef(fi,db.ip_patients)
  const tc=docs.reduce((a,r)=>a+r.total_commission,0)
  const totalPaid=allPaid.reduce((a,e)=>a+e.amount,0)
  return(
    <>
      <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center'}}>
        <span style={{fontSize:13,color:'#888',fontWeight:600}}>Show:</span>
        {[{k:'month',l:'This month'},{k:'year',l:'This year'}].map(v=>(
          <button key={v.k} onClick={()=>setRefPer(v.k)} style={{padding:'7px 14px',borderRadius:20,border:refPer===v.k?'none':'1px solid #e5e7eb',background:refPer===v.k?'#111':'none',color:refPer===v.k?'#fff':'#888',fontSize:13,fontWeight:600,cursor:'pointer'}}>{v.l}</button>
        ))}
      </div>
      {refPer==='month'&&<input style={{...S.inp,marginBottom:12}} type="month" value={rm} onChange={e=>setRm(e.target.value)}/>}
      {refPer==='year'&&<select style={{...S.sel,marginBottom:12}} value={ry} onChange={e=>setRy(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>}
      {!docs.length&&<div style={{textAlign:'center',padding:'20px 0',color:'#ccc',fontSize:13}}>No referral data for this period</div>}
      {docs.length>0&&(<>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
          <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:12,padding:'12px 14px'}}>
            <div style={{fontSize:10,color:'#92400e',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Commission earned</div>
            <div style={{fontSize:22,fontWeight:700,color:'#c2410c'}}>{fmt(tc)}</div>
          </div>
          <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:'12px 14px'}}>
            <div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Total paid out</div>
            <div style={{fontSize:22,fontWeight:700,color:'#15803d'}}>{fmt(totalPaid)}</div>
          </div>
        </div>
        {docs.map(doc=>{
          const paid=allPaid.filter(e=>e.description===doc.name).reduce((a,e)=>a+e.amount,0)
          const balance=doc.total_commission-paid
          const isOpen=payDoc===doc.name
          return(
            <Card key={doc.name} style={{border:balance>0?'1px solid #fed7aa':'1px solid #f0f0f0'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
                <div><div style={{fontSize:15,fontWeight:700}}>Dr. {doc.name}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>Income generated: {fmt(doc.total_income)}</div></div>
                <div style={{textAlign:'right'}}><div style={{fontSize:11,color:'#d97706',fontWeight:600}}>Commission earned</div><div style={{fontSize:18,fontWeight:700,color:'#c2410c'}}>{fmt(doc.total_commission)}</div></div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,padding:'10px 0',borderTop:'1px solid #f5f5f5',borderBottom:'1px solid #f5f5f5',marginBottom:10}}>
                <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Earned</div><div style={{fontSize:13,fontWeight:700,color:'#c2410c'}}>{fmt(doc.total_commission)}</div></div>
                <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Paid</div><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(paid)}</div></div>
                <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Balance</div><div style={{fontSize:13,fontWeight:700,color:balance>0?'#ef4444':'#16a34a'}}>{fmt(balance)}</div></div>
              </div>
              {Object.entries(doc.by_type).map(([tk,v])=>(
                <Row key={tk} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={tk}/>{ITYPES.find(t=>t.key===tk)?.full}</span>} sub={`${fmt(v.income)} × ${CLBL[tk]}`} right={<span style={{color:'#d97706',fontWeight:700}}>{fmt(v.commission)}</span>}/>
              ))}
              {paid>0&&(
                <div style={{marginTop:8,paddingTop:8,borderTop:'1px solid #f5f5f5'}}>
                  <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:6}}>Payments made</div>
                  {allPaid.filter(e=>e.description===doc.name).map(e=>(
                    <div key={e.id} style={{display:'flex',justifyContent:'space-between',fontSize:12,marginBottom:4}}>
                      <span style={{color:'#555'}}>{fmtD(e.date)} · {e.payment}</span>
                      <span style={{color:'#16a34a',fontWeight:600}}>{fmt(e.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              {balance>0&&(
                <div style={{marginTop:10}}>
                  {!isOpen
                    ?<button onClick={()=>setPayDoc(doc.name)} style={{width:'100%',padding:'10px',background:'#111',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Record commission payment</button>
                    :<CommPayForm docName={doc.name} balance={balance} onCancel={()=>setPayDoc(null)} onSave={async(amt,date,pay)=>{
                      const profData=await supabase.from('profiles').select('hospital_id').eq('id',(await supabase.auth.getUser()).data.user?.id).single()
                      const row={id:uid(),date,category:'ref_paid',amount:amt,description:doc.name,payment:pay,is_monthly:false,hospital_id:profData.data?.hospital_id}
                      const {data}=await supabase.from('expenses').insert([row]).select()
                      // force page reload to refresh data
                      if(data)window.location.reload()
                    }}/>
                  }
                </div>
              )}
              {balance<=0&&<div style={{marginTop:8,textAlign:'center',fontSize:12,color:'#16a34a',fontWeight:600}}>✓ Fully paid</div>}
            </Card>
          )
        })}
      </>)}
    </>
  )
}

const PatientsReport=({db,gotoIP})=>{
  const pats=db.ip_patients
  const IP_TYPES=['ip','ip_r','ip_l']
  if(!pats.length)return<div style={{textAlign:'center',padding:'40px 0',color:'#ccc',fontSize:13}}>No patients yet</div>
  const grandInc=db.income.filter(e=>db.ip_patients.some(p=>p.id===e.patient_id)).reduce((a,e)=>a+e.amount,0)
  const grandComm=db.income.filter(e=>db.ip_patients.some(p=>p.id===e.patient_id)).reduce((a,e)=>a+getComm(e),0)
  const grandVCTotal=db.income.filter(e=>e.type==='vc'&&db.ip_patients.some(p=>p.id===e.patient_id)).reduce((a,e)=>a+(e.consultant_fee||0),0)
  return(
    <>
      <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:14}}>All IP patients — income vs commission vs real income</div>
      <HBarChart title="Real income per patient" data={pats.map(p=>{
        const en=db.income.filter(e=>e.patient_id===p.id)
        const vcf=en.filter(e=>e.type==='vc').reduce((a,e)=>a+(e.consultant_fee||0),0)
        const real=en.reduce((a,e)=>a+e.amount,0)-en.reduce((a,e)=>a+getComm(e),0)-vcf
        return{label:p.name?.split(' ')[0]||'?',value:Math.max(real,0),color:'#16a34a',fmt:fmt(real)}
      }).filter(d=>d.value>0)}/>
      {pats.map(p=>{
        const ents=db.income.filter(e=>e.patient_id===p.id)
        if(!ents.length)return null
        const grandTotal=ents.reduce((a,e)=>a+e.amount,0)
        const grandCommP=ents.reduce((a,e)=>a+getComm(e),0)
        const grandVCFees=ents.filter(e=>e.type==='vc').reduce((a,e)=>a+(e.consultant_fee||0),0)
        const grandReal=grandTotal-grandCommP-grandVCFees
        const paid=(p.payments||[]).reduce((a,e)=>a+e.amount,0)
        return(
          <Card key={p.id} style={{marginBottom:14}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:12,paddingBottom:10,borderBottom:'1px solid #f0f0f0'}}>
              <div>
                <div style={{fontSize:15,fontWeight:700,cursor:'pointer',color:'#1d4ed8'}} onClick={()=>gotoIP(p.id)}>{p.name}</div>
                <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{fmtD(p.admission_date)}{p.discharge_date?' → '+fmtD(p.discharge_date):<Pill label="Active" bg="#dcfce7" tx="#16a34a"/>}</div>
                {p.ref_doctor&&<div style={{fontSize:11,color:'#d97706',fontWeight:600,marginTop:2}}>Ref: {p.ref_doctor}</div>}
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:11,color:'#aaa'}}>Balance due</div>
                <div style={{fontSize:14,fontWeight:700,color:grandTotal-paid>0?'#ef4444':'#16a34a'}}>{fmt(grandTotal-paid)}</div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,marginBottom:6}}>
              <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Category</div>
              <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:64}}>Income</div>
              <div style={{fontSize:10,color:'#d97706',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:64}}>Comm</div>
              <div style={{fontSize:10,color:'#16a34a',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:64}}>Real</div>
            </div>
            {IP_TYPES.map(tk=>{
              const te=ents.filter(e=>e.type===tk);if(!te.length)return null
              const inc=te.reduce((a,e)=>a+e.amount,0);const comm=te.reduce((a,e)=>a+getComm(e),0)
              const vcf=tk==='vc'?te.reduce((a,e)=>a+(e.consultant_fee||0),0):0
              const realInc=inc-comm-vcf
              const it=ITYPES.find(t=>t.key===tk)
              return(
                <div key={tk} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'7px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center'}}>
                  <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}><TypeTag t={tk}/>{it?.label}</span>
                  <span style={{fontSize:12,textAlign:'right',minWidth:64}}>{fmt(inc)}</span>
                  <span style={{fontSize:12,textAlign:'right',color:'#d97706',minWidth:64}}>{(comm+vcf)>0?'-'+fmt(comm+vcf):'—'}</span>
                  <span style={{fontSize:12,textAlign:'right',color:'#16a34a',fontWeight:600,minWidth:64}}>{fmt(realInc)}</span>
                </div>
              )
            })}
            <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'8px 0 0',marginTop:4,borderTop:'2px solid #f0f0f0'}}>
              <span style={{fontSize:13,fontWeight:700}}>Total</span>
              <span style={{fontSize:13,fontWeight:700,textAlign:'right',minWidth:64}}>{fmt(grandTotal)}</span>
              <span style={{fontSize:13,fontWeight:700,textAlign:'right',color:'#ef4444',minWidth:64}}>{(grandCommP+grandVCFees)>0?'-'+fmt(grandCommP+grandVCFees):'—'}</span>
              <span style={{fontSize:13,fontWeight:700,textAlign:'right',color:'#16a34a',minWidth:64}}>{fmt(grandReal)}</span>
            </div>
          </Card>
        )
      })}
      <div style={{background:'linear-gradient(135deg,#111 0%,#374151 100%)',borderRadius:14,padding:'16px',marginTop:8,color:'#fff'}}>
        <div style={{fontSize:11,color:'#9ca3af',fontWeight:700,textTransform:'uppercase',marginBottom:12}}>All patients — grand total</div>
        {IP_TYPES.map(tk=>{
          const all=db.income.filter(e=>e.type===tk&&db.ip_patients.some(p=>p.id===e.patient_id))
          if(!all.length)return null
          const inc=all.reduce((a,e)=>a+e.amount,0);const comm=all.reduce((a,e)=>a+getComm(e),0)
          const vcf2=tk==='vc'?all.reduce((a,e)=>a+(e.consultant_fee||0),0):0
          return(
            <div key={tk} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'6px 0',borderBottom:'1px solid #374151'}}>
              <span style={{fontSize:12,color:'#d1d5db'}}>{ITYPES.find(t=>t.key===tk)?.full}</span>
              <span style={{fontSize:12,textAlign:'right',color:'#d1d5db',minWidth:60}}>{fmt(inc)}</span>
              <span style={{fontSize:12,textAlign:'right',color:'#fbbf24',minWidth:60}}>{(comm+vcf2)>0?'-'+fmt(comm+vcf2):'—'}</span>
              <span style={{fontSize:12,textAlign:'right',color:'#4ade80',fontWeight:600,minWidth:60}}>{fmt(inc-comm-vcf2)}</span>
            </div>
          )
        })}
        <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,paddingTop:10,marginTop:4,borderTop:'1px solid #6b7280'}}>
          <span style={{fontSize:14,fontWeight:700,color:'#fff'}}>Grand total</span>
          <span style={{fontSize:14,fontWeight:700,textAlign:'right',color:'#fff',minWidth:60}}>{fmt(grandInc)}</span>
          <span style={{fontSize:14,fontWeight:700,textAlign:'right',color:'#fbbf24',minWidth:60}}>{(grandComm+grandVCTotal)>0?'-'+fmt(grandComm+grandVCTotal):'—'}</span>
          <span style={{fontSize:14,fontWeight:700,textAlign:'right',color:'#4ade80',minWidth:60}}>{fmt(grandInc-grandComm-grandVCTotal)}</span>
        </div>
      </div>
    </>
  )
}

const LabReport=({db,rm,setRm,ry,setRy,yrs})=>{
  const [labPer,setLabPer]=useState('month')
  const labInc=labPer==='month'
    ?db.income.filter(e=>e.date?.startsWith(rm)&&(e.type==='op_l'||e.type==='ip_l'))
    :db.income.filter(e=>e.date?.startsWith(ry)&&(e.type==='op_l'||e.type==='ip_l'))
  const labExp=labPer==='month'
    ?db.expenses.filter(e=>e.date?.startsWith(rm)&&e.category==='lab_to_lab')
    :db.expenses.filter(e=>e.date?.startsWith(ry)&&e.category==='lab_to_lab')
  const opLabInc=labInc.filter(e=>e.type==='op_l').reduce((a,e)=>a+e.amount,0)
  const ipLabInc=labInc.filter(e=>e.type==='ip_l').reduce((a,e)=>a+e.amount,0)
  const totalLabInc=opLabInc+ipLabInc
  const totalLabComm=labInc.reduce((a,e)=>a+getComm(e),0)
  const totalLabExp=labExp.reduce((a,e)=>a+e.amount,0)
  const realLabInc=totalLabInc-totalLabComm-totalLabExp
  return(
    <>
      <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:13,color:'#888',fontWeight:600}}>Period:</span>
        {[{k:'month',l:'This month'},{k:'year',l:'This year'}].map(v=>(
          <button key={v.k} onClick={()=>setLabPer(v.k)} style={{padding:'7px 14px',borderRadius:20,border:labPer===v.k?'none':'1px solid #e5e7eb',background:labPer===v.k?'#111':'none',color:labPer===v.k?'#fff':'#888',fontSize:13,fontWeight:600,cursor:'pointer'}}>{v.l}</button>
        ))}
      </div>
      {labPer==='month'&&<input style={{...S.inp,marginBottom:14}} type="month" value={rm} onChange={e=>setRm(e.target.value)}/>}
      {labPer==='year'&&<select style={{...S.sel,marginBottom:14}} value={ry} onChange={e=>setRy(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>}
      <div style={{background:'linear-gradient(135deg,#9d174d 0%,#6b21a8 100%)',borderRadius:16,padding:'20px 16px',marginBottom:16,color:'#fff'}}>
        <div style={{fontSize:12,color:'#f9a8d4',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Real lab income</div>
        <div style={{fontSize:36,fontWeight:800,color:realLabInc>=0?'#fff':'#fca5a5'}}>{fmt(realLabInc)}</div>
        <div style={{fontSize:12,color:'#f9a8d4',marginTop:6}}>After commission and lab-to-lab expenses</div>
      </div>
      <Card>
        <div style={{fontSize:11,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:12}}>Lab income breakdown</div>
        <Row left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t="op_l"/>OP Lab income</span>} right={<span style={{color:'#16a34a',fontWeight:600}}>{fmt(opLabInc)}</span>}/>
        <Row left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t="ip_l"/>IP Lab income</span>} right={<span style={{color:'#16a34a',fontWeight:600}}>{fmt(ipLabInc)}</span>}/>
        <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid #f0f0f0',borderBottom:'1px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total lab income</span><span style={{color:'#16a34a'}}>{fmt(totalLabInc)}</span></div>
        <Row left="Less: Referral commission (50%)" right={<span style={{color:'#d97706',fontWeight:600}}>{totalLabComm>0?'- '+fmt(totalLabComm):'—'}</span>}/>
        <Row left="Less: Lab to lab expenses" right={<span style={{color:'#ef4444',fontWeight:600}}>{totalLabExp>0?'- '+fmt(totalLabExp):'—'}</span>}/>
        <div style={{display:'flex',justifyContent:'space-between',padding:'10px 0 0',marginTop:4,borderTop:'2px solid #f0f0f0',fontSize:15,fontWeight:800}}><span>Real lab income</span><span style={{color:realLabInc>=0?'#16a34a':'#ef4444'}}>{fmt(realLabInc)}</span></div>
      </Card>
      <DonutChart title="Lab income breakdown" centerLabel={fmt(totalLabInc)} segments={[
        {label:'Real lab income',value:Math.max(realLabInc,0),color:'#9d174d',fmt:fmt(Math.max(realLabInc,0))},
        {label:'Commission (50%)',value:totalLabComm,color:'#d97706',fmt:fmt(totalLabComm)},
        {label:'Lab-to-lab exp',value:totalLabExp,color:'#ef4444',fmt:fmt(totalLabExp)},
      ].filter(s=>s.value>0)}/>
      {labExp.length>0&&(<><SecL>Lab to lab expense entries</SecL>
        <Card>{labExp.map(e=>(<Row key={e.id} left={e.description||'Lab to lab'} sub={fmtD(e.date)+' · '+e.payment} right={<span style={{color:'#ef4444',fontWeight:600}}>{fmt(e.amount)}</span>}/>))}</Card>
      </>)}
      {labExp.length===0&&totalLabInc===0&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No lab income for this period</div>}
    </>
  )
}

const VCReport=({db,income})=>{
  const vcList=income.filter(e=>e.type==='vc')
  const totalCollected=vcList.reduce((a,e)=>a+e.amount,0)
  const totalFees=vcList.reduce((a,e)=>a+(e.consultant_fee||0),0)
  const totalIncome=totalCollected-totalFees

  // Group by consultant
  const consultants={}
  vcList.forEach(e=>{
    const name=e.ref_doctor||'Unknown consultant'
    if(!consultants[name])consultants[name]={name,collected:0,fees:0,count:0,entries:[]}
    consultants[name].collected+=e.amount
    consultants[name].fees+=(e.consultant_fee||0)
    consultants[name].count++
    consultants[name].entries.push(e)
  })
  const docs=Object.values(consultants).sort((a,b)=>b.collected-a.collected)

  if(!vcList.length)return<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No visiting consultant entries for this period</div>

  return(
    <>
      {/* Summary */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
        <div style={{background:'#f9f9f9',borderRadius:12,padding:'10px 14px'}}>
          <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Total collected</div>
          <div style={{fontSize:20,fontWeight:700}}>{fmt(totalCollected)}</div>
        </div>
        <div style={{background:'#fef2f2',borderRadius:12,padding:'10px 14px'}}>
          <div style={{fontSize:10,color:'#dc2626',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Fees to pay</div>
          <div style={{fontSize:20,fontWeight:700,color:'#dc2626'}}>{fmt(totalFees)}</div>
        </div>
        <div style={{background:'#f0fdf4',borderRadius:12,padding:'10px 14px',gridColumn:'1/-1'}}>
          <div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Your income from VC visits</div>
          <div style={{fontSize:26,fontWeight:800,color:'#15803d'}}>{fmt(totalIncome)}</div>
        </div>
      </div>

      {/* Per consultant */}
      <SecL>Consultant-wise breakdown</SecL>
      {docs.map(doc=>(
        <Card key={doc.name} style={{border:'1px solid #d1fae5'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
            <div>
              <div style={{fontSize:15,fontWeight:700}}>{doc.name}</div>
              <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{doc.count} visit{doc.count!==1?'s':''}</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:11,color:'#dc2626',fontWeight:600}}>Fee to pay</div>
              <div style={{fontSize:20,fontWeight:700,color:'#dc2626'}}>{fmt(doc.fees)}</div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,padding:'10px 0',borderTop:'1px solid #f0f0f0',borderBottom:'1px solid #f0f0f0',marginBottom:10}}>
            <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Collected</div><div style={{fontSize:13,fontWeight:700}}>{fmt(doc.collected)}</div></div>
            <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Fee</div><div style={{fontSize:13,fontWeight:700,color:'#dc2626'}}>{fmt(doc.fees)}</div></div>
            <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Your income</div><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(doc.collected-doc.fees)}</div></div>
          </div>
          {doc.entries.map(e=>(
            <Row key={e.id}
              left={<span>{fmtD(e.date)}{e.patient_name?' · '+e.patient_name:''}</span>}
              sub={`Collected: ${fmt(e.amount)} · Fee: ${fmt(e.consultant_fee||0)} · Income: ${fmt(e.amount-(e.consultant_fee||0))}`}
              right={<span style={{color:'#16a34a',fontWeight:600,fontSize:13}}>{fmt(e.amount)}</span>}
            />
          ))}
        </Card>
      ))}
    </>
  )
}

const RealIncomeReport=({db})=>{
  const allInc=db.income.reduce((a,e)=>a+e.amount,0)
  const allComm=db.income.reduce((a,e)=>a+getComm(e),0)
  const allVCFees=db.income.filter(e=>e.type==='vc').reduce((a,e)=>a+(e.consultant_fee||0),0)
  const allDeductions=allComm+allVCFees
  const allReal=allInc-allDeductions
  return(
    <>
      <div style={{fontSize:13,fontWeight:600,color:'#555',marginBottom:14}}>All income — total collected minus commissions and consultant fees = real income</div>
      <Card>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,marginBottom:8,paddingBottom:8,borderBottom:'1px solid #f0f0f0'}}>
          <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Category</div>
          <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:64}}>Collected</div>
          <div style={{fontSize:10,color:'#ef4444',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:64}}>Deductions</div>
          <div style={{fontSize:10,color:'#16a34a',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:64}}>Real</div>
        </div>
        {ITYPES.map(t=>{
          const ents=db.income.filter(e=>e.type===t.key)
          const inc=ents.reduce((a,e)=>a+e.amount,0)
          const comm=ents.reduce((a,e)=>a+getComm(e),0)
          const vcf=t.key==='vc'?ents.reduce((a,e)=>a+(e.consultant_fee||0),0):0
          const deductions=comm+vcf
          const real=inc-deductions
          if(!inc)return null
          return(
            <div key={t.key} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'9px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center'}}>
              <div>
                <span style={{display:'flex',alignItems:'center',gap:6,fontSize:13}}><TypeTag t={t.key}/>{t.full}</span>
                {t.key==='vc'&&vcf>0&&<div style={{fontSize:10,color:'#aaa',marginTop:2,marginLeft:2}}>Comm: {fmt(comm)} + Consultant fee: {fmt(vcf)}</div>}
                {t.key!=='vc'&&comm>0&&<div style={{fontSize:10,color:'#aaa',marginTop:2,marginLeft:2}}>Referral commission: {fmt(comm)}</div>}
              </div>
              <span style={{fontSize:13,textAlign:'right',minWidth:64}}>{fmt(inc)}</span>
              <span style={{fontSize:13,textAlign:'right',color:'#ef4444',minWidth:64}}>{deductions>0?'-'+fmt(deductions):'—'}</span>
              <span style={{fontSize:13,textAlign:'right',color:'#16a34a',fontWeight:700,minWidth:64}}>{fmt(real)}</span>
            </div>
          )
        })}
        <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'10px 0 0',marginTop:6,borderTop:'2px solid #111'}}>
          <span style={{fontSize:14,fontWeight:800}}>Grand total</span>
          <span style={{fontSize:14,fontWeight:800,textAlign:'right',minWidth:64}}>{fmt(allInc)}</span>
          <span style={{fontSize:14,fontWeight:800,textAlign:'right',color:'#ef4444',minWidth:64}}>{allDeductions>0?'-'+fmt(allDeductions):'—'}</span>
          <span style={{fontSize:14,fontWeight:800,textAlign:'right',color:'#16a34a',minWidth:64}}>{fmt(allReal)}</span>
        </div>
      </Card>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:4}}>
        <div style={{background:'#f9f9f9',borderRadius:12,padding:'12px 14px'}}>
          <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Total collected</div>
          <div style={{fontSize:20,fontWeight:700}}>{fmt(allInc)}</div>
        </div>
        <div style={{background:'#fef2f2',borderRadius:12,padding:'12px 14px'}}>
          <div style={{fontSize:10,color:'#dc2626',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Total deductions</div>
          <div style={{fontSize:20,fontWeight:700,color:'#dc2626'}}>{fmt(allDeductions)}</div>
          <div style={{fontSize:10,color:'#aaa',marginTop:2}}>Commissions + consultant fees</div>
        </div>
        <div style={{background:'#f0fdf4',borderRadius:12,padding:'14px 16px',gridColumn:'1/-1'}}>
          <div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Real income (all time)</div>
          <div style={{fontSize:32,fontWeight:800,color:'#15803d'}}>{fmt(allReal)}</div>
          <div style={{fontSize:11,color:'#aaa',marginTop:4}}>Total collected − commissions − consultant fees</div>
        </div>
      </div>
      <HBarChart title="Real income by source" data={ITYPES.map(t=>{
        const ents=db.income.filter(e=>e.type===t.key)
        const vcf=t.key==='vc'?ents.reduce((a,e)=>a+(e.consultant_fee||0),0):0
        const real=ents.reduce((a,e)=>a+e.amount,0)-ents.reduce((a,e)=>a+getComm(e),0)-vcf
        const [,tx]=TC[t.key]||['#f0f0f0','#555']
        return{label:t.label,value:Math.max(real,0),color:tx,fmt:fmt(real)}
      }).filter(d=>d.value>0)}/>
    </>
  )
}

/* ── REPORTS ── */

/* ── EXPENSES REPORT ── */
const ExpensesReport=({db})=>{
  const [per,setPer]=useState('month')
  const [rm2,setRm2]=useState(todayStr().slice(0,7))
  const [ry2,setRy2]=useState(todayStr().slice(0,4))
  const [from,setFrom]=useState(todayStr().slice(0,7)+'-01')
  const [to,setTo]=useState(todayStr())
  const yrs=[...new Set(db.expenses.map(e=>e.date?.slice(0,4)))].filter(Boolean).sort().reverse()
  if(!yrs.includes(ry2))yrs.unshift(ry2)
  const expList=per==='month'?db.expenses.filter(e=>e.date?.startsWith(rm2)):per==='year'?db.expenses.filter(e=>e.date?.startsWith(ry2)):db.expenses.filter(e=>e.date>=from&&e.date<=to)
  const total=expList.reduce((a,e)=>a+e.amount,0)
  const byCat={}
  expList.forEach(e=>{if(!byCat[e.category])byCat[e.category]=0;byCat[e.category]+=e.amount})
  const sorted=Object.entries(byCat).sort((a,b)=>b[1]-a[1])
  return(<>
    <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
      {[{k:'month',l:'Month'},{k:'year',l:'Year'},{k:'custom',l:'Custom'}].map(v=>(
        <button key={v.k} onClick={()=>setPer(v.k)} style={{padding:'6px 14px',borderRadius:20,border:per===v.k?'none':'1px solid #e5e7eb',background:per===v.k?'#111':'none',color:per===v.k?'#fff':'#888',fontSize:12,fontWeight:600,cursor:'pointer'}}>{v.l}</button>
      ))}
    </div>
    {per==='month'&&<input style={{...S.inp,marginBottom:12}} type="month" value={rm2} onChange={e=>setRm2(e.target.value)}/>}
    {per==='year'&&<select style={{...S.sel,marginBottom:12}} value={ry2} onChange={e=>setRy2(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>}
    {per==='custom'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}><FInp label="From" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><FInp label="To" type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>}
    <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:14,padding:'16px',marginBottom:14}}>
      <div style={{fontSize:11,color:'#dc2626',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Total expenses</div>
      <div style={{fontSize:32,fontWeight:800,color:'#dc2626'}}>{fmt(total)}</div>
      <div style={{fontSize:11,color:'#aaa',marginTop:4}}>{expList.length} entries</div>
    </div>
    <SecL>By category</SecL>
    <Card>
      {sorted.length===0&&<div style={{textAlign:'center',padding:'16px 0',color:'#ccc',fontSize:13}}>No expenses</div>}
      {sorted.map(([cat,amt])=>{const c=ECATS.find(x=>x.key===cat);const pct=total>0?Math.round(amt/total*100):0;return(
        <div key={cat} style={{padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
            <span style={{fontSize:13,fontWeight:500}}>{c?.label||cat}</span>
            <span style={{fontSize:13,fontWeight:700,color:'#ef4444'}}>{fmt(amt)}</span>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{flex:1,height:6,background:'#f0f0f0',borderRadius:3}}><div style={{width:pct+'%',height:6,background:'#ef4444',borderRadius:3,opacity:0.7}}/></div>
            <span style={{fontSize:10,color:'#aaa',minWidth:28}}>{pct}%</span>
          </div>
        </div>
      )})}
      {total>0&&<div style={{display:'flex',justifyContent:'space-between',paddingTop:10,marginTop:4,borderTop:'2px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total</span><span style={{color:'#ef4444'}}>{fmt(total)}</span></div>}
    </Card>
    <SecL>All entries</SecL>
    {expList.length>0&&<Card>{expList.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(e=>{const c=ECATS.find(x=>x.key===e.category);return(<Row key={e.id} left={c?.label||e.category} sub={fmtD(e.date)+' · '+(e.description||'—')+' · '+e.payment} right={<span style={{color:'#ef4444',fontWeight:600}}>{fmt(e.amount)}</span>}/>)})}</Card>}
    <HBarChart title="Expenses by category" data={sorted.slice(0,8).map(([cat,amt])=>{const c=ECATS.find(x=>x.key===cat);return{label:(c?.label||cat).split(' ').slice(0,2).join(' '),value:amt,color:'#ef4444',fmt:fmt(amt)}})}/>
  </>)
}

/* ── CUSTOM DATE REPORT ── */
const CustomDateReport=({db,gotoIP})=>{
  const [from,setFrom]=useState(todayStr().slice(0,7)+'-01')
  const [to,setTo]=useState(todayStr())
  const allPaidComm=db.expenses.filter(e=>e.category==='ref_paid')
  const incList=db.income.filter(e=>e.date>=from&&e.date<=to)
  const expList=db.expenses.filter(e=>e.date>=from&&e.date<=to)
  const pkgList=getPkgPayments(db.ip_patients,null).filter(py=>py.date>=from&&py.date<=to)
  const exp=sumExp(expList)
  const rc=totalRef(incList,db.ip_patients)
  const cash=cashTotal(incList);const credit=credTotal(incList)
  const pkgTotal=pkgList.reduce((a,py)=>a+py.amount,0);const pkgComm=pkgList.reduce((a,py)=>a+(py.commission||0),0)
  const vcFees=incList.filter(e=>e.type==='vc').reduce((a,e)=>a+(e.consultant_fee||0),0)
  const net=cash+pkgTotal-exp.total-rc-pkgComm-vcFees
  return(<>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
      <FInp label="From date" type="date" value={from} onChange={e=>setFrom(e.target.value)}/>
      <FInp label="To date" type="date" value={to} onChange={e=>setTo(e.target.value)}/>
    </div>
    <div style={{fontSize:12,color:'#555',fontWeight:600,marginBottom:12}}>{fmtD(from)} to {fmtD(to)}</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
      <div style={{background:'#f0fdf4',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Cash collected</div><div style={{fontSize:18,fontWeight:700,color:'#15803d'}}>{fmt(cash)}</div></div>
      <div style={{background:credit>0?'#fff7ed':'#f9f9f9',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:credit>0?'#92400e':'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Credit given</div><div style={{fontSize:18,fontWeight:700,color:credit>0?'#c2410c':'#ccc'}}>{fmt(credit)}</div></div>
      <div style={{background:'#dbeafe',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#1d4ed8',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Package</div><div style={{fontSize:18,fontWeight:700,color:'#1d4ed8'}}>{fmt(pkgTotal)}</div></div>
      <div style={{background:'#fef2f2',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#dc2626',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Expenses</div><div style={{fontSize:18,fontWeight:700,color:'#dc2626'}}>{fmt(exp.total)}</div></div>
    </div>
    <div style={{background:net>=0?'#f0fdf4':'#fef2f2',borderRadius:12,padding:'12px 16px',marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
      <div><div style={{fontSize:11,color:net>=0?'#15803d':'#dc2626',fontWeight:700,textTransform:'uppercase'}}>Net profit</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>{fmtD(from)} to {fmtD(to)}</div></div>
      <div style={{fontSize:24,fontWeight:800,color:net>=0?'#15803d':'#dc2626'}}>{net>=0?'+':''}{fmt(net)}</div>
    </div>
    <SecL>Income by source</SecL>
    <Card>{ITYPES.map(t=>{const v=incList.filter(e=>e.type===t.key).reduce((a,e)=>a+e.amount,0);if(!v)return null;return<Row key={t.key} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={t.key}/>{t.full}</span>} right={<span style={{color:'#16a34a',fontWeight:600}}>{fmt(v)}</span>}/>})}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total</span><span>{fmt(incList.reduce((a,e)=>a+e.amount,0))}</span></div></Card>
    <SecL>Expenses by category</SecL>
    <Card>{ECATS.map(c=>{if(!exp[c.key])return null;return<Row key={c.key} left={c.label} right={<span style={{color:'#ef4444',fontWeight:600}}>{fmt(exp[c.key])}</span>}/>})}{exp.total>0&&<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total</span><span style={{color:'#ef4444'}}>{fmt(exp.total)}</span></div>}</Card>
  </>)
}

/* ── PATIENT LIST REPORT ── */
const PatientListReport=({db,gotoTimeline})=>{
  const [per,setPer]=useState('month')
  const [rm2,setRm2]=useState(todayStr().slice(0,7))
  const [ry2,setRy2]=useState(todayStr().slice(0,4))
  const [from,setFrom]=useState(todayStr().slice(0,7)+'-01')
  const [to,setTo]=useState(todayStr())
  const [showType,setShowType]=useState('all')
  const yrs=[...new Set(db.ip_patients.map(e=>e.admission_date?.slice(0,4)))].filter(Boolean).sort().reverse()
  if(!yrs.includes(ry2))yrs.unshift(ry2)
  const prefix=per==='month'?rm2:per==='year'?ry2:null
  const ipPats=db.ip_patients.filter(p=>{
    const adm=p.admission_date||'';const dis=p.discharge_date||'9999-12-31'
    if(per==='month')return adm.startsWith(rm2)||(adm<=rm2+'-31'&&dis>=rm2+'-01')
    if(per==='year')return adm.startsWith(ry2)||(adm<=ry2+'-12-31'&&dis>=ry2+'-01-01')
    return adm<=to&&(dis>=from||!p.discharge_date)
  })
  const periodInc=per==='month'?db.income.filter(e=>e.date?.startsWith(rm2)):per==='year'?db.income.filter(e=>e.date?.startsWith(ry2)):db.income.filter(e=>e.date>=from&&e.date<=to)
  const opEnts=periodInc.filter(e=>!['ip','ip_r','ip_l'].includes(e.type)&&e.patient_name&&!db.ip_patients.some(p=>p.id===e.patient_id))
  const opByPat={}
  opEnts.forEach(e=>{const k=e.patient_name;if(!opByPat[k])opByPat[k]={name:k,phone:e.patient_phone||'',total:0,entries:[]};opByPat[k].total+=e.amount;opByPat[k].entries.push(e)})
  const opPats=Object.values(opByPat).sort((a,b)=>b.total-a.total)
  return(<>
    <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
      {[{k:'month',l:'Month'},{k:'year',l:'Year'},{k:'custom',l:'Custom'}].map(v=>(<button key={v.k} onClick={()=>setPer(v.k)} style={{padding:'6px 14px',borderRadius:20,border:per===v.k?'none':'1px solid #e5e7eb',background:per===v.k?'#111':'none',color:per===v.k?'#fff':'#888',fontSize:12,fontWeight:600,cursor:'pointer'}}>{v.l}</button>))}
    </div>
    {per==='month'&&<input style={{...S.inp,marginBottom:12}} type="month" value={rm2} onChange={e=>setRm2(e.target.value)}/>}
    {per==='year'&&<select style={{...S.sel,marginBottom:12}} value={ry2} onChange={e=>setRy2(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>}
    {per==='custom'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}><FInp label="From" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><FInp label="To" type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>}
    <div style={{display:'flex',gap:6,marginBottom:14}}>
      {[{k:'all',l:'All'},{k:'ip',l:'IP only'},{k:'op',l:'OP only'}].map(v=>(<button key={v.k} onClick={()=>setShowType(v.k)} style={{padding:'6px 12px',borderRadius:20,border:showType===v.k?'none':'1px solid #e5e7eb',background:showType===v.k?'#374151':'none',color:showType===v.k?'#fff':'#888',fontSize:11,fontWeight:600,cursor:'pointer'}}>{v.l}</button>))}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
      <div style={{background:'#f0fdf4',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>IP patients</div><div style={{fontSize:22,fontWeight:700,color:'#15803d'}}>{ipPats.length}</div></div>
      <div style={{background:'#dbeafe',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#1d4ed8',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>OP patients</div><div style={{fontSize:22,fontWeight:700,color:'#1d4ed8'}}>{opPats.length}</div></div>
    </div>
    {(showType==='all'||showType==='ip')&&ipPats.length>0&&(<>
      <SecL>IP patients ({ipPats.length})</SecL>
      {ipPats.map(p=>{const ents=db.income.filter(e=>e.patient_id===p.id);const total=ents.reduce((a,e)=>a+e.amount,0);const cash=cashTotal(ents);const credit=credTotal(ents);const pkgPd=(p.payments||[]).reduce((a,e)=>a+e.amount,0);const comm=ents.reduce((a,e)=>a+getComm(e),0)+(p.payments||[]).reduce((a,py)=>a+(py.commission||0),0);return(
        <Card key={p.id} style={{marginBottom:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
            <div>
              <button onClick={()=>gotoTimeline(p.id)} style={{fontSize:14,fontWeight:700,color:'#1d4ed8',background:'none',border:'none',cursor:'pointer',padding:0,textAlign:'left'}}>{p.name} →</button>
              {p.phone&&<div style={{fontSize:11,color:'#aaa'}}>📞 {p.phone}</div>}
              <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{fmtD(p.admission_date)}{p.discharge_date?' → '+fmtD(p.discharge_date):<Pill label="Active" bg="#dcfce7" tx="#16a34a"/>}</div>
              {p.ref_doctor&&<div style={{fontSize:11,color:'#d97706',fontWeight:600,marginTop:2}}>Ref: {p.ref_doctor}</div>}
            </div>
            <div style={{textAlign:'right'}}>{p.is_package&&<div style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#dbeafe',color:'#1d4ed8',fontWeight:700,marginBottom:4}}>📦</div>}<div style={{fontSize:14,fontWeight:700}}>{fmt(total)}</div></div>
          </div>
          {/* IP Report — category breakdown */}
          <div style={{marginBottom:10,paddingBottom:10,borderBottom:'1px solid #f0f0f0'}}>
            <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>Charges breakdown</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,marginBottom:6}}>
              <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Type</div>
              <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:56}}>Billed</div>
              <div style={{fontSize:9,color:'#ef4444',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:56}}>Deduction</div>
              <div style={{fontSize:9,color:'#16a34a',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:56}}>Real</div>
            </div>
            {['ip','ip_r','ip_l'].map(tk=>{
              const te=ents.filter(e=>e.type===tk)
              if(!te.length)return null
              const inc=te.reduce((a,e)=>a+e.amount,0)
              const cm=te.reduce((a,e)=>a+getComm(e),0)
              const it=ITYPES.find(t=>t.key===tk)
              return(
                <div key={tk} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'5px 0',borderBottom:'1px solid #f9f9f9',alignItems:'center'}}>
                  <span style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}><TypeTag t={tk}/>{it?.label}</span>
                  <span style={{fontSize:11,textAlign:'right',minWidth:56}}>{fmt(inc)}</span>
                  <span style={{fontSize:11,textAlign:'right',color:'#ef4444',minWidth:56}}>{cm>0?'-'+fmt(cm):'—'}</span>
                  <span style={{fontSize:11,textAlign:'right',color:'#16a34a',fontWeight:600,minWidth:56}}>{fmt(inc-cm)}</span>
                </div>
              )
            })}
            {pkgPd>0&&(
              <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'5px 0',borderBottom:'1px solid #f9f9f9',alignItems:'center'}}>
                <span style={{fontSize:11,color:'#1d4ed8'}}>📦 Package received</span>
                <span style={{fontSize:11,textAlign:'right',color:'#1d4ed8',minWidth:56}}>{fmt(pkgPd)}</span>
                <span style={{fontSize:11,textAlign:'right',color:'#ef4444',minWidth:56}}>{comm>0?'-'+fmt((p.payments||[]).reduce((a,py)=>a+(py.commission||0),0)):'—'}</span>
                <span style={{fontSize:11,textAlign:'right',color:'#16a34a',fontWeight:600,minWidth:56}}>{fmt(pkgPd-(p.payments||[]).reduce((a,py)=>a+(py.commission||0),0))}</span>
              </div>
            )}
            <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'6px 0 0',marginTop:2,borderTop:'1px solid #e5e7eb'}}>
              <span style={{fontSize:11,fontWeight:700}}>Total</span>
              <span style={{fontSize:11,fontWeight:700,textAlign:'right',minWidth:56}}>{fmt(total+pkgPd)}</span>
              <span style={{fontSize:11,fontWeight:700,textAlign:'right',color:'#ef4444',minWidth:56}}>{comm>0?'-'+fmt(comm):'—'}</span>
              <span style={{fontSize:11,fontWeight:700,textAlign:'right',color:'#16a34a',minWidth:56}}>{fmt(total+pkgPd-comm)}</span>
            </div>
          </div>
          {/* Summary boxes */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>
            {[{l:'Cash',v:fmt(cash),c:'#16a34a'},{l:'Credit',v:fmt(credit),c:credit>0?'#c2410c':'#aaa'},{l:'Pkg paid',v:fmt(pkgPd),c:'#1d4ed8'},{l:'Commission',v:fmt(comm),c:'#d97706'}].map((m,i)=>(
              <div key={i} style={{background:'#f9f9f9',borderRadius:8,padding:'6px 8px',textAlign:'center'}}>
                <div style={{fontSize:9,color:'#aaa',fontWeight:600,textTransform:'uppercase'}}>{m.l}</div>
                <div style={{fontSize:11,fontWeight:700,color:m.c,marginTop:2}}>{m.v}</div>
              </div>
            ))}
          </div>
        </Card>
      )})}
    </>)}
    {(showType==='all'||showType==='op')&&opPats.length>0&&(<>
      <SecL>OP patients ({opPats.length})</SecL>
      {opPats.map(pt=>(<Card key={pt.name} style={{marginBottom:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:6}}>
          <div><div style={{fontSize:14,fontWeight:700,color:'#111'}}>{pt.name}</div>{pt.phone&&<div style={{fontSize:11,color:'#aaa'}}>📞 {pt.phone}</div>}<div style={{fontSize:11,color:'#aaa',marginTop:2}}>{pt.entries.length} visit{pt.entries.length>1?'s':''}</div></div>
          <div style={{fontSize:14,fontWeight:700,color:'#16a34a'}}>{fmt(pt.total)}</div>
        </div>
        {pt.entries.map(e=>(<div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid #f5f5f5',fontSize:12}}>
          <span style={{color:'#555',display:'flex',alignItems:'center',gap:4}}>{fmtD(e.date)} · <TypeTag t={e.type}/></span>
          <span style={{fontWeight:600,color:isCredit(e)?'#c2410c':'#16a34a'}}>{fmt(e.amount)}{isCredit(e)?' (credit)':''}</span>
        </div>))}
      </Card>))}
    </>)}
    {ipPats.length===0&&opPats.length===0&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No patients for this period</div>}
  </>)
}

/* ── PATIENT TIMELINE ── */
const PatientTimeline=({db,pid,onBack})=>{
  const p=db.ip_patients.find(x=>x.id===pid)
  if(!p)return<button onClick={onBack} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer'}}>← Back</button>
  const ents=db.income.filter(e=>e.patient_id===p.id).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''))
  const pkgs=(p.payments||[]).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''))
  const events=[]
  events.push({date:p.admission_date,label:'Admitted',sub:p.diagnosis?'Diagnosis: '+p.diagnosis:'',color:'#1d4ed8',icon:'🏥'})
  ents.forEach(e=>{const cr=isCredit(e);events.push({date:e.date,label:(ITYPES.find(t=>t.key===e.type)?.full||e.type)+' — '+fmt(e.amount),sub:(cr?'💳 Credit (not collected)':e.payment)+(e.notes?' · '+e.notes:''),color:cr?'#c2410c':'#16a34a',icon:cr?'💳':'💰'})})
  pkgs.forEach(py=>{events.push({date:py.date,label:'Package payment — '+fmt(py.amount),sub:py.payment+(py.commission>0?' · Commission: '+fmt(py.commission)+' · Net: '+fmt(py.amount-py.commission):''),color:'#1d4ed8',icon:'📦'})})
  if(p.discharge_date)events.push({date:p.discharge_date,label:'Discharged',sub:'',color:'#6b7280',icon:'✅'})
  events.sort((a,b)=>(a.date||'').localeCompare(b.date||''))
  const totalBilled=ents.reduce((a,e)=>a+e.amount,0);const totalCash=cashTotal(ents);const totalCredit=credTotal(ents);const totalComm=ents.reduce((a,e)=>a+getComm(e),0)+pkgs.reduce((a,py)=>a+(py.commission||0),0)
  return(<>
    <button onClick={onBack} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer',marginBottom:12,display:'block'}}>← Back to Patient List</button>
    <Card>
      <div style={{fontSize:17,fontWeight:700}}>{p.name}</div>
      {p.phone&&<div style={{fontSize:12,color:'#aaa',marginTop:2}}>📞 {p.phone}</div>}
      <div style={{fontSize:12,color:'#aaa',marginTop:4}}>{fmtD(p.admission_date)}{p.discharge_date?' → '+fmtD(p.discharge_date):<Pill label="Active" bg="#dcfce7" tx="#16a34a"/>}</div>
      {p.ref_doctor&&<div style={{fontSize:12,color:'#d97706',fontWeight:700,marginTop:4}}>Ref: Dr. {p.ref_doctor}</div>}
    </Card>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
      {[{l:'Total billed',v:fmt(totalBilled),c:'#111'},{l:'Cash collected',v:fmt(totalCash),c:'#16a34a'},{l:'Credit (due)',v:fmt(totalCredit),c:totalCredit>0?'#c2410c':'#aaa'},{l:'Commission',v:fmt(totalComm),c:'#d97706'}].map((m,i)=>(<div key={i} style={{background:'#f9f9f9',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>{m.l}</div><div style={{fontSize:17,fontWeight:700,color:m.c}}>{m.v}</div></div>))}
    </div>
    <SecL>Patient timeline</SecL>
    <div style={{position:'relative',paddingLeft:32}}>
      <div style={{position:'absolute',left:11,top:8,bottom:8,width:2,background:'#e5e7eb'}}/>
      {events.map((ev,i)=>(<div key={i} style={{position:'relative',marginBottom:16}}>
        <div style={{position:'absolute',left:-21,top:2,width:20,height:20,borderRadius:'50%',background:ev.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,zIndex:1}}>{ev.icon}</div>
        <div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:12,padding:'10px 14px',borderLeft:'3px solid '+ev.color}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div><div style={{fontSize:13,fontWeight:600,color:'#111'}}>{ev.label}</div>{ev.sub&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>{ev.sub}</div>}</div>
            <div style={{fontSize:11,color:'#aaa',flexShrink:0,marginLeft:8}}>{fmtD(ev.date)}</div>
          </div>
        </div>
      </div>))}
    </div>
  </>)
}

const RepTab=({db,rv,setRv,rd,setRd,rm,setRm,ry,setRy,gotoIP})=>{
  const [timelinePid,setTimelinePid]=useState(null)
  const [vcPer,setVcPer]=useState('month')
  const yrs=[...new Set([...db.income,...db.expenses].map(e=>e.date?.slice(0,4)))].filter(Boolean).sort().reverse()
  if(!yrs.includes(ry))yrs.unshift(ry)
  const allPaidComm=db.expenses.filter(e=>e.category==='ref_paid')
  // Helper: get pkg payments for a date prefix (or all if none)
  const pkgPay=(prefix)=>getPkgPayments(db.ip_patients,prefix)

  const RVTABS=[
    {k:'daily',l:'Daily'},{k:'monthly',l:'Monthly'},{k:'yearly',l:'Yearly'},
    {k:'custom',l:'Custom'},{k:'referrals',l:'Referrals'},
    {k:'patlist',l:'Patient List'},{k:'patients',l:'IP Report'},
    {k:'expenses',l:'Expenses'},{k:'lab',l:'Lab'},
    {k:'realincome',l:'Real Income'},{k:'vc',l:'Consultants'},
  ]

  const PLCards=({incList,exp,refComm,pkgList=[]})=>{
    const cash=cashTotal(incList);const credit=credTotal(incList);const total=cash+credit
    const pkgTotal=pkgList.reduce((a,py)=>a+py.amount,0)
    const pkgComm=pkgList.reduce((a,py)=>a+(py.commission||0),0)
    const vcFees=incList.filter(e=>e.type==='vc').reduce((a,e)=>a+(e.consultant_fee||0),0)
    const net=cash+pkgTotal-exp.total-refComm-pkgComm-vcFees
    return(
      <div style={{marginBottom:12}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
          <div style={{background:'#f0fdf4',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Cash collected</div><div style={{fontSize:18,fontWeight:700,color:'#15803d'}}>{fmt(cash)}</div></div>
          <div style={{background:credit>0?'#fff7ed':'#f9f9f9',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:credit>0?'#92400e':'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Credit given</div><div style={{fontSize:18,fontWeight:700,color:credit>0?'#c2410c':'#ccc'}}>{fmt(credit)}</div></div>
          <div style={{background:'#dbeafe',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#1d4ed8',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Package payments</div><div style={{fontSize:18,fontWeight:700,color:'#1d4ed8'}}>{fmt(pkgTotal)}</div></div>
          <div style={{background:'#f9f9f9',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Exp + Ref + VC fees</div><div style={{fontSize:18,fontWeight:700,color:'#ef4444'}}>{fmt(exp.total+refComm+pkgComm+vcFees)}</div></div>
        </div>
        {pkgTotal>0&&<div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'8px 14px',marginBottom:8,fontSize:12}}>
          <span style={{color:'#1d4ed8',fontWeight:600}}>📦 Package: </span>
          <span style={{color:'#555'}}>Received {fmt(pkgTotal)} · Commission {fmt(pkgComm)} · Net {fmt(pkgTotal-pkgComm)}</span>
        </div>}
        {vcFees>0&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'8px 14px',marginBottom:8,fontSize:12}}>
          <span style={{color:'#065f46',fontWeight:600}}>🩺 VC visits: </span>
          <span style={{color:'#555'}}>Collected {fmt(incList.filter(e=>e.type==='vc').reduce((a,e)=>a+e.amount,0))} · To consultants {fmt(vcFees)} · Your income {fmt(incList.filter(e=>e.type==='vc').reduce((a,e)=>a+e.amount,0)-vcFees)}</span>
        </div>}
        <div style={{background:net>=0?'#f0fdf4':'#fef2f2',borderRadius:12,padding:'12px 16px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><div style={{fontSize:11,color:net>=0?'#15803d':'#dc2626',fontWeight:700,textTransform:'uppercase'}}>Net cash profit</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>Cash + package − expenses − commissions − consultant fees</div></div>
          <div style={{fontSize:24,fontWeight:800,color:net>=0?'#15803d':'#dc2626'}}>{net>=0?'+':''}{fmt(net)}</div>
        </div>
      </div>
    )
  }
  const IncT=({incList})=>{const inc=sumInc(incList);return(<Card>{ITYPES.filter(t=>inc[t.key]>0).map(t=>{const cash=cashTotal(incList.filter(e=>e.type===t.key));const cred=credTotal(incList.filter(e=>e.type===t.key));return<Row key={t.key} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={t.key}/>{t.full}</span>} sub={`Cash: ${fmt(cash)}${cred>0?' · Credit: '+fmt(cred):''}`} right={<span style={{color:'#16a34a',fontWeight:600}}>{fmt(inc[t.key])}</span>}/>})}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total billed</span><span>{fmt(inc.total)}</span></div></Card>)}
  const ExpT=({exp})=>{if(exp.total===0)return<div style={{textAlign:'center',padding:'12px 0',color:'#ccc',fontSize:13}}>No expenses</div>;return<Card>{ECATS.filter(c=>exp[c.key]>0).map(c=><Row key={c.key} left={c.label} right={<span style={{color:'#ef4444',fontWeight:600}}>{fmt(exp[c.key])}</span>}/>)}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total expenses</span><span>{fmt(exp.total)}</span></div></Card>}

  return(
    <div>
      <div style={{display:'flex',gap:6,marginBottom:16,overflowX:'auto',paddingBottom:4}}>
        {RVTABS.map(v=>(
          <button key={v.k} onClick={()=>setRv(v.k)} style={{flexShrink:0,padding:'7px 14px',borderRadius:20,border:rv===v.k?'none':'1px solid #e5e7eb',background:rv===v.k?'#111':'none',color:rv===v.k?'#fff':'#888',fontSize:12,fontWeight:600,cursor:'pointer'}}>{v.l}</button>
        ))}
      </div>

      {rv==='daily'&&(()=>{
        const dI=db.income.filter(e=>e.date===rd);const exp=sumExp(db.expenses.filter(e=>e.date===rd));const rc=totalRef(dI,db.ip_patients);const ipd=db.ip_patients.filter(p=>dI.some(e=>e.patient_id===p.id))
        return(<>
          <div style={{display:'flex',gap:8,marginBottom:14}}><input style={{...S.inp,flex:1}} type="date" value={rd} onChange={e=>setRd(e.target.value)}/><GBtn onClick={()=>setRd(todayStr())}>Today</GBtn></div>
          <PLCards incList={dI} exp={exp} refComm={rc} pkgList={pkgPay(rd)}/>
          <HBarChart title="Income by source" data={ITYPES.map(t=>{const v=dI.filter(e=>e.type===t.key).reduce((a,e)=>a+e.amount,0);const[,tx]=TC[t.key];return{label:t.label,value:v,color:tx,fmt:fmt(v)}}).filter(d=>d.value>0)}/>
          {ipd.length>0&&(<><SecL>IP activity</SecL><Card>{ipd.map(p=>{const pe=dI.filter(e=>e.patient_id===p.id);const t=pe.reduce((a,e)=>a+e.amount,0);const cr=credTotal(pe);const tot=db.income.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+e.amount,0);const pd=(p.payments||[]).reduce((a,e)=>a+e.amount,0);return<Row key={p.id} left={p.name} sub={`Today: ${fmt(t)}${cr>0?' (credit: '+fmt(cr)+')':''}`} right={tot-pd>0?<span style={{color:'#ef4444',fontSize:11,fontWeight:600}}>due {fmt(tot-pd)}</span>:<span style={{color:'#16a34a',fontSize:11}}>settled</span>} onClick={()=>gotoIP(p.id)}/>})}</Card></>)}
          <SecL>Income by source</SecL><IncT incList={dI}/>
          {pkgPay(rd).length>0&&(<>
            <SecL>Package payments received today</SecL>
            <Card style={{border:'1px solid #bfdbfe',background:'#eff6ff'}}>
              {pkgPay(rd).map(py=>(
                <div key={py.id} style={{padding:'8px 0',borderBottom:'1px solid #dbeafe'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:13,fontWeight:600,color:'#1d4ed8'}}>{py.patient_name} <span style={{fontSize:11,fontWeight:400,color:'#555'}}>· {py.payment}</span></div>
                      {py.commission>0&&<div style={{fontSize:11,color:'#d97706',marginTop:1}}>Commission: {fmt(py.commission)} · Net: {fmt(py.amount-py.commission)}</div>}
                    </div>
                    <span style={{fontSize:14,fontWeight:700,color:'#1d4ed8'}}>{fmt(py.amount)}</span>
                  </div>
                </div>
              ))}
              <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #bfdbfe',fontSize:13,fontWeight:700,color:'#1d4ed8'}}>
                <span>Total package</span><span>{fmt(pkgPay(rd).reduce((a,py)=>a+py.amount,0))}</span>
              </div>
            </Card>
          </>)}
          <SecL>Expenses</SecL><ExpT exp={exp}/>
          <SecL>Doctor referral report — {fmtD(rd)}</SecL>
          <ReferralsReport db={db} income={dI} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs}/>
        </>)
      })()}

      {rv==='monthly'&&(()=>{
        const mI=db.income.filter(e=>e.date?.startsWith(rm));const mE=db.expenses.filter(e=>e.date?.startsWith(rm));const exp=sumExp(mE);const rc=totalRef(mI,db.ip_patients);const days=[...new Set(mI.map(e=>e.date))].sort();const [yr,mo]=rm.split('-');const mps=db.ip_patients.filter(p=>(p.admission_date||'')<=rm+'-31'&&(p.discharge_date||'9999-12-31')>=rm+'-01')
        return(<>
          <input style={S.inp} type="month" value={rm} onChange={e=>setRm(e.target.value)}/>
          <div style={{fontSize:14,fontWeight:600,color:'#555',margin:'8px 0 14px'}}>{MOFULL[parseInt(mo)-1]} {yr}</div>
          <PLCards incList={mI} exp={exp} refComm={rc} pkgList={pkgPay(rm)}/>
          {days.length>0&&<VBarChart title="Daily revenue trend" data={days.map(d=>{const dI2=db.income.filter(e=>e.date===d);return{label:d.slice(8),v1:cashTotal(dI2),color:'#16a34a'}})}/>}
          {days.length>0&&(<><SecL>Day-wise</SecL><Card>{days.map(d=>{const dI=db.income.filter(e=>e.date===d);const dc=cashTotal(dI);const cr=credTotal(dI);const de=db.expenses.filter(e=>e.date===d).reduce((a,e)=>a+e.amount,0);const dref=totalRef(dI,db.ip_patients);const dpkg=pkgPay(d);const dpkgTotal=dpkg.reduce((a,py)=>a+py.amount,0);const dpkgComm=dpkg.reduce((a,py)=>a+(py.commission||0),0);const dvcFees=db.income.filter(e=>e.date===d&&e.type==='vc').reduce((a,e)=>a+(e.consultant_fee||0),0);const net=dc+dpkgTotal-de-dref-dpkgComm-dvcFees;return<Row key={d} left={fmtD(d)} right={<div style={{textAlign:'right'}}><span style={{color:'#16a34a',fontWeight:600}}>{fmt(dc)}</span>{dpkgTotal>0&&<span style={{fontSize:10,color:'#1d4ed8',marginLeft:6}}>+pkg {fmt(dpkgTotal)}</span>}{cr>0&&<span style={{fontSize:10,color:'#c2410c',marginLeft:6}}>{fmt(cr)} cr</span>}<br/><span style={{fontSize:11,color:net>=0?'#16a34a':'#ef4444'}}>net {fmt(net)}</span></div>} onClick={()=>{setRv('daily');setRd(d)}}/>})}</Card></>)}
          {mps.length>0&&(<><SecL>IP patients this month</SecL><Card>{mps.map(p=>{const en=db.income.filter(e=>e.patient_id===p.id);const t=en.reduce((a,e)=>a+e.amount,0);const pd=(p.payments||[]).reduce((a,e)=>a+e.amount,0);const cr=credTotal(en);return<Row key={p.id} left={<span>{p.name}{p.ref_doctor&&<Pill label={'Ref: '+p.ref_doctor} bg="#fff7ed" tx="#b45309"/>}</span>} sub={`${fmtD(p.admission_date)}${p.discharge_date?' → '+fmtD(p.discharge_date):' (active)'}${cr>0?' · Credit: '+fmt(cr):''}`} right={<div style={{textAlign:'right'}}><div style={{fontWeight:600}}>{fmt(t)}</div>{t-pd>0&&<div style={{fontSize:11,color:'#ef4444'}}>due {fmt(t-pd)}</div>}</div>} onClick={()=>gotoIP(p.id)}/>})}</Card></>)}
          <SecL>Income by source</SecL><IncT incList={mI}/>
          <SecL>Expenses</SecL><ExpT exp={exp}/>
          <SecL>Doctor referral report — {MOFULL[parseInt(mo)-1]}</SecL>
          <ReferralsReport db={db} income={mI} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs}/>
        </>)
      })()}

      {rv==='yearly'&&(()=>{
        const yI=db.income.filter(e=>e.date?.startsWith(ry));const yE=db.expenses.filter(e=>e.date?.startsWith(ry));const exp=sumExp(yE);const rc=totalRef(yI,db.ip_patients);const mons=[...new Set(yI.map(e=>e.date?.slice(0,7)))].sort()
        return(<>
          <select style={S.sel} value={ry} onChange={e=>setRy(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>
          <PLCards incList={yI} exp={exp} refComm={rc} pkgList={pkgPay(ry)}/>
          {mons.length>0&&<VBarChart title="Monthly revenue vs expenses" data={mons.map(ym=>{const mi=db.income.filter(e=>e.date?.startsWith(ym));const me=db.expenses.filter(e=>e.date?.startsWith(ym)).reduce((a,e)=>a+e.amount,0);const[,m]=ym.split('-');return{label:MOS[parseInt(m)-1],v1:cashTotal(mi),v2:me,color:'#16a34a'}})}/>}
          {mons.length>0&&(<><SecL>Month-wise</SecL><Card>
            <div style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr 1fr',marginBottom:4}}>{['Month','Cash','Credit','Net'].map(h=><div key={h} style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',padding:'4px 4px 8px 0',borderBottom:'1px solid #f0f0f0'}}>{h}</div>)}</div>
            {mons.map(ym=>{const mI2=db.income.filter(e=>e.date?.startsWith(ym));const mc=cashTotal(mI2);const mcr=credTotal(mI2);const me=db.expenses.filter(e=>e.date?.startsWith(ym)).reduce((a,e)=>a+e.amount,0);const mref=totalRef(mI2,db.ip_patients);const mpkg=pkgPay(ym);const mpkgNet=mpkg.reduce((a,py)=>a+py.amount-(py.commission||0),0);const mvcFees=db.income.filter(e=>e.date?.startsWith(ym)&&e.type==='vc').reduce((a,e)=>a+(e.consultant_fee||0),0);const mn=mc+mpkgNet-me-mref-mvcFees;const[,m]=ym.split('-');return(
              <div key={ym} onClick={()=>{setRv('monthly');setRm(ym)}} style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr 1fr',padding:'8px 0',borderBottom:'1px solid #f5f5f5',cursor:'pointer'}}>
                <span style={{fontSize:12,paddingRight:6}}>{MOS[parseInt(m)-1]}</span>
                <span style={{fontSize:12,color:'#16a34a',fontWeight:600}}>{fmt(mc)}</span>
                <span style={{fontSize:12,color:mcr>0?'#c2410c':'#ccc'}}>{fmt(mcr)}</span>
                <span style={{fontSize:12,color:mn>=0?'#16a34a':'#ef4444',fontWeight:600}}>{mn>=0?'+':''}{fmt(mn)}</span>
              </div>
            )})}
          </Card></>)}
          <SecL>Income by source</SecL><IncT incList={yI}/>
          <SecL>Doctor referral report — {ry}</SecL>
          <ReferralsReport db={db} income={yI} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs}/>
        </>)
      })()}

      {rv==='referrals'&&<ReferralsReport db={db} income={db.income} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs}/>}
      {rv==='patients'&&<PatientsReport db={db} gotoIP={gotoIP}/>}
      {rv==='lab'&&<LabReport db={db} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs}/>}
      {rv==='realincome'&&<RealIncomeReport db={db}/>}
      {rv==='vc'&&(()=>{
        const fi=vcPer==='month'?db.income.filter(e=>e.date?.startsWith(rm)):db.income.filter(e=>e.date?.startsWith(ry))
        return(<>
          <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center'}}>
            <span style={{fontSize:13,color:'#888',fontWeight:600}}>Show:</span>
            {[{k:'month',l:'This month'},{k:'year',l:'This year'},{k:'all',l:'All time'}].map(v=>(
              <button key={v.k} onClick={()=>setVcPer(v.k)} style={{padding:'7px 14px',borderRadius:20,border:vcPer===v.k?'none':'1px solid #e5e7eb',background:vcPer===v.k?'#111':'none',color:vcPer===v.k?'#fff':'#888',fontSize:12,fontWeight:600,cursor:'pointer'}}>{v.l}</button>
            ))}
          </div>
          {vcPer==='month'&&<input style={{...S.inp,marginBottom:12}} type="month" value={rm} onChange={e=>setRm(e.target.value)}/>}
          {vcPer==='year'&&<select style={{...S.sel,marginBottom:12}} value={ry} onChange={e=>setRy(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>}
          <VCReport db={db} income={vcPer==='all'?db.income:fi}/>
        </>)
      })()}
      {rv==='expenses'&&<ExpensesReport db={db}/>}
      {rv==='custom'&&<CustomDateReport db={db} gotoIP={gotoIP}/>}
      {rv==='patlist'&&(timelinePid
        ?<PatientTimeline db={db} pid={timelinePid} onBack={()=>setTimelinePid(null)}/>
        :<PatientListReport db={db} gotoTimeline={pid=>setTimelinePid(pid)}/>
      )}
    </div>
  )
}

/* ── MAIN APP ── */
export default function App(){
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [hospital,setHospital]=useState(null)
  const [isSuperAdmin,setIsSuperAdmin]=useState(false)
  const [showRegister,setShowRegister]=useState(false)
  const [loading,setLoading]=useState(true)
  const [db,setDb]=useState({income:[],expenses:[],ip_patients:[]})
  const [dbLoading,setDbLoading]=useState(false)
  const [tab,setTab]=useState('entry')
  const [eDate,setEDate]=useState(todayStr())
  const [itype,setItype]=useState('op')
  const [iF,setIF]=useState({amount:'',pid:'',pname:'',ref:'',pay:'cash',notes:''})
  const [ipv,setIpv]=useState('list')
  const [ipid,setIpid]=useState(null)
  const [pF,setPF]=useState({name:'',adm:todayStr(),dx:'',room:'',ref:'',is_package:false,phone:''})
  const [cF,setCF]=useState({date:todayStr(),type:'ip',amt:'',pay:'cash',notes:''})
  const [pyF,setPyF]=useState({date:todayStr(),amt:'',pay:'cash'})
  const [exD,setExD]=useState(todayStr())
  const [exF,setExF]=useState({cat:'water',amt:'',desc:'',pay:'cash',mon:false})
  const [rv,setRv]=useState('daily')
  const [rd,setRd]=useState(todayStr())
  const [rm,setRm]=useState(todayStr().slice(0,7))
  const [ry,setRy]=useState(todayStr().slice(0,4))

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{setSession(session);setLoading(false)})
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{setSession(session);if(!session){setProfile(null);setHospital(null);setIsSuperAdmin(false)};setLoading(false)})
    return()=>subscription.unsubscribe()
  },[])

  useEffect(()=>{
    if(!session)return
    const init=async()=>{
      const {data:sa,error:saErr}=await supabase.from('super_admins').select('id').eq('id',session.user.id).maybeSingle()
      if(sa&&!saErr){setIsSuperAdmin(true);setLoading(false);return}
      const {data:prof}=await supabase.from('profiles').select('*').eq('id',session.user.id).single()
      setProfile(prof)
      if(!prof?.hospital_id)return
      const {data:hosp}=await supabase.from('hospitals').select('*').eq('id',prof.hospital_id).single()
      setHospital(hosp)
      if(hosp&&!hosp.is_active){alert('Hospital suspended. Contact support.');await supabase.auth.signOut();return}
      setDbLoading(true)
      const [inc,exp,pts]=await Promise.all([
        supabase.from('income').select('*').eq('hospital_id',prof.hospital_id).order('date',{ascending:false}),
        supabase.from('expenses').select('*').eq('hospital_id',prof.hospital_id).order('date',{ascending:false}),
        supabase.from('ip_patients').select('*').eq('hospital_id',prof.hospital_id).order('admission_date',{ascending:false})
      ])
      setDb({income:inc.data||[],expenses:exp.data||[],ip_patients:pts.data||[]})
      setDbLoading(false)
    }
    init()
  },[session])

  const actions={
    addIncome:async row=>{const hid=profile?.hospital_id;const {data,error}=await supabase.from('income').insert([{...row,hospital_id:hid}]).select();if(error)console.error('addIncome',error);if(data)setDb(d=>({...d,income:[data[0],...d.income]}))},
    delIncome:async id=>{await supabase.from('income').delete().eq('id',id);setDb(d=>({...d,income:d.income.filter(e=>e.id!==id)}))},
    addExpense:async row=>{const hid=profile?.hospital_id;const {data,error}=await supabase.from('expenses').insert([{...row,hospital_id:hid}]).select();if(error)console.error('addExpense',error);if(data)setDb(d=>({...d,expenses:[data[0],...d.expenses]}))},
    delExpense:async id=>{await supabase.from('expenses').delete().eq('id',id);setDb(d=>({...d,expenses:d.expenses.filter(e=>e.id!==id)}))},
    admitPatient:async row=>{const hid=profile?.hospital_id;const {data,error}=await supabase.from('ip_patients').insert([{...row,hospital_id:hid}]).select();if(error)console.error('admitPatient',error);if(data)setDb(d=>({...d,ip_patients:[data[0],...d.ip_patients]}))},
    dischargePatient:async id=>{const {data}=await supabase.from('ip_patients').update({discharge_date:todayStr()}).eq('id',id).select();if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(p=>p.id===id?data[0]:p)}))},
    addPayment:async(pid,payment)=>{const p=db.ip_patients.find(x=>x.id===pid);const np=[...(p.payments||[]),payment];const {data}=await supabase.from('ip_patients').update({payments:np}).eq('id',pid).select();if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(x=>x.id===pid?data[0]:x)}))},
    deletePayment:async(pid,payid)=>{const p=db.ip_patients.find(x=>x.id===pid);const np=(p.payments||[]).filter(py=>py.id!==payid);const {data}=await supabase.from('ip_patients').update({payments:np}).eq('id',pid).select();if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(x=>x.id===pid?data[0]:x)}))},
    deletePatient:async id=>{await supabase.from('income').delete().eq('patient_id',id);await supabase.from('ip_patients').delete().eq('id',id);setDb(d=>({...d,ip_patients:d.ip_patients.filter(p=>p.id!==id),income:d.income.filter(e=>e.patient_id!==id)}))},
  }
  const gotoIP=useCallback((pid)=>{setIpid(pid);setIpv('detail');setTab('ip')},[])
  const isAdmin=profile?.role==='admin'
  const TABS=[{k:'entry',l:'Daily Entry'},{k:'ip',l:'IP Patients'},{k:'exp',l:'Expenses'},{k:'rep',l:'Reports'},{k:'credit',l:'💳 Credit'},...(isAdmin?[{k:'admin',l:'👥 Users'}]:[])]

  if(loading)return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,color:'#aaa'}}>Loading…</div>
  if(!session&&showRegister)return<HospitalOnboarding onBack={()=>setShowRegister(false)}/>
  if(!session)return<LoginPage onRegister={()=>setShowRegister(true)}/>
  if(isSuperAdmin)return<SuperAdminDashboard/>
  if(hospital&&hospital.plan_end&&hospital.plan_end<todayStr()&&hospital.plan!=='pro'&&hospital.plan!=='enterprise')return(
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#f7f7f7',padding:20}}>
      <div style={{maxWidth:360,width:'100%',textAlign:'center'}}>
        <div style={{fontSize:48,marginBottom:12}}>⏰</div>
        <div style={{fontSize:20,fontWeight:700,color:'#111',marginBottom:8}}>Trial expired</div>
        <div style={{fontSize:14,color:'#aaa',marginBottom:20}}>Your 30-day free trial has ended.<br/>Contact support to continue.</div>
        <Card><div style={{fontSize:13,color:'#555',lineHeight:2}}>Hospital: <strong>{hospital?.name}</strong><br/>Contact: support@hosptrack.in</div></Card>
        <button onClick={()=>supabase.auth.signOut()} style={{marginTop:14,padding:'10px 20px',background:'none',border:'1px solid #e5e7eb',borderRadius:10,fontSize:13,color:'#555',cursor:'pointer'}}>Logout</button>
      </div>
    </div>
  )

  return(
    <div style={{maxWidth:520,margin:'0 auto',background:'#f7f7f7',minHeight:'100vh'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #f0f0f0',padding:'12px 16px 0',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:'#111'}}>🏥 {hospital?.name||'Hospital'}</div>
            {profile&&<div style={{fontSize:11,color:'#aaa',marginTop:1}}>{profile.name||'Staff'} · {profile.role||'staff'}{hospital?.plan&&hospital.plan!=='pro'?' · '+hospital.plan:''}</div>}
          </div>
          <button onClick={()=>supabase.auth.signOut()} style={{fontSize:12,color:'#aaa',background:'none',border:'1px solid #e5e7eb',borderRadius:8,padding:'5px 10px',cursor:'pointer'}}>Logout</button>
        </div>
        {dbLoading&&<div style={{fontSize:11,color:'#3b82f6',marginBottom:6,textAlign:'center'}}>Syncing…</div>}
        <div style={{display:'flex',overflowX:'auto',gap:0,marginBottom:-1}}>
          {TABS.map(t=>(
            <button key={t.k} onClick={()=>setTab(t.k)} style={{flexShrink:0,padding:'9px 10px',fontSize:12,fontWeight:600,border:'none',background:'none',color:tab===t.k?'#111':'#bbb',borderBottom:tab===t.k?'2.5px solid #111':'2.5px solid transparent',cursor:'pointer',whiteSpace:'nowrap'}}>
              {t.l}
            </button>
          ))}
        </div>
      </div>
      <div style={{padding:'16px 16px 80px'}}>
        <div style={{display:tab==='entry'?'block':'none'}}><EntryTab db={db} actions={actions} eDate={eDate} setEDate={setEDate} itype={itype} setItype={setItype} iF={iF} setIF={setIF}/></div>
        <div style={{display:tab==='ip'?'block':'none'}}><IPTab db={db} actions={actions} ipv={ipv} setIpv={setIpv} ipid={ipid} setIpid={setIpid} pF={pF} setPF={setPF} cF={cF} setCF={setCF} pyF={pyF} setPyF={setPyF} gotoIP={gotoIP}/></div>
        <div style={{display:tab==='exp'?'block':'none'}}><ExpTab db={db} actions={actions} exD={exD} setExD={setExD} exF={exF} setExF={setExF}/></div>
        <div style={{display:tab==='rep'?'block':'none'}}><RepTab db={db} rv={rv} setRv={setRv} rd={rd} setRd={setRd} rm={rm} setRm={setRm} ry={ry} setRy={setRy} gotoIP={gotoIP}/></div>
        <div style={{display:tab==='credit'?'block':'none'}}><CreditTab db={db}/></div>
        {isAdmin&&<div style={{display:tab==='admin'?'block':'none'}}><AdminTab currentUser={profile} hospital={hospital}/></div>}
      </div>
    </div>
  )
}
