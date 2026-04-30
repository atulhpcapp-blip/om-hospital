import { useState, useEffect, useCallback, useMemo } from 'react'
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
const OP_TYPES=['New OP','Review OP']
const IP_PAT_TYPES=['Regular','Package','VC']
const PLANS=[{key:'trial',label:'Trial (7 days)',price:0},{key:'starter',label:'Starter',price:600},{key:'pro',label:'Pro',price:900},{key:'enterprise',label:'Enterprise',price:1900}]
const toEmail=u=>`${u.toLowerCase().replace(/\s+/g,'')}@easymedicalsolutions.in`

const todayStr=()=>new Date().toISOString().split('T')[0]
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6)
const genRegNo=async()=>{try{const {data}=await supabase.rpc('next_reg_no');return data||('REG'+Date.now().toString().slice(-5))}catch(e){return 'REG'+Date.now().toString().slice(-5)}}
const fmt=n=>'Rs '+(Math.round(n)||0).toLocaleString('en-IN')
const fmtD=d=>{if(!d)return'-';const x=new Date(d+'T00:00:00');return`${x.getDate()} ${MOS[x.getMonth()]} ${x.getFullYear()}`}
const getRefDoc=(e,pats)=>e.ref_doctor||(pats||[]).find(p=>p.id===e.patient_id)?.ref_doctor||null
const getComm=e=>(e.payment==='credit'||!e.ref_doctor||e.ref_doctor.trim()==='')?0:e.amount*(e.custom_commission!=null?(e.custom_commission/100):(COMM[e.type]||0))
const isCredit=e=>e.payment==='credit'
const sumInc=list=>{const r={};ITYPES.forEach(t=>{r[t.key]=list.filter(e=>e.type===t.key).reduce((a,e)=>a+e.amount,0)});r.total=Object.values(r).reduce((a,b)=>a+b,0);return r}
const sumExp=list=>{const r={};ECATS.forEach(c=>{r[c.key]=list.filter(e=>e.category===c.key).reduce((a,e)=>a+e.amount,0)});r.total=ECATS.filter(c=>c.key!=='ref_paid').reduce((a,c)=>a+(r[c.key]||0),0);return r}
const totalRef=list=>list.reduce((a,e)=>a+getComm(e),0)
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
const buildRef=income=>{const docs={};income.forEach(e=>{const doc=e.ref_doctor;const comm=getComm(e);if(!doc||!doc.trim()||!comm)return;if(!docs[doc])docs[doc]={name:doc,total_income:0,total_commission:0,by_type:{}};docs[doc].total_income+=e.amount;docs[doc].total_commission+=comm;if(!docs[doc].by_type[e.type])docs[doc].by_type[e.type]={income:0,commission:0};docs[doc].by_type[e.type].income+=e.amount;docs[doc].by_type[e.type].commission+=comm});return Object.values(docs).sort((a,b)=>b.total_commission-a.total_commission)}

const S={
  inp:{width:'100%',padding:'12px 14px',border:'2px solid #e5e7eb',borderRadius:12,fontSize:16,background:'#fff',color:'#111',boxSizing:'border-box',fontFamily:'inherit',outline:'none',transition:'border-color .15s'},
  sel:{width:'100%',padding:'12px 14px',border:'2px solid #e5e7eb',borderRadius:12,fontSize:16,background:'#fff',color:'#111',boxSizing:'border-box',fontFamily:'inherit',outline:'none'},
  card:{background:'#fff',border:'1px solid #f0f0f0',borderRadius:16,padding:'16px',marginBottom:12,boxShadow:'0 1px 4px rgba(0,0,0,0.04)'},
  sec:{fontSize:10,fontWeight:800,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.1em',marginTop:20,marginBottom:10},
  pbtn:{width:'100%',padding:'14px',background:'linear-gradient(135deg,#16a34a,#22c55e)',color:'#fff',border:'none',borderRadius:14,fontSize:15,fontWeight:800,cursor:'pointer',marginTop:4,boxShadow:'0 4px 16px rgba(22,163,74,0.3)',letterSpacing:'-0.2px'},
  gbtn:{padding:'9px 16px',background:'#f8fafc',border:'2px solid #e2e8f0',borderRadius:10,fontSize:13,color:'#475569',cursor:'pointer',fontWeight:600},
  dbtn:{padding:'5px 10px',background:'#fff1f2',border:'1.5px solid #fecdd3',borderRadius:8,fontSize:12,color:'#e11d48',cursor:'pointer',fontWeight:600},
}
const Card=({children,style={}})=><div style={{...S.card,...style}}>{children}</div>
const SecL=({children})=><div style={S.sec}>{children}</div>
const PBtn=({children,onClick,disabled,style={}})=><button style={{...S.pbtn,opacity:disabled?0.5:1,...style}} onClick={onClick} disabled={disabled}>{children}</button>
const GBtn=({children,onClick,style={}})=><button style={{...S.gbtn,...style}} onClick={onClick}>{children}</button>
const DBtn=({children,onClick})=><button style={S.dbtn} onClick={onClick}>{children}</button>
const Pill=({label,bg='#e5e7eb',tx='#555'})=><span style={{fontSize:10,padding:'2px 7px',borderRadius:20,background:bg,color:tx,fontWeight:700,marginLeft:4}}>{label}</span>
const TypeTag=({t})=>{const [bg,tx]=TC[t]||['#f0f0f0','#555'];const it=ITYPES.find(x=>x.key===t);return<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:bg,color:tx,fontWeight:700}}>{it?.label||t}</span>}
const Row=({left,sub,right,onClick})=>(
  <div onClick={onClick} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0',borderBottom:'1px solid #f1f5f9',cursor:onClick?'pointer':'default'}}>
    <div style={{flex:1,minWidth:0,paddingRight:8}}>
      <div style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>{left}</div>
      {sub&&<div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{sub}</div>}
    </div>
    <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>{right}</div>
  </div>
)
const MetGrid=({items})=>(
  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
    {items.map((m,i)=>{const bg=m.color==='#16a34a'?'linear-gradient(135deg,#f0fdf4,#dcfce7)':m.color==='#c2410c'||m.color==='#ef4444'?'linear-gradient(135deg,#fff1f2,#ffe4e6)':m.color==='#1d4ed8'||m.color==='#2563eb'?'linear-gradient(135deg,#eff6ff,#dbeafe)':m.color==='#d97706'||m.color==='#b45309'?'linear-gradient(135deg,#fffbeb,#fef3c7)':'linear-gradient(135deg,#f8fafc,#f1f5f9)';return(
      <div key={i} style={{background:bg,borderRadius:14,padding:'12px 14px',border:'1px solid rgba(0,0,0,0.05)'}}>
        <div style={{fontSize:9,color:'#94a3b8',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:5,fontWeight:700}}>{m.label}</div>
        <div style={{fontSize:20,fontWeight:800,color:m.color||'#0f172a',letterSpacing:'-0.5px'}}>{m.value}</div>
        {m.sub&&<div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>{m.sub}</div>}
      </div>
    )})}
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

/*  CHART COMPONENTS  */
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

/*  COMMISSION PAYMENT FORM  standalone to prevent keyboard close */
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
          <label style={{display:'block',fontSize:10,color:'#888',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:4,fontWeight:700}}>Amount (Rs )</label>
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
        <button onClick={go} disabled={busy} style={{flex:2,padding:'10px',background:'#16a34a',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer',opacity:busy?0.6:1}}>
          {busy?'Saving...':'Save payment'}
        </button>
      </div>
    </div>
  )
}

/*  LOGIN  */


/*  SETTINGS PANEL  */
const SettingsPanel=()=>{
  const [plans,setPlans]=useState({
    trial:{label:'Trial',days:7,price:0,yearly:0},
    starter:{label:'Starter',price:600,yearly:6000,days:365},
    pro:{label:'Pro',price:900,yearly:9000,days:365},
    enterprise:{label:'Enterprise',price:1900,yearly:19000,days:365},
  })
  const [appName,setAppName]=useState('EasyMedical')
  const [support,setSupport]=useState('support@easymedicalsolutions.in')
  const [saved,setSaved]=useState(false)
  const save=()=>{
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
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <div>
              <label style={{display:'block',fontSize:10,color:'#888',textTransform:'uppercase',fontWeight:700,marginBottom:4}}>Monthly price (Rs)</label>
              <input style={{...S.inp,background:key==='trial'?'#f9f9f9':'#fff'}} type="number" inputMode="numeric" value={plan.price} disabled={key==='trial'} onChange={e=>setPlans({...plans,[key]:{...plan,price:parseInt(e.target.value)||0}})}/>
            </div>
            <div>
              <label style={{display:'block',fontSize:10,color:'#888',textTransform:'uppercase',fontWeight:700,marginBottom:4}}>Yearly price (Rs)</label>
              <input style={{...S.inp,background:key==='trial'?'#f9f9f9':'#fff'}} type="number" inputMode="numeric" value={plan.yearly} disabled={key==='trial'} onChange={e=>setPlans({...plans,[key]:{...plan,yearly:parseInt(e.target.value)||0}})}/>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div>
              <label style={{display:'block',fontSize:10,color:'#888',textTransform:'uppercase',fontWeight:700,marginBottom:4}}>Trial / access days</label>
              <input style={S.inp} type="number" inputMode="numeric" value={plan.days} onChange={e=>setPlans({...plans,[key]:{...plan,days:parseInt(e.target.value)||30}})}/>
            </div>
            {key!=='trial'&&<div style={{background:'#f0fdf4',borderRadius:10,padding:'8px 12px',display:'flex',flexDirection:'column',justifyContent:'center'}}>
              <div style={{fontSize:9,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Yearly saving</div>
              <div style={{fontSize:14,fontWeight:700,color:'#16a34a'}}>{fmt(plan.price*12-plan.yearly)}</div>
              <div style={{fontSize:9,color:'#aaa'}}>vs 12x monthly</div>
            </div>}
          </div>
          {key!=='trial'&&<div style={{fontSize:11,color:'#aaa',marginTop:8,background:'#f9f9f9',borderRadius:8,padding:'7px 10px'}}>
            Monthly: Rs {plan.price}/mo &nbsp;|&nbsp; Yearly: Rs {plan.yearly}/yr ({Math.round((1-(plan.yearly/(plan.price*12)))*100)}% off)
          </div>}
          {key==='trial'&&<div style={{fontSize:11,color:'#aaa',marginTop:4}}>Free for {plan.days} days then requires upgrade</div>}
        </Card>
      ))}
      {saved&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'10px 14px',marginBottom:12,fontSize:13,color:'#16a34a',fontWeight:600}}>Settings saved!</div>}
      <PBtn onClick={save}>Save settings</PBtn>
      <div style={{marginTop:16,background:'#f9f9f9',borderRadius:12,padding:'14px 16px'}}>
        <div style={{fontSize:11,fontWeight:700,color:'#aaa',textTransform:'uppercase',marginBottom:10}}>Plan summary</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:8,marginBottom:6}}>
          <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Plan</div>
          <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',textAlign:'right'}}>Monthly</div>
          <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',textAlign:'right'}}>Yearly</div>
        </div>
        {Object.entries(plans).map(([key,plan])=>(
          <div key={key} style={{display:'grid',gridTemplateColumns:'1fr auto auto',gap:8,padding:'7px 0',borderBottom:'1px solid #f0f0f0',fontSize:13,alignItems:'center'}}>
            <span style={{fontWeight:600}}>{plan.label}</span>
            <span style={{color:key==='trial'?'#b45309':'#111',textAlign:'right'}}>{key==='trial'?'Free':fmt(plan.price)}</span>
            <span style={{color:'#16a34a',fontWeight:600,textAlign:'right'}}>{key==='trial'?`${plan.days}d`:fmt(plan.yearly)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}


/*  SUPER ADMIN DASHBOARD  */
const SuperAdminDashboard=()=>{
  const [hospitals,setHospitals]=useState([])
  const [loading,setLoading]=useState(true)
  const [view,setView]=useState('list')
  const [sel,setSel]=useState(null)
  const [selUsers,setSelUsers]=useState([])
  const [hospData,setHospData]=useState(null)
  const [dataLoading,setDataLoading]=useState(false)
  const [nH,setNH]=useState({name:'',city:'',phone:'',plan:'trial',adminName:'',adminUser:'',adminPass:''})
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState(null)
  const planClr={trial:['#fef3c7','#b45309'],starter:['#dbeafe','#1d4ed8'],pro:['#dcfce7','#16a34a'],enterprise:['#f3e8ff','#7e22ce']}
  const load=async()=>{setLoading(true);const {data}=await supabase.from('hospitals').select('*').order('created_at',{ascending:false});setHospitals(data||[]);setLoading(false)}
  useEffect(()=>{load()},[])
  const openHosp=async h=>{setSel(h);setView('detail');const {data}=await supabase.from('profiles').select('*').eq('hospital_id',h.id);setSelUsers(data||[]);setHospData(null)}
  const loadHospData=async(h)=>{
    setDataLoading(true)
    const [inc,exp,pts,rds]=await Promise.all([
      supabase.from('income').select('id,date,type,amount,patient_name,ref_doctor,payment,consultant_fee').eq('hospital_id',h.id).order('date',{ascending:false}).limit(500),
      supabase.from('expenses').select('id,date,category,amount,description').eq('hospital_id',h.id).order('date',{ascending:false}).limit(200),
      supabase.from('ip_patients').select('id,name,admission_date,discharge_date,ref_doctor,is_package').eq('hospital_id',h.id).order('admission_date',{ascending:false}).limit(200),
      supabase.from('ref_doctors').select('id,name,area').eq('hospital_id',h.id)
    ])
    setHospData({income:inc.data||[],expenses:exp.data||[],ip_patients:pts.data||[],ref_doctors:rds.data||[]})
    setDataLoading(false)
    setView('hospdata')
  }
  const updatePlan=async(id,plan)=>{const planEnd=plan==='trial'?new Date(Date.now()+7*86400000).toISOString().split('T')[0]:'2099-12-31';await supabase.from('hospitals').update({plan,plan_end:planEnd,is_active:true}).eq('id',id);load();if(sel)setSel({...sel,plan,plan_end:planEnd})}
  const toggleActive=async(id,cur)=>{await supabase.from('hospitals').update({is_active:!cur}).eq('id',id);load();if(sel)setSel({...sel,is_active:!cur})}
  const create=async()=>{
    if(!nH.name.trim()||!nH.adminName.trim()||!nH.adminUser.trim()||!nH.adminPass.trim()){setMsg({ok:false,t:'Fill all fields'});return}
    if(nH.adminPass.length<6){setMsg({ok:false,t:'Password min 6 chars'});return}
    setBusy(true);setMsg(null)
    const planEnd=nH.plan==='trial'?new Date(Date.now()+7*86400000).toISOString().split('T')[0]:'2099-12-31'
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
    <div style={{maxWidth:520,margin:'0 auto',background:'#f8fafc',minHeight:'100vh'}}>
      <div style={{background:'#111',color:'#fff',padding:'14px 16px',position:'sticky',top:0,zIndex:10,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div><div style={{fontWeight:700,fontSize:15}}> {sel.name}</div><div style={{fontSize:11,color:'#9ca3af'}}>{sel.city} - Super Admin</div></div>
        <button onClick={()=>setView('list')} style={{color:'#9ca3af',background:'none',border:'1px solid #374151',borderRadius:8,padding:'5px 10px',fontSize:12,cursor:'pointer'}}> Back</button>
      </div>
      <div style={{padding:'16px 16px 60px'}}>
        <Card><Row left="City" right={sel.city||'-'}/><Row left="Phone" right={sel.phone||'-'}/><Row left="Plan" right={<span style={{fontSize:11,padding:'3px 9px',borderRadius:20,background:(planClr[sel.plan]||planClr.trial)[0],color:(planClr[sel.plan]||planClr.trial)[1],fontWeight:700}}>{sel.plan}</span>}/><Row left="Plan end" right={fmtD(sel.plan_end)}/><Row left="Status" right={sel.is_active?<span style={{color:'#16a34a',fontWeight:600}}> Active</span>:<span style={{color:'#ef4444',fontWeight:600}}> Suspended</span>}/></Card>
        <SecL>Change plan</SecL>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>{PLANS.map(p=>(<button key={p.key} onClick={()=>updatePlan(sel.id,p.key)} style={{padding:'10px 8px',border:sel.plan===p.key?'2px solid #111':'1px solid #e5e7eb',borderRadius:12,background:sel.plan===p.key?'#111':'#fff',color:sel.plan===p.key?'#fff':'#555',cursor:'pointer',textAlign:'center'}}><div style={{fontSize:12,fontWeight:700}}>{p.label}</div>{p.price>0&&<div style={{fontSize:10,marginTop:2,opacity:.7}}>{fmt(p.price)}/mo</div>}</button>))}</div>
        <button onClick={()=>toggleActive(sel.id,sel.is_active)} style={{width:'100%',padding:'12px',background:sel.is_active?'#fef2f2':'#f0fdf4',color:sel.is_active?'#dc2626':'#16a34a',border:`1px solid ${sel.is_active?'#fecaca':'#bbf7d0'}`,borderRadius:12,fontSize:14,fontWeight:600,cursor:'pointer',marginBottom:14}}>{sel.is_active?' Suspend':' Activate'}</button>
        <SecL>Staff ({selUsers.length})</SecL>
        <Card>{selUsers.length===0?<div style={{textAlign:'center',padding:'12px 0',color:'#ccc',fontSize:13}}>No staff</div>:selUsers.map(u=><Row key={u.id} left={u.name||'-'} sub={`@${u.username||'-'}`} right={<span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:'#f0f0f0',color:'#555',fontWeight:600}}>{u.role}</span>}/>)}</Card>
      </div>
    </div>
  )
  return(
    <div style={{maxWidth:520,margin:'0 auto',background:'#f8fafc',minHeight:'100vh'}}>
      <div style={{background:'#111',color:'#fff',padding:'14px 16px 0',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div><div style={{fontWeight:700,fontSize:15}}> Super Admin</div><div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>All hospitals</div></div>
          <button onClick={()=>supabase.auth.signOut()} style={{color:'#9ca3af',background:'none',border:'1px solid #374151',borderRadius:8,padding:'5px 10px',fontSize:12,cursor:'pointer'}}>Logout</button>
        </div>
        <div style={{display:'flex',gap:0,marginBottom:-1}}>
          {[{k:'list',l:'Hospitals'},{k:'add',l:'+ Add'},{k:'settings',l:' Settings'}].map(t=>(<button key={t.k} onClick={()=>{setView(t.k);setMsg(null)}} style={{padding:'9px 14px',fontSize:12,fontWeight:600,border:'none',background:'none',color:view===t.k?'#fff':'#6b7280',borderBottom:view===t.k?'2px solid #fff':'2px solid transparent',cursor:'pointer'}}>{t.l}</button>))}
        </div>
      </div>
      <div style={{padding:'16px 16px 60px'}}>
        {view==='list'&&(<>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
            {[{label:'Total',value:hospitals.length},{label:'Active',value:hospitals.filter(h=>h.is_active).length,color:'#16a34a'},{label:'Trial',value:hospitals.filter(h=>h.plan==='trial').length,color:'#b45309'},{label:'Paid',value:hospitals.filter(h=>h.plan!=='trial'&&h.is_active).length,color:'#1d4ed8'}].map((m,i)=>(<div key={i} style={{background:'#f9f9f9',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#aaa',textTransform:'uppercase',fontWeight:600,marginBottom:4}}>{m.label}</div><div style={{fontSize:22,fontWeight:700,color:m.color||'#111'}}>{m.value}</div></div>))}
          </div>
          {loading?<div style={{textAlign:'center',padding:32,color:'#ccc'}}>Loading...</div>:hospitals.length===0?<div style={{textAlign:'center',padding:'40px 0',color:'#ccc',fontSize:13}}>No hospitals yet</div>:hospitals.map(h=>(
            <Card key={h.id} style={{cursor:'pointer'}} >
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}} onClick={()=>openHosp(h)}>
                <div><div style={{fontSize:14,fontWeight:700}}>{h.name}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>{h.city||'-'} - {fmtD(h.created_at?.split('T')[0])}</div><div style={{marginTop:6,display:'flex',gap:6,flexWrap:'wrap'}}><span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:(planClr[h.plan]||planClr.trial)[0],color:(planClr[h.plan]||planClr.trial)[1],fontWeight:700}}>{h.plan}</span>{!h.is_active&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#fee2e2',color:'#dc2626',fontWeight:700}}>Suspended</span>}</div></div>
                <span style={{fontSize:18,color:'#aaa'}}></span>
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
            <FSel label="Plan" value={nH.plan} onChange={e=>setNH({...nH,plan:e.target.value})}>{PLANS.map(p=><option key={p.key} value={p.key}>{p.label}{p.price>0?' - Rs '+p.price+'/mo':' - Free 7 days'}</option>)}</FSel>
            <SecL>Admin account</SecL>
            <FInp label="Admin full name *" type="text" placeholder="Admin name" value={nH.adminName} onChange={e=>setNH({...nH,adminName:e.target.value})}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <FInp label="Username *" type="text" placeholder="admin" value={nH.adminUser} onChange={e=>setNH({...nH,adminUser:e.target.value.toLowerCase().replace(/\s+/g,'')})} autoCapitalize="none"/>
              <FInp label="Password *" type="text" placeholder="min 6 chars" value={nH.adminPass} onChange={e=>setNH({...nH,adminPass:e.target.value})}/>
            </div>
            {msg&&<div style={{fontSize:13,color:msg.ok?'#16a34a':'#dc2626',marginBottom:10,padding:'10px 12px',borderRadius:8,background:msg.ok?'#f0fdf4':'#fef2f2'}}>{msg.t}</div>}
            <PBtn onClick={create} disabled={busy}>{busy?'Creating...':'Create hospital & admin'}</PBtn>
            {msg?.ok&&<div style={{marginTop:12,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:'14px 16px',fontSize:13,lineHeight:2}}> {msg.h}<br/> Username: <strong>{msg.u}</strong><br/> Password: <strong>{msg.p}</strong></div>}
          </Card>
        )}
        {view==='settings'&&(
          <SettingsPanel/>
        )}
      </div>
    </div>
  )
}

/*  HOSPITAL ONBOARDING (self-signup)  */
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
    const trialEnd=new Date(Date.now()+7*86400000).toISOString().split('T')[0]
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
        <div style={{fontSize:48,marginBottom:12}}></div>
        <div style={{fontSize:22,fontWeight:800,color:'#111',marginBottom:4}}>{done.h}</div>
        <div style={{fontSize:14,color:'#aaa',marginBottom:20}}>Your hospital is ready!</div>
        <Card style={{border:'1px solid #bbf7d0',background:'#f0fdf4',textAlign:'left'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#15803d',marginBottom:10}}>Save your login details:</div>
          <div style={{fontSize:14,color:'#111',lineHeight:2.2}}> Username: <strong>{done.u}</strong><br/> Password: <strong>{done.p}</strong><br/> Trial expires: <strong>{fmtD(done.t)}</strong></div>
        </Card>
        <PBtn onClick={()=>{if(new URLSearchParams(window.location.search).get('upgrade')==='true')sessionStorage.setItem('pendingUpgrade','1');window.location.href=window.location.pathname+(new URLSearchParams(window.location.search).get('upgrade')==='true'?'?upgrade=true':'')}} style={{marginTop:14}}>Login to your hospital</PBtn>
      </div>
    </div>
  )
  return(
    <div style={{minHeight:'100vh',background:'linear-gradient(135deg,#f0f9ff 0%,#f7f7f7 100%)',padding:20}}>
      <div style={{maxWidth:420,margin:'0 auto'}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:40,marginBottom:8}}></div>
          <div style={{fontSize:11,fontWeight:700,color:'#16a34a',letterSpacing:'.12em',textTransform:'uppercase',marginBottom:4}}>Easy Medical Solutions</div><div style={{fontSize:22,fontWeight:800,color:'#111'}}>Register your hospital</div>
          <div style={{fontSize:13,color:'#aaa',marginTop:4}}>Free 7-day trial - No credit card</div>
        </div>
        <div style={{display:'flex',gap:8,marginBottom:20}}>{[1,2].map(s=>(<div key={s} style={{flex:1,height:4,borderRadius:2,background:step>=s?'#111':'#e5e7eb'}}/>))}</div>
        {step===1&&(<Card>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Step 1 - Hospital details</div>
          <FInp label="Hospital / Clinic name *" type="text" placeholder="e.g. City Care Hospital" value={hF.name} onChange={e=>setHF({...hF,name:e.target.value})}/>
          <FInp label="City" type="text" placeholder="Your city" value={hF.city} onChange={e=>setHF({...hF,city:e.target.value})}/>
          <FInp label="Phone" type="tel" placeholder="9999999999" value={hF.phone} onChange={e=>setHF({...hF,phone:e.target.value})}/>
          {err&&<div style={{fontSize:13,color:'#dc2626',marginBottom:8}}>{err}</div>}
          <PBtn onClick={()=>{if(!hF.name.trim()){setErr('Hospital name required');return};setErr('');setStep(2)}}>Next</PBtn>
        </Card>)}
        {step===2&&(<Card>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14}}>Step 2 - Your admin account</div>
          <FInp label="Your full name *" type="text" placeholder="Your name" value={aF.name} onChange={e=>setAF({...aF,name:e.target.value})}/>
          <FInp label="Username *" type="text" placeholder="e.g. admin" value={aF.username} onChange={e=>setAF({...aF,username:e.target.value.toLowerCase().replace(/\s+/g,'')})} autoCapitalize="none"/>
          <FInp label="Password *" type="password" placeholder="Min 6 characters" value={aF.pass} onChange={e=>setAF({...aF,pass:e.target.value})}/>
          <FInp label="Confirm password *" type="password" placeholder="Repeat password" value={aF.confirm} onChange={e=>setAF({...aF,confirm:e.target.value})}/>
          {err&&<div style={{fontSize:13,color:'#dc2626',marginBottom:8}}>{err}</div>}
          <div style={{display:'flex',gap:8}}><GBtn onClick={()=>{setStep(1);setErr('')}} style={{flex:1}}>Back</GBtn><button onClick={submit} disabled={busy} style={{flex:2,...S.pbtn,marginTop:0,opacity:busy?0.5:1}}>{busy?'Creating...':'Create account'}</button></div>
        </Card>)}
        <div style={{textAlign:'center',marginTop:14}}><button onClick={onBack} style={{fontSize:13,color:'#aaa',background:'none',border:'none',cursor:'pointer'}}>Already have an account? Login</button></div>
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
    else{const r=await supabase.auth.signInWithPassword({email:toEmail(username),password:pass});error=r.error;if(error){const r2=await supabase.auth.signInWithPassword({email:username+'@omhospital.app',password:pass});if(!r2.error)error=null;else{const r3=await supabase.auth.signInWithPassword({email:username,password:pass});if(!r3.error)error=null}}}
    if(error){setErr('Wrong username or password. Please try again.');setBusy(false);return}
    // After successful login, if upgrade was requested, redirect with upgrade param
    // Supabase session is now in localStorage so app will boot with session + showPayment=true
    if(new URLSearchParams(window.location.search).get('upgrade')==='true'){
      window.location.href=window.location.pathname+'?upgrade=true'
      return
    }
    setBusy(false)
  }
  const logoSvg=<svg width="32" height="32" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="10" fill="rgba(0,192,107,0.15)"/><rect x="16" y="6" width="8" height="28" rx="4" fill="#00c06b"/><rect x="6" y="16" width="28" height="8" rx="4" fill="#00c06b"/><circle cx="20" cy="20" r="5" fill="#00e87f"/></svg>
  return(
    <div style={{minHeight:'100vh',display:'flex',fontFamily:'-apple-system,BlinkMacSystemFont,sans-serif',position:'relative',overflow:'hidden',background:'#0a1628'}}>
      {/* LEFT PANEL - branding */}
      <div style={{display:'none',position:'relative',flex:1,background:'linear-gradient(160deg,#0a2818 0%,#0a1628 100%)',padding:'48px',flexDirection:'column',justifyContent:'space-between','@media(min-width:768px)':{display:'flex'}}}>
        <div style={{position:'absolute',top:0,right:0,bottom:0,left:0,background:'radial-gradient(ellipse 80% 60% at 30% 40%,rgba(0,192,107,0.12),transparent)',pointerEvents:'none'}}/>
        <div style={{position:'absolute',bottom:-100,right:-100,width:400,height:400,background:'radial-gradient(circle,rgba(0,232,127,0.06),transparent 70%)',pointerEvents:'none'}}/>
      </div>
      {/* MAIN - centered card */}
      <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px',background:'linear-gradient(160deg,#0a1628 0%,#0f2044 60%,#0a1628 100%)',position:'relative'}}>
        {/* bg orbs */}
        <div style={{position:'absolute',top:'-10%',right:'-5%',width:340,height:340,background:'radial-gradient(circle,rgba(0,192,107,0.1),transparent 70%)',pointerEvents:'none'}}/>
        <div style={{position:'absolute',bottom:'-8%',left:'-5%',width:280,height:280,background:'radial-gradient(circle,rgba(26,58,107,0.4),transparent 70%)',pointerEvents:'none'}}/>
        {/* grid lines */}
        <div style={{position:'absolute',inset:0,backgroundImage:'linear-gradient(rgba(255,255,255,0.02) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.02) 1px,transparent 1px)',backgroundSize:'60px 60px',pointerEvents:'none'}}/>

        <div style={{width:'100%',maxWidth:420,position:'relative',zIndex:1}}>
          {/* LOGO + BRAND */}
          <div style={{textAlign:'center',marginBottom:40}}>
            <div style={{display:'inline-flex',alignItems:'center',gap:14,marginBottom:20,textDecoration:'none'}}>
              <div style={{width:52,height:52,borderRadius:14,background:'rgba(0,192,107,0.12)',border:'1px solid rgba(0,192,107,0.3)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {logoSvg}
              </div>
              <div style={{textAlign:'left'}}>
                <div style={{fontSize:18,fontWeight:900,color:'#fff',lineHeight:1.1,letterSpacing:'-0.5px'}}>EasyMedical</div>
                <div style={{fontSize:10,fontWeight:700,color:'rgba(0,192,107,0.8)',textTransform:'uppercase',letterSpacing:'.14em',marginTop:2}}>Solutions</div>
              </div>
            </div>
            <div style={{height:'1px',background:'linear-gradient(90deg,transparent,rgba(0,192,107,0.3),transparent)',marginBottom:28}}/>
            <div style={{fontSize:22,fontWeight:800,color:'#fff',letterSpacing:'-0.8px',marginBottom:8}}>Welcome back</div>
            <div style={{fontSize:13,color:'rgba(255,255,255,0.4)',lineHeight:1.5}}>Sign in to your hospital account</div>
          </div>

          {/* CARD */}
          <div style={{background:'rgba(255,255,255,0.04)',backdropFilter:'blur(24px)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:24,padding:'32px 28px',boxShadow:'0 32px 80px rgba(0,0,0,0.4)'}}>

            {/* USERNAME */}
            <div style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:11,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8,fontWeight:700}}>Username</label>
              <div style={{position:'relative'}}>
                <div style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="rgba(255,255,255,0.3)" stroke-width="2"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="rgba(255,255,255,0.3)" stroke-width="2" stroke-linecap="round"/></svg>
                </div>
                <input type="text" placeholder="Enter your username" value={username} onChange={e=>setUsername(e.target.value)} autoCapitalize="none" autoCorrect="off" onKeyDown={e=>e.key==='Enter'&&go()} style={{width:'100%',padding:'13px 14px 13px 42px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:12,fontSize:15,color:'#fff',fontFamily:'inherit',outline:'none',boxSizing:'border-box',transition:'border-color .2s'}} onFocus={e=>e.target.style.borderColor='rgba(0,192,107,0.5)'} onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.1)'}/>
              </div>
            </div>

            {/* PASSWORD */}
            <div style={{marginBottom:20}}>
              <label style={{display:'block',fontSize:11,color:'rgba(255,255,255,0.5)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8,fontWeight:700}}>Password</label>
              <div style={{position:'relative'}}>
                <div style={{position:'absolute',left:14,top:'50%',transform:'translateY(-50%)',pointerEvents:'none'}}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="3" y="11" width="18" height="11" rx="2" stroke="rgba(255,255,255,0.3)" stroke-width="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="rgba(255,255,255,0.3)" stroke-width="2"/></svg>
                </div>
                <input type={show?'text':'password'} placeholder="Enter your password" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&go()} style={{width:'100%',padding:'13px 48px 13px 42px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:12,fontSize:15,color:'#fff',fontFamily:'inherit',outline:'none',boxSizing:'border-box',transition:'border-color .2s'}} onFocus={e=>e.target.style.borderColor='rgba(0,192,107,0.5)'} onBlur={e=>e.target.style.borderColor='rgba(255,255,255,0.1)'}/>
                <button onClick={()=>setShow(!show)} style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,0.35)',padding:4,display:'flex'}}>
                  {show?<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round"/><line x1="1" y1="1" x2="23" y2="23" stroke="rgba(255,255,255,0.5)" stroke-width="2" stroke-linecap="round"/></svg>:<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="rgba(255,255,255,0.5)" stroke-width="2"/><circle cx="12" cy="12" r="3" stroke="rgba(255,255,255,0.5)" stroke-width="2"/></svg>}
                </button>
              </div>
            </div>

            {/* ERROR */}
            {err&&<div style={{fontSize:13,color:'#fca5a5',marginBottom:16,padding:'10px 14px',borderRadius:10,background:'rgba(220,38,38,0.12)',border:'1px solid rgba(220,38,38,0.25)',textAlign:'center',display:'flex',alignItems:'center',gap:8,justifyContent:'center'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#fca5a5" stroke-width="2"/><line x1="12" y1="8" x2="12" y2="12" stroke="#fca5a5" stroke-width="2" stroke-linecap="round"/><line x1="12" y1="16" x2="12.01" y2="16" stroke="#fca5a5" stroke-width="3" stroke-linecap="round"/></svg>
              {err}
            </div>}

            {/* SIGN IN BUTTON */}
            <button onClick={go} disabled={busy||!username||!pass} style={{width:'100%',padding:'14px',background:busy||!username||!pass?'rgba(0,192,107,0.3)':'linear-gradient(135deg,#00c06b,#00e87f)',color:busy||!username||!pass?'rgba(255,255,255,0.4)':'#0a1628',border:'none',borderRadius:12,fontSize:15,fontWeight:800,cursor:busy||!username||!pass?'not-allowed':'pointer',letterSpacing:'-0.2px',transition:'all .2s',boxShadow:busy||!username||!pass?'none':'0 8px 24px rgba(0,192,107,0.3)'}}>
              {busy?<span style={{display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{animation:'spin 1s linear infinite'}}><circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" stroke-width="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#0a1628" stroke-width="3" stroke-linecap="round"/></svg>
                Signing in...
              </span>:'Sign in to EasyMedical'}
            </button>
          </div>

          {/* REGISTER LINK */}
          <div style={{textAlign:'center',marginTop:24}}>
            <span style={{fontSize:13,color:'rgba(255,255,255,0.4)'}}>New hospital? </span>
            <button onClick={onRegister} style={{fontSize:13,color:'#00c06b',background:'none',border:'none',cursor:'pointer',fontWeight:700,padding:0}}>Register for free trial</button>
          </div>

          {/* TRUST FOOTER */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'center',gap:20,marginTop:28,paddingTop:20,borderTop:'1px solid rgba(255,255,255,0.06)'}}>
            <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'rgba(255,255,255,0.3)'}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="rgba(0,192,107,0.5)" stroke-width="2"/></svg>
              Secure login
            </div>
            <div style={{width:1,height:12,background:'rgba(255,255,255,0.1)'}}/>
            <div style={{display:'flex',alignItems:'center',gap:6,fontSize:11,color:'rgba(255,255,255,0.3)'}}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.9a16 16 0 0 0 6.09 6.09l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7a2 2 0 0 1 1.72 2.02v.04z" stroke="rgba(0,192,107,0.5)" stroke-width="2"/></svg>
              Support: 7013211742
            </div>
            <div style={{width:1,height:12,background:'rgba(255,255,255,0.1)'}}/>
            <div style={{fontSize:11,color:'rgba(255,255,255,0.3)'}}>Made in India</div>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
/*  ADMIN  */
const AdminTab=({currentUser,hospital=null,onLogoUpdate=()=>{}})=>{
  const [users,setUsers]=useState([])
  const [loading,setLoading]=useState(true)
  const [showAdd,setShowAdd]=useState(false)
  const [nF,setNF]=useState({name:'',username:'',pass:'',role:'staff'})
  const [busy,setBusy]=useState(false)
  const [msg,setMsg]=useState(null)
  const [logoUrl,setLogoUrl]=useState(hospital?.logo_url||'')
  const [logoUploading,setLogoUploading]=useState(false)
  const [logoMsg,setLogoMsg]=useState('')
  const uploadLogo=async(e)=>{
    const file=e.target.files?.[0];if(!file)return
    if(!file.type.startsWith('image/')){setLogoMsg('Please select an image file');return}
    if(file.size>2*1024*1024){setLogoMsg('Image must be under 2MB');return}
    setLogoUploading(true);setLogoMsg('')
    const ext=file.name.split('.').pop()
    const path=`${hospital.id}/logo.${ext}`
    const {error:upErr}=await supabase.storage.from('hospital-logos').upload(path,file,{upsert:true})
    if(upErr){setLogoMsg('Upload failed: '+upErr.message);setLogoUploading(false);return}
    const {data:{publicUrl}}=supabase.storage.from('hospital-logos').getPublicUrl(path)
    const url=publicUrl+'?t='+Date.now()
    await supabase.from('hospitals').update({logo_url:url}).eq('id',hospital.id)
    setLogoUrl(url);onLogoUpdate(url)
    setLogoMsg('Logo updated!');setLogoUploading(false)
    setTimeout(()=>setLogoMsg(''),3000)
  }
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
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:8}}>
          {logoUrl?<img src={logoUrl} alt="logo" style={{width:44,height:44,borderRadius:10,objectFit:'cover',border:'2px solid rgba(255,255,255,0.3)'}}/>:<div style={{width:44,height:44,borderRadius:10,background:'rgba(255,255,255,0.15)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color:'#fff',flexShrink:0}}>{hospital.name?.[0]||'H'}</div>}
          <div>
            <div style={{fontSize:11,color:'#bfdbfe',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Your hospital</div>
            <div style={{fontSize:16,fontWeight:700}}>{hospital.name}</div>
          </div>
        </div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:10}}>
          <span style={{fontSize:11,padding:'2px 8px',borderRadius:20,background:'rgba(255,255,255,0.2)',color:'#fff',fontWeight:700}}>{hospital.plan?.toUpperCase()}</span>
          <span style={{fontSize:11,color:'#bfdbfe'}}>Expires: {fmtD(hospital.plan_end)}</span>
        </div>
        <div style={{borderTop:'1px solid rgba(255,255,255,0.15)',paddingTop:10}}>
          <div style={{fontSize:11,color:'#bfdbfe',fontWeight:700,textTransform:'uppercase',marginBottom:8}}>Hospital logo</div>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <label style={{display:'inline-flex',alignItems:'center',gap:8,background:'rgba(255,255,255,0.15)',border:'1px solid rgba(255,255,255,0.25)',color:'#fff',padding:'7px 14px',borderRadius:10,cursor:'pointer',fontSize:12,fontWeight:600}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="white" stroke-width="2" stroke-linecap="round"/><polyline points="17 8 12 3 7 8" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>
              {logoUploading?'Uploading...':'Upload logo'}
              <input type="file" accept="image/*" onChange={uploadLogo} style={{display:'none'}} disabled={logoUploading}/>
            </label>
            {logoUrl&&<div style={{fontSize:11,color:'#bfdbfe'}}>Logo uploaded</div>}
          </div>
          {logoMsg&&<div style={{marginTop:6,fontSize:12,color:logoMsg.includes('failed')||logoMsg.includes('must')?'#fca5a5':'#bbf7d0',fontWeight:600}}>{logoMsg}</div>}
          <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',marginTop:6}}>Recommended: Square image, PNG or JPG, under 2MB</div>
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
          <PBtn onClick={createUser} disabled={busy}>{busy?'Creating...':'Create account'}</PBtn>
          {msg?.ok&&<div style={{marginTop:12,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'12px 14px',fontSize:13,lineHeight:1.8}}>Share with staff:<br/>Username: <strong>{msg.user}</strong><br/>Password: <strong>{msg.pass}</strong></div>}
        </Card>
      )}
      <SecL>All staff ({users.length})</SecL>
      {loading?<div style={{textAlign:'center',padding:24,color:'#ccc'}}>Loading...</div>:(
        <Card>{users.map(u=>{const [bg,tx]=(RC[u.role]||RC.staff);return(
          <Row key={u.id} left={<span style={{fontSize:14,fontWeight:600}}>{u.name||'-'}</span>} sub={`@${u.username||'-'}`} right={<span style={{fontSize:11,padding:'3px 9px',borderRadius:20,background:bg,color:tx,fontWeight:700}}>{u.role||'staff'}</span>}/>
        )})}</Card>
      )}
    </div>
  )
}

/*  CREDIT TAB  */
const CreditTab=({db,actions})=>{
  const [collectEntry,setCollectEntry]=useState(null)
  if(collectEntry)return(<CollectCreditForm entry={collectEntry} onSave={async row=>{const ok=await actions.editIncome(row);if(ok!==false)setCollectEntry(null)}} onCancel={()=>setCollectEntry(null)}/>)
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
        <div style={{fontSize:13,color:'#fed7aa',marginTop:6}}>{pts.length} patient{pts.length!==1?'s':''} - {allCredit.length} entr{allCredit.length!==1?'ies':'y'}</div>
      </div>
      {totalCred===0&&<div style={{textAlign:'center',padding:'48px 20px',color:'#aaa'}}><div style={{fontSize:40,marginBottom:12}}></div><div style={{fontSize:16,fontWeight:600,color:'#555'}}>No outstanding credit!</div></div>}
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
            {Object.entries(pt.byType).map(([tk,amt])=>{const it=ITYPES.find(t=>t.key===tk);const typeEntries=allCredit.filter(e=>e.patient_name===pt.name&&e.type===tk);return(
              <div key={tk} style={{padding:'8px 0',borderBottom:'1px solid #fef3c7'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
                  <span style={{display:'flex',alignItems:'center',gap:8,fontSize:13}}><TypeTag t={tk}/>{it?.full||tk}</span>
                  <span style={{color:'#c2410c',fontWeight:600,fontSize:14}}>{fmt(amt)}</span>
                </div>
                {typeEntries.map(e=>(
                  <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6,paddingLeft:6}}>
                    <span style={{fontSize:12,color:'#aaa'}}>{fmtD(e.date)} - {fmt(e.amount)}{e.notes?' - '+e.notes:''}</span>
                    <button onClick={()=>setCollectEntry(e)} style={{padding:'4px 12px',background:'#16a34a',border:'none',borderRadius:8,fontSize:11,color:'#fff',cursor:'pointer',fontWeight:700,whiteSpace:'nowrap'}}>Collect</button>
                  </div>
                ))}
              </div>
            )})}
            {Object.keys(pt.byType).length>1&&<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:2,fontSize:13,fontWeight:700,color:'#92400e'}}><span>Total due</span><span>{fmt(pt.total)}</span></div>}
          </Card>
        ))}
      </>)}
    </div>
  )
}

/*  DAILY ENTRY  */

/*  COLLECT CREDIT PAYMENT FORM  */
const CollectCreditForm=({entry,onSave,onCancel})=>{
  const [date,setDate]=useState(todayStr())
  const [pay,setPay]=useState('cash')
  const [busy,setBusy]=useState(false)
  const it=ITYPES.find(t=>t.key===entry.type)
  const previewComm=getComm({...entry,payment:pay})
  const go=async()=>{setBusy(true);await onSave({...entry,payment:pay,date});setBusy(false)}
  return(
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:'20px 16px 40px',width:'100%',maxWidth:520}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:700,color:'#16a34a'}}>Collect credit payment</div>
          <button onClick={onCancel} style={{background:'#f0f0f0',border:'none',borderRadius:20,width:32,height:32,fontSize:16,cursor:'pointer',color:'#555'}}>x</button>
        </div>
        <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'12px 14px',marginBottom:14}}>
          <div style={{fontSize:11,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Amount to collect</div>
          <div style={{fontSize:24,fontWeight:800,color:'#16a34a'}}>{fmt(entry.amount)}</div>
          <div style={{fontSize:12,color:'#aaa',marginTop:4}}>{it?.full||entry.type} - {entry.patient_name||'Patient'} - originally {fmtD(entry.date)}</div>
        </div>
        <FInp label="Collection date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
        <div style={{marginBottom:14}}>
          <label style={{display:'block',fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8,fontWeight:700}}>Payment received via</label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {['cash','upi','card','other'].map(m=>(
              <button key={m} onClick={()=>setPay(m)} style={{padding:'10px 4px',border:pay===m?'2px solid #16a34a':'1px solid #e5e7eb',borderRadius:10,background:pay===m?'#f0fdf4':'#fff',color:pay===m?'#16a34a':'#555',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                {m[0].toUpperCase()+m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {previewComm>0&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:10,fontSize:13,color:'#92400e'}}>Commission to Dr. {entry.ref_doctor}: <strong>{fmt(previewComm)}</strong> will now be counted</div>}
        <div style={{display:'flex',gap:8}}>
          <button onClick={onCancel} style={{flex:1,padding:'12px',background:'none',border:'1px solid #e5e7eb',borderRadius:12,fontSize:14,color:'#555',cursor:'pointer'}}>Cancel</button>
          <PBtn onClick={go} disabled={busy} style={{flex:2,marginTop:0,background:'#16a34a'}}>{busy?'Saving...':'Mark as collected'}</PBtn>
        </div>
      </div>
    </div>
  )
}

/*  EDIT ENTRY FORM  */
const EditEntryForm=({entry,db,onSave,onCancel})=>{
  const [amount,setAmount]=useState(String(entry.amount))
  const [patName,setPatName]=useState(entry.patient_name||'')
  const [patPhone,setPatPhone]=useState(entry.patient_phone||'')
  const [patArea,setPatArea]=useState(entry.patient_area||'')
  const [ref,setRef]=useState(entry.ref_doctor||'')
  const [custComm,setCustComm]=useState(entry.custom_commission!=null?String(Math.round(entry.custom_commission)):'')
  const [pay,setPay]=useState(entry.payment||'cash')
  const [notes,setNotes]=useState(entry.notes||'')
  const [date,setDate]=useState(entry.date||todayStr())
  const [opType,setOpType]=useState(entry.op_type||'New OP')
  const [vcConsultant,setVcConsultant]=useState(entry.consultant_name||'')
  const [vcFee,setVcFee]=useState(entry.consultant_fee!=null?String(entry.consultant_fee):'')
  const [busy,setBusy]=useState(false)
  const isOP=entry.type==='op'
  const isVC=entry.type==='vc'
  const isIPtype=['ip','ip_r','ip_l'].includes(entry.type)
  const showRefField=!isIPtype&&!isVC
  const defaultCommPct=COMM[entry.type]!=null?Math.round(COMM[entry.type]*100):0
  const commPct=custComm!==''?parseFloat(custComm)||0:defaultCommPct
  const comm=ref.trim()&&commPct>0?parseFloat(amount||0)*commPct/100:0
  const go=async()=>{
    const amt=parseFloat(amount);if(!amt||amt<=0){alert('Enter valid amount');return}
    setBusy(true)
    await onSave({...entry,amount:amt,patient_name:patName,patient_phone:patPhone||'',patient_area:patArea||'',ref_doctor:ref.trim(),payment:pay,notes,date,op_type:opType,custom_commission:custComm!==''?parseFloat(custComm):null,consultant_name:isVC?vcConsultant:'',consultant_fee:isVC?parseFloat(vcFee||0):entry.consultant_fee})
    setBusy(false)
  }
  return(
    <div style={{position:'fixed',inset:0,background:'#f8fafc',zIndex:9999,overflowY:'auto'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #f0f0f0',padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,zIndex:10}}>
        <button onClick={onCancel} style={{background:'none',border:'none',color:'#3b82f6',fontSize:14,fontWeight:600,cursor:'pointer',padding:'4px 0'}}>Cancel</button>
        <div style={{display:'flex',alignItems:'center',gap:8}}><TypeTag t={entry.type}/><span style={{fontSize:14,fontWeight:700}}>Edit entry</span></div>
        <button onClick={go} disabled={busy} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',fontSize:14,fontWeight:700,cursor:'pointer',opacity:busy?0.6:1}}>{busy?'Saving...':'Save'}</button>
      </div>
      <div style={{padding:'16px',maxWidth:480,margin:'0 auto'}}>
        <FInp label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
        {!isIPtype&&<FInp label="Patient name" type="text" value={patName} onChange={e=>setPatName(e.target.value)} placeholder="Patient name"/>}
        {!isIPtype&&<FInp label="Patient phone (optional)" type="tel" value={patPhone} onChange={e=>setPatPhone(e.target.value)} placeholder="9999999999"/>}
        {!isIPtype&&<FInp label="Patient area (optional)" type="text" value={patArea} onChange={e=>setPatArea(e.target.value)} placeholder="e.g. Kukatpally, Miyapur"/>}
        <FInp label="Amount (Rs)" type="number" inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)}/>
        {isOP&&<FSel label="OP type" value={opType} onChange={e=>setOpType(e.target.value)}>{OP_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</FSel>}
        <FSel label="Payment mode" value={pay} onChange={e=>setPay(e.target.value)}>{PMODES.map(m=><option key={m} value={m}>{m==='credit'?'Credit (Due)':m[0].toUpperCase()+m.slice(1)}</option>)}</FSel>
        {isVC&&<>
          <FSel label="Visiting consultant" value={vcConsultant} onChange={e=>setVcConsultant(e.target.value)}>
            <option value="">- Select consultant -</option>
            {(db?.consultants||[]).map(d=><option key={d.id} value={d.name}>{d.name}</option>)}
          </FSel>
          <FInp label="Consultant fee paid (Rs)" type="number" inputMode="numeric" value={vcFee} onChange={e=>setVcFee(e.target.value)} placeholder="0"/>
          {vcFee&&parseFloat(vcFee)>0&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#15803d'}}>Hospital profit: {fmt(parseFloat(amount||0)-parseFloat(vcFee||0))}</div>}
        </>}
        {showRefField&&<FSel label="Referring doctor" value={ref} onChange={e=>{const sel=(db?.ref_doctors||[]).find(d=>d.name===e.target.value);const pctKey={op_r:'op_r_pct',op_l:'op_l_pct'}[entry.type]||'op_r_pct';const pct=sel?sel[pctKey]:null;setRef(e.target.value);if(pct!=null&&custComm==='')setCustComm(String(pct))}}>
          <option value="">- No referral / Self -</option>
          {(db?.ref_doctors||[]).map(d=><option key={d.id} value={d.name}>Dr. {d.name}{d.area?' ('+d.area+')':''}</option>)}
        </FSel>}
        {showRefField&&ref.trim()!==''&&<FInp label={`Commission % (default ${defaultCommPct}%)`} type="number" inputMode="numeric" value={custComm} onChange={e=>setCustComm(e.target.value)} placeholder={String(defaultCommPct)}/>}
        {comm>0&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#92400e'}}>Commission to Dr. {ref}: {fmt(comm)} ({commPct}%)</div>}
        <FInp label="Notes (optional)" type="text" placeholder="Optional" value={notes} onChange={e=>setNotes(e.target.value)}/>
        <PBtn onClick={go} disabled={busy} style={{marginTop:8}}>{busy?'Saving...':'Save changes'}</PBtn>
        <button onClick={onCancel} style={{width:'100%',padding:'12px',background:'none',border:'1px solid #e5e7eb',borderRadius:12,fontSize:14,color:'#aaa',cursor:'pointer',marginTop:8}}>Cancel</button>
      </div>
    </div>
  )
}

const EntryTab=({db,actions,eDate,setEDate,itype,setItype,iF,setIF})=>{
  const [editEntry,setEditEntry]=useState(null)
  const [editIPPatient,setEditIPPatient]=useState(null)
  const di=db.income.filter(e=>e.date===eDate)
  const tots={};ITYPES.forEach(t=>{tots[t.key]=di.filter(e=>e.type===t.key).reduce((a,e)=>a+e.amount,0)})
  const tot=Object.values(tots).reduce((a,b)=>a+b,0)
  const isIP=['ip','ip_r','ip_l'].includes(itype)
  const aps=db.ip_patients.filter(p=>!p.discharge_date)
  const custCommPct=iF.custom_commission!==''?parseFloat(iF.custom_commission)/100:(COMM[itype]||0)
  const prev=iF.amount&&iF.ref&&iF.ref.trim()&&(custCommPct>0||iF.custom_commission!=='')?parseFloat(iF.amount||0)*(iF.custom_commission!==''?parseFloat(iF.custom_commission)/100:(COMM[itype]||0)):0
  const todayCash=cashTotal(di);const todayCredit=credTotal(di)
  if(editEntry)return(<EditEntryForm entry={editEntry} db={db} onSave={async row=>{const ok=await actions.editIncome(row);if(ok!==false)setEditEntry(null)}} onCancel={()=>setEditEntry(null)}/>)
  const go=async()=>{
    const amt=parseFloat(iF.amount);if(!amt||amt<=0){alert('Enter a valid amount');return}
    let pid=null,pname=''
    if(isIP){pid=iF.pid||null;if(pid){pname=db.ip_patients.find(p=>p.id===pid)?.name||''}}
    else{if(!iF.pname.trim()&&itype!=='vc'){alert('Patient name is required');return};pname=iF.pname.trim()}
    let regNo=null;if(!isIP&&itype==='op'){regNo=await genRegNo()}
    const ok=await actions.addIncome({id:uid(),date:eDate,type:itype,amount:amt,patient_id:pid,patient_name:pname,payment:iF.pay,ref_doctor:isIP?'':iF.ref.trim(),notes:iF.notes,consultant_fee:itype==='op'?Math.round(parseFloat(iF.amount||0)*(db.consultants.find(d=>d.name===iF.consultant_name)?.fee_share_pct||0)/100):(itype==='vc'?parseFloat(iF.consultant_fee||0):0),consultant_name:itype==='op'?iF.consultant_name:'',op_type:['op'].includes(itype)?iF.op_type:'',custom_commission:iF.custom_commission!==''?parseFloat(iF.custom_commission):null,reg_no:regNo,patient_area:iF.patient_area?.trim()||''})
    if(ok!==false)setIF({amount:'',pid:'',pname:'',ref:'',pay:'cash',notes:'',consultant_fee:0,consultant_name:'',phone:'',op_type:'New OP',custom_commission:'',patient_area:''})
  }
  return(
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <input style={{...S.inp,flex:1}} type="date" value={eDate} onChange={e=>setEDate(e.target.value)}/>
        <GBtn onClick={()=>setEDate(todayStr())}>Today</GBtn>
      </div>
      <SecL>Select income type</SecL>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,marginBottom:14}}>
        {ITYPES.filter(t=>t.key!=='vc').map(t=>{const [bg,tx]=TC[t.key];const on=itype===t.key;return(
          <button key={t.key} onClick={()=>{setItype(t.key);if((t.key==='op_r'||t.key==='op_l')&&!iF.pname.trim()){const lastOP=[...db.income].reverse().find(e=>e.type==='op'&&e.date===eDate&&e.patient_name);if(lastOP?.patient_name)setIF(f=>({...f,pname:lastOP.patient_name}))}}} style={{padding:'10px 4px',border:on?`2.5px solid ${tx}`:'1.5px solid #e2e8f0',borderRadius:12,background:on?bg:'#fff',cursor:'pointer',textAlign:'center',boxShadow:on?'0 4px 12px rgba(0,0,0,0.08)':'0 1px 3px rgba(0,0,0,0.04)',transition:'all .15s'}}>
            <div style={{fontSize:12,fontWeight:700,color:on?tx:'#555'}}>{t.label}</div>
            <div style={{fontSize:9,color:on?tx:'#aaa',marginTop:2}}>{t.full}</div>
            {COMM[t.key]>0&&<div style={{fontSize:9,color:on?tx:'#ccc',marginTop:1}}>Ref: {CLBL[t.key]}</div>}
          </button>
        )})}
      </div>
      <Card>
        <FInp label="Amount (Rs )" type="number" inputMode="numeric" placeholder="0" value={iF.amount} onChange={e=>setIF({...iF,amount:e.target.value})}/>
        {prev>0&&iF.ref&&itype!=='op'&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'10px 12px',marginBottom:10,fontSize:13,color:'#92400e'}}>Commission to Dr. <strong>{iF.ref}</strong>: <strong style={{color:'#c2410c'}}>{fmt(prev)}</strong> <span style={{fontSize:11,opacity:.8}}>({iF.custom_commission!==''?iF.custom_commission+'%':'auto'} of {fmt(parseFloat(iF.amount||0))})</span></div>}
        {isIP?<FSel label="IP Patient" value={iF.pid} onChange={e=>setIF({...iF,pid:e.target.value})}><option value="">- select admitted patient -</option>{aps.map(p=><option key={p.id} value={p.id}>{p.name}{p.ref_doctor?' (Ref: '+p.ref_doctor+')':''}</option>)}</FSel>
          :<>
            {(itype==='op_r'||itype==='op_l')?(
              <div style={{marginBottom:10}}>
                <label style={{display:'block',fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:5,fontWeight:700}}>Patient name *</label>
                <input list="op-patients-list" style={S.inp} placeholder="Type or select patient name" value={iF.pname} onChange={e=>setIF({...iF,pname:e.target.value})} autoCorrect="off" autoCapitalize="words"/>
                <datalist id="op-patients-list">
                  {[...new Set(db.income.filter(e=>e.type==='op'&&e.date===eDate&&e.patient_name).map(e=>e.patient_name))].map(n=><option key={n} value={n}/>)}
                </datalist>
                {iF.pname&&db.income.find(e=>e.type==='op'&&e.patient_name.toLowerCase()===iF.pname.toLowerCase())&&<div style={{fontSize:11,color:'#16a34a',marginTop:4,fontWeight:600}}>Patient matched - all entries will group together</div>}
              </div>
            ):<FInp label="Patient name *" type="text" placeholder="Required" value={iF.pname} onChange={e=>setIF({...iF,pname:e.target.value})}/>}
            <FInp label="Phone (optional)" type="tel" placeholder="9999999999" value={iF.phone||''} onChange={e=>setIF({...iF,phone:e.target.value})}/>
            {!isIP&&<FInp label="Patient area (optional)" type="text" placeholder="e.g. Kukatpally, Miyapur, KPHB" value={iF.patient_area||''} onChange={e=>setIF({...iF,patient_area:e.target.value})}/>}
            {itype==='op'&&<FSel label="OP type" value={iF.op_type} onChange={e=>setIF({...iF,op_type:e.target.value})}>{OP_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</FSel>}
            {!isIP&&itype==='op'&&(<>
              <FSel label="Visiting consultant (optional)" value={iF.consultant_name||''} onChange={e=>{const con=db.consultants.find(d=>d.name===e.target.value);setIF({...iF,consultant_name:e.target.value,consultant_fee:con&&iF.amount?Math.round(parseFloat(iF.amount||0)*con.fee_share_pct/100):0})}}>
                <option value="">- No visiting consultant -</option>
                {db.consultants.map(d=><option key={d.id} value={d.name}>Dr. {d.name}</option>)}
              </FSel>
              {iF.consultant_name&&iF.amount&&(()=>{const con=db.consultants.find(d=>d.name===iF.consultant_name);if(!con)return null;const share=parseFloat(iF.amount||0)*(con.fee_share_pct/100);const hospital=parseFloat(iF.amount||0)-share;return(<div style={{background:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:8,padding:'10px 12px',marginBottom:8,fontSize:13}}><div style={{color:'#7e22ce',fontWeight:700,marginBottom:6}}>Dr. {con.name} - fee split</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}><div style={{textAlign:'center',background:'#ede9fe',borderRadius:8,padding:'8px'}}><div style={{fontSize:9,color:'#7e22ce',fontWeight:700,textTransform:'uppercase'}}>Doctor gets ({con.fee_share_pct}%)</div><div style={{fontSize:20,fontWeight:800,color:'#7e22ce'}}>{fmt(share)}</div></div><div style={{textAlign:'center',background:'#f0fdf4',borderRadius:8,padding:'8px'}}><div style={{fontSize:9,color:'#15803d',fontWeight:700,textTransform:'uppercase'}}>Hospital keeps</div><div style={{fontSize:20,fontWeight:800,color:'#15803d'}}>{fmt(hospital)}</div></div></div></div>)})()}
              <FSel label="Referring doctor (optional)" value={iF.ref} onChange={e=>{const sel=db.ref_doctors.find(d=>d.name===e.target.value);const pct=sel?sel.op_pct:null;setIF({...iF,ref:e.target.value,custom_commission:pct!=null?String(pct):''})}}>
                <option value="">- No referral / Self patient -</option>
                {db.ref_doctors.map(d=><option key={d.id} value={d.name}>Dr. {d.name}{d.area?' ('+d.area+')':''}</option>)}
              </FSel>
              {iF.ref&&(()=>{const doc=db.ref_doctors.find(d=>d.name===iF.ref);if(!doc)return null;return(<div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
                {doc.area&&<span style={{background:'#eff6ff',border:'1px solid #bfdbfe',color:'#1d4ed8',fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:100}}>Area: {doc.area}</span>}
                {iF.amount&&doc.op_pct>0&&<span style={{background:'#fff7ed',border:'1px solid #fed7aa',color:'#92400e',fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:100}}>Commission: {fmt(parseFloat(iF.amount||0)*(doc.op_pct/100))} ({doc.op_pct}%)</span>}
              </div>)})()}
            </>)}
            {!isIP&&(itype==='op_r'||itype==='op_l')&&iF.pname.trim()&&(()=>{const opEntry=db.income.find(e=>e.type==='op'&&e.patient_name===iF.pname.trim()&&e.ref_doctor);if(!opEntry)return null;const doc=db.ref_doctors.find(d=>d.name===opEntry.ref_doctor);const pctKey=itype==='op_r'?'op_r_pct':'op_l_pct';const pct=doc?doc[pctKey]:null;if(iF.ref!==opEntry.ref_doctor){setIF({...iF,ref:opEntry.ref_doctor,custom_commission:pct!=null?String(pct):''})}return(<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#15803d'}}>Ref doctor auto-filled: <strong>Dr. {opEntry.ref_doctor}</strong>{pct!=null?' ('+pct+'%)':''}</div>)})()}
            {itype==='vc'&&<>
              <FInp label="Consultant name" type="text" placeholder="e.g. Dr. Sharma (Neurologist)" value={iF.ref} onChange={e=>setIF({...iF,ref:e.target.value})}/>
              <FInp label="Consultant fee to pay (Rs )" type="number" inputMode="numeric" placeholder="Amount you give to consultant" value={iF.consultant_fee||''} onChange={e=>setIF({...iF,consultant_fee:e.target.value})}/>
              {iF.amount&&iF.consultant_fee&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13}}>
                <span style={{color:'#065f46',fontWeight:600}}>Your income: </span>
                <span style={{color:'#16a34a',fontWeight:700,fontSize:15}}>{fmt(parseFloat(iF.amount||0)-parseFloat(iF.consultant_fee||0))}</span>
                <span style={{color:'#888',fontSize:11,marginLeft:6}}>(Rs {iF.amount} collected  Rs {iF.consultant_fee} to consultant)</span>
              </div>}
            </>}
          </>}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FSel label="Payment" value={iF.pay} onChange={e=>setIF({...iF,pay:e.target.value})}>{PMODES.map(m=><option key={m} value={m}>{m==='credit'?'Credit (Due)':m[0].toUpperCase()+m.slice(1)}</option>)}</FSel>
          <FInp label="Notes" type="text" placeholder="Optional" value={iF.notes} onChange={e=>setIF({...iF,notes:e.target.value})}/>
        </div>
        {iF.pay==='credit'&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#92400e'}}>Recording as credit - not yet collected</div>}
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
      <SecL>Entries for {fmtD(eDate)} - {fmt(tot)}</SecL>
      {di.length===0&&<div style={{textAlign:'center',padding:'24px 0',color:'#ccc',fontSize:13}}>No entries yet</div>}
      {ITYPES.map(t=>{
        const ents=di.filter(e=>e.type===t.key);if(!ents.length)return null
        return(<div key={t.key}>
          <SecL>{t.full} - {fmt(tots[t.key])}</SecL>
          <Card>{ents.map(e=>{const doc=getRefDoc(e,db.ip_patients);const comm=getComm(e);const cr=isCredit(e);return(
            <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}>
              <div style={{flex:1,minWidth:0,paddingRight:8}}>
                <div style={{fontSize:13,fontWeight:500,color:'#111',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                  <TypeTag t={t.key}/>{e.patient_name||'-'}
                  {cr&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#fed7aa',color:'#92400e',fontWeight:700}}>CREDIT</span>}
                </div>
                <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{cr?'Credit (not collected)':e.payment}{e.type==='vc'&&e.ref_doctor?' - Consultant: '+e.ref_doctor:doc?' - Ref: '+doc:''}{comm?' - Comm: '+fmt(comm):''}{e.type==='vc'&&e.consultant_fee>0?' - Fee to consultant: '+fmt(e.consultant_fee)+' - Your income: '+fmt(e.amount-e.consultant_fee):''}{e.notes?' - '+e.notes:''}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                <span style={{color:cr?'#c2410c':'#16a34a',fontWeight:600,fontSize:13}}>{fmt(e.amount)}</span>
                <button onClick={()=>setEditEntry(e)} style={{padding:'5px 12px',background:'#f0f9ff',border:'1.5px solid #3b82f6',borderRadius:8,fontSize:12,color:'#1d4ed8',cursor:'pointer',fontWeight:600}}>Edit</button>
                <DBtn onClick={()=>actions.delIncome(e.id)}></DBtn>
              </div>
            </div>
          )})}</Card>
        </div>)
      })}
    </div>
  )
}

const IPTab=({db,actions,ipv,setIpv,ipid,setIpid,pF,setPF,cF,setCF,pyF,setPyF,gotoIP,prevTab,setPrevTab,setTab,setEditIPPatient})=>{
  const [editIPEntry,setEditIPEntry]=useState(null)
  const [collectEntry,setCollectEntry]=useState(null)
  const [ipSearch,setIpSearch]=useState('')
  const [ipView,setIpView]=useState('all')
  const [ipMonth,setIpMonth]=useState(todayStr().slice(0,7))
  const [ipRefFilter,setIpRefFilter]=useState('')
  const getBill=pid=>{
    const en=db.income.filter(e=>e.patient_id===pid)
    const total=en.reduce((a,e)=>a+e.amount,0)
    const comm=en.reduce((a,e)=>a+getComm(e),0)
    const credit=credTotal(en)
    const pats=db.ip_patients.find(p=>p.id===pid)
    const payments=pats?.payments||[]
    const pkgPaid=payments.reduce((a,e)=>a+e.amount,0)
    const pkgComm=payments.reduce((a,py)=>a+(py.commission||0),0)
    const paid=pats?.is_package?pkgPaid:cashTotal(en)
    const balance=pats?.is_package?0:credit
    return{total,paid,balance,commission:comm+pkgComm,credit,pkgComm}
  }
  if(collectEntry)return(<CollectCreditForm entry={collectEntry} onSave={async row=>{const ok=await actions.editIncome(row);if(ok!==false)setCollectEntry(null)}} onCancel={()=>setCollectEntry(null)}/>)
  if(editIPEntry)return(<EditEntryForm entry={editIPEntry} db={db} onSave={async row=>{const ok=await actions.editIncome(row);if(ok!==false)setEditIPEntry(null)}} onCancel={()=>setEditIPEntry(null)}/>)

  if(ipv==='detail'&&ipid){
    const p=db.ip_patients.find(p=>p.id===ipid)
    if(!p)return<button onClick={()=>setIpv('list')} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer'}}>Back</button>
    const b=getBill(p.id);const ents=db.income.filter(e=>e.patient_id===p.id)
    const patType=p.patient_type||'Regular'
    return(
      <div>
        {prevTab&&<button onClick={()=>{setPrevTab(null);setTab(prevTab);setIpv('list')}} style={{color:'#16a34a',fontSize:13,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,cursor:'pointer',marginBottom:8,display:'block',padding:'6px 14px',fontWeight:600}}>Back to Daily Report</button>}
        <button onClick={()=>{setPrevTab(null);setIpv('list')}} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer',marginBottom:12,display:'block'}}>All patients</button>
        <Card>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div>
              <div style={{fontSize:17,fontWeight:700}}>{p.name}</div>
              <div style={{fontSize:11,color:'#aaa',marginTop:4}}>Admitted: {fmtD(p.admission_date)}{p.discharge_date?' - Discharged: '+fmtD(p.discharge_date):<Pill label="Active" bg="#dcfce7" tx="#16a34a"/>}</div>
              {p.diagnosis&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>Dx: {p.diagnosis}</div>}
              {p.room&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>Room: {p.room}</div>}
              {p.phone&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>Ph: {p.phone}</div>}
              {p.reg_no&&<div style={{fontSize:11,color:'#1d4ed8',marginTop:2,fontWeight:600}}>Reg: {p.reg_no}</div>}
              {p.ref_doctor&&<div style={{fontSize:12,color:'#d97706',fontWeight:700,marginTop:6}}>Ref: Dr. {p.ref_doctor}</div>}
              <div style={{marginTop:8,display:'flex',gap:6,flexWrap:'wrap'}}>
                {patType==='Package'&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#dbeafe',color:'#1d4ed8',fontWeight:700}}>Package</span>}
                {patType==='VC'&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#f0fdf4',color:'#065f46',fontWeight:700}}>Visiting Consultant</span>}
                {patType==='Regular'&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#f0fdf4',color:'#16a34a',fontWeight:700}}>Regular IP</span>}
                {p.custom_commission!=null&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#fff7ed',color:'#b45309',fontWeight:700}}>Custom comm: {p.custom_commission}%</span>}
              </div>
            </div>
            <div style={{display:'flex',gap:8,flexDirection:'column',alignItems:'flex-end'}}>{!p.discharge_date&&<GBtn onClick={()=>actions.dischargePatient(p.id)}>Discharge</GBtn>}<button onClick={()=>setEditIPPatient&&setEditIPPatient({id:p.id,name:p.name,phone:p.phone||'',adm:p.admission_date||'',dx:p.diagnosis||'',room:p.room||'',ref:p.ref_doctor||'',patient_area:p.patient_area||''})} style={{padding:'6px 12px',background:'#f0f9ff',border:'1.5px solid #3b82f6',borderRadius:8,fontSize:12,color:'#1d4ed8',cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>Edit info</button></div>
          </div>
        </Card>
        <MetGrid items={[{label:'Total billed',value:fmt(b.total)},{label:'Cash collected',value:fmt(b.paid),color:'#16a34a'},{label:'Credit (due)',value:fmt(b.credit),color:b.credit>0?'#c2410c':'#111'},{label:'Balance due',value:fmt(b.balance),color:b.balance>0?'#ef4444':'#16a34a'}]}/>
        {/* Charges breakdown */}
        <Card style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:10}}>Charges breakdown</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,marginBottom:8,paddingBottom:6,borderBottom:'1px solid #f0f0f0'}}>
            <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Type</div>
            <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:60}}>Billed</div>
            <div style={{fontSize:9,color:'#ef4444',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:60}}>Comm</div>
            <div style={{fontSize:9,color:'#16a34a',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:60}}>Real</div>
          </div>
          {ITYPES.map(t=>{const te=ents.filter(e=>e.type===t.key);if(!te.length)return null;const inc=te.reduce((a,e)=>a+e.amount,0);const cm=te.reduce((a,e)=>a+getComm(e),0);return(<div key={t.key} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'6px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center'}}><span style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}><TypeTag t={t.key}/>{t.full}</span><span style={{fontSize:12,textAlign:'right',minWidth:60}}>{fmt(inc)}</span><span style={{fontSize:12,textAlign:'right',color:'#ef4444',minWidth:60}}>{cm>0?'-'+fmt(cm):'-'}</span><span style={{fontSize:12,textAlign:'right',color:'#16a34a',fontWeight:600,minWidth:60}}>{fmt(inc-cm)}</span></div>)})}
          {p.is_package&&(p.payments||[]).length>0&&(()=>{const pkgPd=(p.payments||[]).reduce((a,py)=>a+py.amount,0);const pkgCm=(p.payments||[]).reduce((a,py)=>a+(py.commission||0),0);return(<div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'6px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center'}}><span style={{fontSize:12,color:'#1d4ed8'}}>Package received</span><span style={{fontSize:12,textAlign:'right',color:'#1d4ed8',minWidth:60}}>{fmt(pkgPd)}</span><span style={{fontSize:12,textAlign:'right',color:'#ef4444',minWidth:60}}>{pkgCm>0?'-'+fmt(pkgCm):'-'}</span><span style={{fontSize:12,textAlign:'right',color:'#16a34a',fontWeight:600,minWidth:60}}>{fmt(pkgPd-pkgCm)}</span></div>)})()}
          {(()=>{const allInc=ents.reduce((a,e)=>a+e.amount,0);const allComm=ents.reduce((a,e)=>a+getComm(e),0);const pkgPd=(p.payments||[]).reduce((a,py)=>a+py.amount,0);const totDeduct=allComm+b.pkgComm;return(<div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'8px 0 2px',marginTop:2,borderTop:'2px solid #111'}}><span style={{fontSize:13,fontWeight:800}}>Total</span><span style={{fontSize:13,fontWeight:800,textAlign:'right',minWidth:60}}>{fmt(allInc+pkgPd)}</span><span style={{fontSize:13,fontWeight:800,textAlign:'right',color:'#ef4444',minWidth:60}}>{totDeduct>0?'-'+fmt(totDeduct):'-'}</span><span style={{fontSize:13,fontWeight:800,textAlign:'right',color:'#16a34a',minWidth:60}}>{fmt(allInc+pkgPd-totDeduct)}</span></div>)})()}
        </Card>
        {b.credit>0&&(<><SecL>Credit by type</SecL><Card style={{border:'1px solid #fed7aa',background:'#fffbf5'}}>{['ip','ip_r','ip_l'].map(tk=>{const te=ents.filter(e=>e.type===tk&&isCredit(e));if(!te.length)return null;const ta=te.reduce((a,e)=>a+e.amount,0);return(<div key={tk} style={{padding:'8px 0',borderBottom:'1px solid #fef3c7'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{display:'flex',alignItems:'center',gap:6,fontSize:13}}><TypeTag t={tk}/>{ITYPES.find(t=>t.key===tk)?.full}</span>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{color:'#c2410c',fontWeight:700}}>{fmt(ta)}</span>
                  </div>
                </div>
                {te.map(e=>(
                  <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6,paddingTop:6,borderTop:'1px dashed #fef3c7'}}>
                    <span style={{fontSize:12,color:'#92400e'}}>{fmtD(e.date)} - {fmt(e.amount)}{e.notes?' - '+e.notes:''}</span>
                    <button onClick={()=>setCollectEntry(e)} style={{padding:'4px 10px',background:'#16a34a',border:'none',borderRadius:8,fontSize:11,color:'#fff',cursor:'pointer',fontWeight:700}}>Collect</button>
                  </div>
                ))}
              </div>)})}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #fed7aa',fontSize:14,fontWeight:700,color:'#c2410c'}}><span>Total credit</span><span>{fmt(b.credit)}</span></div></Card></>)}
        {p.ref_doctor&&!p.is_package&&ents.length>0&&(<><SecL>Commission breakdown</SecL><Card style={{border:'1px solid #fed7aa',background:'#fffbf5'}}>{['ip','ip_r','ip_l'].map(tk=>{const te=ents.filter(e=>e.type===tk);if(!te.length)return null;const inc=te.reduce((a,e)=>a+e.amount,0);const cm=te.reduce((a,e)=>a+getComm(e),0);return(<Row key={tk} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={tk}/>{ITYPES.find(t=>t.key===tk)?.full}</span>} sub={fmt(inc)+' x comm'} right={<span style={{color:'#d97706',fontWeight:700}}>{fmt(cm)}</span>}/>)})}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #fed7aa',fontSize:14,fontWeight:700,color:'#c2410c'}}><span>Total to pay {p.ref_doctor}</span><span>{fmt(b.commission)}</span></div></Card></>)}
        {!p.discharge_date&&!p.is_package&&(<><SecL>Add charge</SecL><Card>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <FInp label="Date" type="date" value={cF.date} onChange={e=>setCF({...cF,date:e.target.value})}/>
            <FSel label="Type" value={cF.type} onChange={e=>setCF({...cF,type:e.target.value})}>
              <option value="ip">IP Charges</option><option value="ip_r">IP Pharmacy</option><option value="ip_l">IP Lab</option><option value="vc">Visiting Consultant</option>
            </FSel>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <FInp label="Amount (Rs)" type="number" inputMode="numeric" placeholder="0" value={cF.amt} onChange={e=>setCF({...cF,amt:e.target.value})}/>
            <FSel label="Payment" value={cF.pay} onChange={e=>setCF({...cF,pay:e.target.value})}>
              {PMODES.map(m=><option key={m} value={m}>{m==='credit'?'Credit (Due)':m[0].toUpperCase()+m.slice(1)}</option>)}
            </FSel>
          </div>
          {cF.type==='vc'&&<FInp label="Visiting consultant name" type="text" placeholder="e.g. Dr. Rao (Cardiologist)" value={cF.vcName||''} onChange={e=>setCF({...cF,vcName:e.target.value})}/> }
          {cF.type==='vc'&&<FInp label="Consultant fee to pay (Rs)" type="number" inputMode="numeric" placeholder="Amount you pay to consultant" value={cF.vcFee||''} onChange={e=>setCF({...cF,vcFee:e.target.value})}/> }
          {cF.pay==='credit'&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'7px 10px',marginBottom:8,fontSize:13,color:'#92400e'}}>Recording as credit</div>}
          {cF.amt&&p.ref_doctor&&cF.type!=='vc'&&(()=>{const doc=db.ref_doctors.find(d=>d.name===p.ref_doctor);const pctKey={ip:'ip_pct',ip_r:'ip_r_pct',ip_l:'ip_l_pct'}[cF.type];const rate=doc&&pctKey?doc[pctKey]/100:(p.custom_commission!=null?p.custom_commission/100:(COMM[cF.type]||0));const comm=parseFloat(cF.amt||0)*rate;const typeLabel={'ip':'IP Charges','ip_r':'IP Pharmacy','ip_l':'IP Lab'}[cF.type]||cF.type;return(<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#92400e'}}><div style={{fontWeight:600,marginBottom:2}}>Commission to Dr. {p.ref_doctor}</div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:11,color:'#b45309'}}>{typeLabel}: {Math.round(rate*100)}%</span><span style={{fontSize:15,fontWeight:700,color:'#c2410c'}}>{fmt(comm)}</span></div></div>)})()}
          {cF.type==='vc'&&cF.amt&&cF.vcFee&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'7px 10px',marginBottom:8,fontSize:13,color:'#065f46'}}>Your income: <strong>{fmt(parseFloat(cF.amt||0)-parseFloat(cF.vcFee||0))}</strong></div>}
          <FInp label="Notes" type="text" placeholder="e.g. Day 3 medicines" value={cF.notes} onChange={e=>setCF({...cF,notes:e.target.value})}/>
          <PBtn onClick={async()=>{const amt=parseFloat(cF.amt);if(!amt||amt<=0){alert('Enter amount');return};const isVC=cF.type==='vc';const ok=await actions.addIncome({id:uid(),date:cF.date,type:cF.type,amount:amt,patient_id:p.id,patient_name:p.name,payment:cF.pay,ref_doctor:isVC?(cF.vcName||''):(p.ref_doctor||''),notes:cF.notes,custom_commission:(()=>{const doc=db.ref_doctors.find(d=>d.name===p.ref_doctor);const pctKey={ip:'ip_pct',ip_r:'ip_r_pct',ip_l:'ip_l_pct'}[cF.type];const isVC=cF.type==='vc';if(isVC)return null;if(doc&&pctKey)return doc[pctKey];if(p.custom_commission!=null)return p.custom_commission;return null})(),consultant_fee:isVC?parseFloat(cF.vcFee||0):0,reg_no:p.reg_no||''});if(ok!==false)setCF({...cF,amt:'',notes:'',vcName:'',vcFee:''})}}>Add charge</PBtn>
        </Card></>)}
        {!p.discharge_date&&p.is_package&&(<><SecL>Package payment received</SecL><Card style={{border:'1px solid #d1fae5',background:'#f0fdf4'}}>
          <div style={{fontSize:11,color:'#065f46',fontWeight:600,marginBottom:10}}>Package payment - commission: {p.custom_commission!=null?p.custom_commission+'%':'40% (default)'}. Referral commission auto-calculated.</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <FInp label="Date" type="date" value={pyF.date} onChange={e=>setPyF({...pyF,date:e.target.value})}/>
            <FInp label="Package amount (Rs)" type="number" inputMode="numeric" placeholder="0" value={pyF.amt} onChange={e=>setPyF({...pyF,amt:e.target.value})}/>
          </div>
          {pyF.amt&&p.ref_doctor&&(()=>{const pkgRate=p.custom_commission!=null?p.custom_commission/100:0.40;const pkgComm=parseFloat(pyF.amt||0)*pkgRate;const pkgNet=parseFloat(pyF.amt||0)-pkgComm;return(<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#92400e'}}>Commission to Dr. {p.ref_doctor}: <strong>{fmt(pkgComm)}</strong> ({Math.round(pkgRate*100)}%) - Net: <strong style={{color:'#16a34a'}}>{fmt(pkgNet)}</strong></div>)})()}
          <FSel label="Payment mode" value={pyF.pay} onChange={e=>setPyF({...pyF,pay:e.target.value})}>
            {PMODES.map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}
          </FSel>
          <PBtn style={{background:'#16a34a'}} onClick={async()=>{const amt=parseFloat(pyF.amt);if(!amt||amt<=0){alert('Enter amount');return};const pkgRate=p.custom_commission!=null?p.custom_commission/100:0.40;const comm=p.ref_doctor?Math.round(amt*pkgRate):0;await actions.addPayment(p.id,{id:uid(),date:pyF.date,amount:amt,payment:pyF.pay,commission:comm,ref_doctor:p.ref_doctor||''});setPyF({...pyF,amt:''})}}>Save package payment</PBtn>
        </Card></>)}
        {!p.is_package&&ITYPES.filter(t=>['ip','ip_r','ip_l','vc'].includes(t.key)).map(t=>{const te=ents.filter(e=>e.type===t.key);if(!te.length)return null;return(<div key={t.key}><SecL>{t.full} - {fmt(te.reduce((a,e)=>a+e.amount,0))}</SecL><Card>{te.map(e=>{const cr=isCredit(e);return(<div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}><div style={{flex:1}}><div style={{fontSize:13,fontWeight:500,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>{fmtD(e.date)}{cr&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#fed7aa',color:'#92400e',fontWeight:700}}>CREDIT</span>}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>{cr?'Credit':e.payment}{e.notes?' - '+e.notes:''}{getComm(e)>0?' - Comm: '+fmt(getComm(e)):''}</div></div><div style={{display:'flex',alignItems:'center',gap:6}}><span style={{color:cr?'#c2410c':'#16a34a',fontWeight:600,fontSize:13}}>{fmt(e.amount)}</span>{cr&&<button onClick={()=>setCollectEntry(e)} style={{padding:'4px 10px',background:'#16a34a',border:'none',borderRadius:8,fontSize:11,color:'#fff',cursor:'pointer',fontWeight:700}}>Collect</button>}<button onClick={()=>setEditIPEntry(e)} style={{padding:'5px 12px',background:'#f0f9ff',border:'1.5px solid #3b82f6',borderRadius:8,fontSize:12,color:'#1d4ed8',cursor:'pointer',fontWeight:600}}>Edit</button><DBtn onClick={()=>actions.delIncome(e.id)}>X</DBtn></div></div>)})}</Card></div>)})}
        {p.payments&&p.payments.length>0&&(<><SecL>Package payments received</SecL><Card>{p.payments.map(py=>(<div key={py.id} style={{padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{fontSize:13,fontWeight:500}}>{fmtD(py.date)} - {py.payment}</div>{py.commission>0&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>Commission: {fmt(py.commission)} - Net: {fmt(py.amount-py.commission)}</div>}</div><div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}><span style={{color:'#16a34a',fontWeight:700,fontSize:14}}>{fmt(py.amount)}</span><DBtn onClick={()=>{if(window.confirm('Delete this payment?'))actions.deletePayment(p.id,py.id)}}>Delete</DBtn></div></div></div>))}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #f0f0f0',fontSize:13,fontWeight:700}}><span>Total received</span><span style={{color:'#16a34a'}}>{fmt((p.payments||[]).reduce((a,py)=>a+py.amount,0))}</span></div></Card></>)}
        <div style={{marginTop:24,paddingTop:16,borderTop:'2px solid #fecaca'}}><button style={{width:'100%',padding:'12px',background:'#fef2f2',color:'#dc2626',border:'2px solid #fecaca',borderRadius:12,fontSize:14,fontWeight:700,cursor:'pointer'}} onClick={()=>{if(window.confirm('Delete '+p.name+' and ALL their records?')){actions.deletePatient(p.id);setIpv('list')}}}>Delete this patient and all records</button></div>
    </div>
    )
  }
  const active=db.ip_patients.filter(p=>!p.discharge_date)
  const disc=db.ip_patients.filter(p=>p.discharge_date)
  const allIP=[...active,...disc.slice().reverse()]
  const qb=pid=>{const en=db.income.filter(e=>e.patient_id===pid);const t=en.reduce((a,e)=>a+e.amount,0);const p=db.ip_patients.find(pt=>pt.id===pid);const cr=credTotal(en);const balance=p?.is_package?0:cr;return{total:t,balance,credit:cr}}
  const ipRefDocs=[...new Set(db.ip_patients.filter(p=>p.ref_doctor).map(p=>p.ref_doctor))].sort()
  const IPRow=({p})=>{const b=qb(p.id);const pt=p.patient_type||'Regular';const disc2=!!p.discharge_date;return(<Row key={p.id} onClick={()=>{setIpid(p.id);setIpv('detail')}} left={<span style={{fontSize:14}}>{p.name}{pt==='Package'&&<Pill label="Pkg" bg="#dbeafe" tx="#1d4ed8"/>}{disc2&&<Pill label="Discharged"/>}{p.ref_doctor&&<Pill label={'Ref: '+p.ref_doctor} bg="#fff7ed" tx="#b45309"/>}</span>} sub={fmtD(p.admission_date)+(disc2?' to '+fmtD(p.discharge_date):' Active')+(p.reg_no?' - Reg: '+p.reg_no:'')+(p.phone?' - '+p.phone:'')} right={<div style={{textAlign:'right'}}><div style={{fontWeight:600}}>{fmt(b.total)}</div>{b.credit>0&&<div style={{fontSize:11,color:'#c2410c'}}>credit: {fmt(b.credit)}</div>}</div>}/>)}
  const IPVIEWS=[{k:'all',l:'All'},{k:'active',l:'Active'},{k:'discharged',l:'Discharged'},{k:'date',l:'By Month'},{k:'ref',l:'By Ref Doctor'}]
  if(ipv==='add')return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <span style={{fontSize:16,fontWeight:700}}>Admit new patient</span>
        <GBtn onClick={()=>setIpv('list')}>Cancel</GBtn>
      </div>
      <Card>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FInp label="Patient name *" type="text" placeholder="Full name" value={pF.name} onChange={e=>setPF({...pF,name:e.target.value,linkedRegNo:''})}/>
          {pF.name.trim().length>=2&&(()=>{
            const opInc=db.income.filter(e=>!['ip','ip_r','ip_l'].includes(e.type)&&e.patient_name&&e.patient_name.toLowerCase().includes(pF.name.toLowerCase()))
            const opNames=[...new Set(opInc.map(e=>e.patient_name))].slice(0,4)
            if(!opNames.length)return null
            return(<div style={{background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'10px 12px',marginBottom:10}}>
              <div style={{fontSize:10,color:'#1d4ed8',fontWeight:700,textTransform:'uppercase',marginBottom:8}}>Existing OP patients with similar name - tap to link</div>
              {opNames.map(name=>{const entries=opInc.filter(e=>e.patient_name===name);const reg=entries.find(e=>e.reg_no)?.reg_no||'';return(<button key={name} onClick={()=>setPF({...pF,name,linkedRegNo:reg,phone:entries.find(e=>e.patient_phone)?.patient_phone||pF.phone})} style={{display:'block',width:'100%',textAlign:'left',padding:'8px 10px',marginBottom:4,background:pF.name===name?'#1d4ed8':'#fff',color:pF.name===name?'#fff':'#111',border:'1px solid #bfdbfe',borderRadius:8,cursor:'pointer',fontSize:13}}><strong>{name}</strong>{reg&&<span style={{fontSize:11,marginLeft:8,opacity:.7}}>Reg: {reg}</span>}<span style={{fontSize:11,marginLeft:8,opacity:.7}}>{entries.length} OP visit{entries.length!==1?'s':''}</span></button>)})}
              {pF.linkedRegNo&&<div style={{fontSize:12,color:'#1d4ed8',fontWeight:600,marginTop:6}}>Will use same Reg No: {pF.linkedRegNo}</div>}
            </div>)
          })()}
          <FInp label="Phone (optional)" type="tel" placeholder="9999999999" value={pF.phone||''} onChange={e=>setPF({...pF,phone:e.target.value})}/>
          <FInp label="Patient area (optional)" type="text" placeholder="e.g. Kukatpally, Miyapur, KPHB" value={pF.patient_area||''} onChange={e=>setPF({...pF,patient_area:e.target.value})}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FInp label="Admission date" type="date" value={pF.adm} onChange={e=>setPF({...pF,adm:e.target.value})}/>
          <FInp label="Ward / Room" type="text" placeholder="Ward 2" value={pF.room} onChange={e=>setPF({...pF,room:e.target.value})}/>
        </div>
        <FInp label="Diagnosis" type="text" placeholder="Condition" value={pF.dx} onChange={e=>setPF({...pF,dx:e.target.value})}/>
        <div style={{marginBottom:12}}>
          <label style={{display:'block',fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8,fontWeight:700}}>Patient type</label>
          <div style={{display:'flex',gap:0,border:'1px solid #e5e7eb',borderRadius:12,overflow:'hidden'}}>
            {IP_PAT_TYPES.filter(t=>t!=='VC').map((t,i)=>(
              <button key={t} onClick={()=>setPF({...pF,patient_type:t,is_package:t==='Package'})} style={{flex:1,padding:'10px 4px',border:'none',borderLeft:i>0?'1px solid #e5e7eb':'none',background:pF.patient_type===t?'#111':'#fff',color:pF.patient_type===t?'#fff':'#888',fontWeight:600,fontSize:12,cursor:'pointer'}}>
                {t}
              </button>
            ))}
          </div>
          {pF.patient_type==='Package'&&<div style={{fontSize:11,color:'#1d4ed8',marginTop:6}}>Package - only package payment recorded, 40% commission auto-applied</div>}
          {pF.patient_type==='VC'&&<div style={{fontSize:11,color:'#065f46',marginTop:6}}>Visiting Consultant - collect from patient, pay consultant their share</div>}
        </div>
        <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:12,padding:'12px 14px',marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:'#92400e',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>Referral details</div>
          <FSel label="Referring doctor (select from Ref Doctors)" value={pF.ref} onChange={e=>{setPF({...pF,ref:e.target.value,custom_commission:''})}}>
            <option value="">- No referral / Self patient -</option>
            {db.ref_doctors.map(d=><option key={d.id} value={d.name}>Dr. {d.name}{d.area?' ('+d.area+')':''}</option>)}
          </FSel>
          {pF.ref&&(()=>{const doc=db.ref_doctors.find(d=>d.name===pF.ref);if(!doc)return null;return(<div>
            {doc.area&&<div style={{display:'flex',alignItems:'center',gap:8,marginBottom:8}}>
              <span style={{background:'#eff6ff',border:'1px solid #bfdbfe',color:'#1d4ed8',fontSize:12,fontWeight:700,padding:'5px 14px',borderRadius:100}}>Area: {doc.area}</span>
            </div>}
            <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:12,color:'#92400e'}}>
              <strong>Dr. {doc.name}</strong> commission rates: IP {doc.ip_pct}%  IP-Pharmacy {doc.ip_r_pct}%  IP-Lab {doc.ip_l_pct}%{pF.patient_type==='Package'?'  Package '+doc.ip_pct+'%':''}
            </div>
          </div>)})()}
        </div>
        <PBtn onClick={async()=>{if(!pF.name.trim()){alert('Name required');return};const rn=pF.linkedRegNo||(await genRegNo());const ok=await actions.admitPatient({id:uid(),name:pF.name,phone:pF.phone||'',admission_date:pF.adm,discharge_date:null,diagnosis:pF.dx,room:pF.room,ref_doctor:pF.ref.trim(),is_package:pF.patient_type==='Package',patient_type:pF.patient_type,custom_commission:pF.custom_commission!==''?parseFloat(pF.custom_commission):null,payments:[],reg_no:rn,patient_area:pF.patient_area?.trim()||''});if(ok!==false){setIpv('list');setPF({name:'',adm:todayStr(),dx:'',room:'',ref:'',is_package:false,phone:'',patient_type:'Regular',custom_commission:'',linkedRegNo:'',patient_area:''})}}}>Admit patient</PBtn>
      </Card>
    </div>
  )
  return(
    <div>
      <PBtn onClick={()=>setIpv('add')} style={{marginBottom:12}}>+ Admit new patient</PBtn>
      <div style={{display:'flex',gap:6,marginBottom:12,overflowX:'auto',paddingBottom:2}}>
        {IPVIEWS.map(v=>(<button key={v.k} onClick={()=>setIpView(v.k)} style={{flexShrink:0,padding:'7px 14px',borderRadius:20,border:ipView===v.k?'none':'1.5px solid #e2e8f0',background:ipView===v.k?'linear-gradient(135deg,#16a34a,#22c55e)':'#fff',color:ipView===v.k?'#fff':'#64748b',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:ipView===v.k?'0 4px 12px rgba(22,163,74,0.3)':'none',transition:'all .15s'}}>{v.l}</button>))}
      </div>

      {(ipView==='all'||ipView==='active'||ipView==='discharged')&&(<>
        <div style={{position:'relative',marginBottom:12}}>
          <input style={{...S.inp,paddingLeft:36}} placeholder="Search by name, reg no, phone..." value={ipSearch} onChange={e=>setIpSearch(e.target.value)} autoCorrect="off" autoCapitalize="none"/>
          <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:16,color:'#aaa'}}></span>
          {ipSearch&&<button onClick={()=>setIpSearch('')} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',fontSize:16,color:'#aaa',cursor:'pointer'}}></button>}
        </div>
        {(()=>{
          const pool=ipView==='active'?active:ipView==='discharged'?disc.slice().reverse():allIP
          const filtered=ipSearch.trim()?pool.filter(p=>p.name.toLowerCase().includes(ipSearch.toLowerCase())||p.reg_no?.toLowerCase().includes(ipSearch.toLowerCase())||p.phone?.includes(ipSearch)):pool
          if(!filtered.length)return <div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>{ipSearch?'No results for "'+ipSearch+'"':'No patients yet'}</div>
          return(<>
            {ipSearch&&<div style={{fontSize:12,color:'#888',marginBottom:8}}>{filtered.length} result{filtered.length!==1?'s':''} for "{ipSearch}"</div>}
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
              {[{l:'Active',v:ipView==='discharged'?0:filtered.filter(p=>!p.discharge_date).length,c:'#16a34a'},{l:'Discharged',v:ipView==='active'?0:filtered.filter(p=>p.discharge_date).length,c:'#6b7280'}].map((m,i)=>(<div key={i} style={{background:'#f9f9f9',borderRadius:10,padding:'8px 12px'}}><div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>{m.l}</div><div style={{fontSize:20,fontWeight:700,color:m.c}}>{m.v}</div></div>))}
            </div>
            <Card>{filtered.map(p=><IPRow key={p.id} p={p}/>)}</Card>
          </>)
        })()}
      </>)}

      {ipView==='date'&&(<>
        <input style={{...S.inp,marginBottom:12}} type="month" value={ipMonth} onChange={e=>setIpMonth(e.target.value)}/>
        {(()=>{
          const [yr,mo]=ipMonth.split('-')
          const monthStart=ipMonth+'-01'
          const monthEnd=ipMonth+'-31'
          const pool=db.ip_patients.filter(p=>{
            const adm=p.admission_date||''
            const dis=p.discharge_date||'9999-12-31'
            return adm.startsWith(ipMonth)||(adm<=monthEnd&&dis>=monthStart)
          }).sort((a,b)=>b.admission_date?.localeCompare(a.admission_date||'')||0)
          if(!pool.length)return <div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No patients for {ipMonth}</div>
          const totalBilled=pool.reduce((a,p)=>a+qb(p.id).total,0)
          return(<>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
              <div style={{background:'#dcfce7',borderRadius:10,padding:'10px 14px'}}><div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Patients</div><div style={{fontSize:22,fontWeight:700,color:'#15803d'}}>{pool.length}</div></div>
              <div style={{background:'#f0fdf4',borderRadius:10,padding:'10px 14px'}}><div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Total billed</div><div style={{fontSize:22,fontWeight:700,color:'#15803d'}}>{fmt(totalBilled)}</div></div>
            </div>
            <Card>{pool.map(p=><IPRow key={p.id} p={p}/>)}</Card>
          </>)
        })()}
      </>)}

      {ipView==='ref'&&(<>
        <FSel label="Select referral doctor" value={ipRefFilter} onChange={e=>setIpRefFilter(e.target.value)}>
          <option value="">- Select doctor -</option>
          {ipRefDocs.map(d=><option key={d} value={d}>Dr. {d}</option>)}
        </FSel>
        {!ipRefFilter&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>{ipRefDocs.length?'Select a referral doctor above':'No referral doctors yet'}</div>}
        {ipRefFilter&&(()=>{
          const pool=db.ip_patients.filter(p=>p.ref_doctor===ipRefFilter).sort((a,b)=>b.admission_date?.localeCompare(a.admission_date||'')||0)
          const totalBilled=pool.reduce((a,p)=>a+qb(p.id).total,0)
          const totalComm=db.income.filter(e=>pool.some(p=>p.id===e.patient_id)).reduce((a,e)=>a+getComm(e),0)
          return(<>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
              <div style={{background:'#fff7ed',borderRadius:10,padding:'10px'}}><div style={{fontSize:9,color:'#92400e',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Patients</div><div style={{fontSize:20,fontWeight:700,color:'#c2410c'}}>{pool.length}</div></div>
              <div style={{background:'#f0fdf4',borderRadius:10,padding:'10px'}}><div style={{fontSize:9,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Total</div><div style={{fontSize:20,fontWeight:700,color:'#15803d'}}>{fmt(totalBilled)}</div></div>
              <div style={{background:'#fff7ed',borderRadius:10,padding:'10px'}}><div style={{fontSize:9,color:'#b45309',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Commission</div><div style={{fontSize:20,fontWeight:700,color:'#d97706'}}>{fmt(totalComm)}</div></div>
            </div>
            <Card>{pool.map(p=><IPRow key={p.id} p={p}/>)}</Card>
          </>)
        })()}
      </>)}
    </div>
  )
}

/*  OP PATIENTS TAB  */
const OPTab=({db,actions,opSearch,setOpSearch,opPrevTab,setOpPrevTab,setTab})=>{
  const [selPat,setSelPat]=useState(null)
  const [payDoc,setPayDoc]=useState(null)
  const [editEntry,setEditEntry]=useState(null)
  const [collectEntry,setCollectEntry]=useState(null)
  const [search,setSearch]=useState(opSearch||'')
  // Track if we came from daily report (local copy survives re-renders)
  const [fromReport,setFromReport]=useState(!!opPrevTab)
  const [view,setView]=useState('patients')
  const [filterDate,setFilterDate]=useState(todayStr().slice(0,7))
  const [filterRef,setFilterRef]=useState('')
  const [filterCon,setFilterCon]=useState('')
  const opIncome=db.income.filter(e=>!['ip','ip_r','ip_l'].includes(e.type)&&e.patient_name&&!db.ip_patients.some(p=>p.id===e.patient_id))
  const byPat={}
  opIncome.forEach(e=>{const k=(e.patient_name||'').trim().toLowerCase();if(!byPat[k])byPat[k]={name:e.patient_name,phone:e.patient_phone||'',reg_no:e.reg_no||'',entries:[],total:0,totalComm:0,totalCredit:0,lastDate:''};byPat[k].entries.push(e);byPat[k].total+=e.amount;byPat[k].totalComm+=getComm(e);byPat[k].totalCredit+=isCredit(e)?e.amount:0;if(e.date>byPat[k].lastDate)byPat[k].lastDate=e.date})
  const allPatients=Object.values(byPat).sort((a,b)=>b.lastDate.localeCompare(a.lastDate))
  const patients=search.trim()?allPatients.filter(p=>p.name.toLowerCase().includes(search.toLowerCase())||p.reg_no.toLowerCase().includes(search.toLowerCase())):allPatients
  const allPaid=db.expenses.filter(e=>e.category==='ref_paid')
  // Auto-open patient detail when navigated from daily report
  useEffect(()=>{
    if(opSearch&&opSearch.trim()){
      const k=opSearch.trim().toLowerCase()
      if(byPat[k]){setSelPat(k);setFromReport(true)}
    }
  },[opSearch])
  if(collectEntry)return(<CollectCreditForm entry={collectEntry} onSave={async row=>{const ok=await actions.editIncome(row);if(ok!==false)setCollectEntry(null)}} onCancel={()=>setCollectEntry(null)}/>)
  if(editEntry)return(<EditEntryForm entry={editEntry} db={db} onSave={async row=>{const ok=await actions.editIncome(row);if(ok!==false)setEditEntry(null)}} onCancel={()=>setEditEntry(null)}/>)
  if(selPat){
    const pat=byPat[selPat?.trim().toLowerCase()]||byPat[selPat];if(!pat)return<button onClick={()=>setSelPat(null)} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer'}}>Back</button>
    const ents=pat.entries
    const totalInc=ents.reduce((a,e)=>a+e.amount,0);const totalComm=ents.reduce((a,e)=>a+getComm(e),0);const totalCredit=credTotal(ents);const totalCash=cashTotal(ents)
    const byType={};ents.forEach(e=>{if(!byType[e.type])byType[e.type]={inc:0,comm:0};byType[e.type].inc+=e.amount;byType[e.type].comm+=getComm(e)})
    const refDocs={};ents.forEach(e=>{const doc=e.ref_doctor;if(!doc||!doc.trim())return;if(!refDocs[doc])refDocs[doc]={name:doc,income:0,commission:0};refDocs[doc].income+=e.amount;refDocs[doc].commission+=getComm(e)})
    const refs=Object.values(refDocs)
    return(
      <div>
        {fromReport&&<button onClick={()=>{setFromReport(false);setOpPrevTab&&setOpPrevTab(null);setTab&&setTab('rep');setSelPat(null)}} style={{color:'#16a34a',fontSize:13,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,cursor:'pointer',marginBottom:8,display:'block',padding:'6px 14px',fontWeight:600}}>Back to Daily Report</button>}
        <button onClick={()=>{setFromReport(false);if(setOpPrevTab)setOpPrevTab(null);setSelPat(null);setPayDoc(null)}} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer',marginBottom:12,display:'block'}}>All OP patients</button>
        <Card>
          <div style={{fontSize:17,fontWeight:700}}>{pat.name}</div>
          {pat.phone&&<div style={{fontSize:12,color:'#aaa',marginTop:2}}>Ph: {pat.phone}</div>}
          {pat.reg_no&&<div style={{fontSize:12,color:'#1d4ed8',fontWeight:700,marginTop:2}}>Reg: {pat.reg_no}</div>}
          <div style={{fontSize:12,color:'#aaa',marginTop:4}}>{ents.length} visit{ents.length!==1?'s':''}</div>
        </Card>
        <MetGrid items={[{label:'Total billed',value:fmt(totalInc),color:'#111'},{label:'Cash collected',value:fmt(totalCash),color:'#16a34a'},{label:'Credit (due)',value:fmt(totalCredit),color:totalCredit>0?'#c2410c':'#aaa'},{label:'Real income',value:fmt(totalInc-totalComm),color:'#16a34a'}]}/>
        <SecL>Charges breakdown</SecL>
        <Card>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,marginBottom:8,paddingBottom:6,borderBottom:'1px solid #f0f0f0'}}>
            <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Type</div>
            <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:60}}>Billed</div>
            <div style={{fontSize:9,color:'#ef4444',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:60}}>Ref comm</div>
            <div style={{fontSize:9,color:'#16a34a',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:60}}>Real</div>
          </div>
          {Object.entries(byType).map(([tk,v])=>{const it=ITYPES.find(t=>t.key===tk);return(<div key={tk} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'7px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center'}}><span style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}><TypeTag t={tk}/>{it?.full||tk}</span><span style={{fontSize:12,textAlign:'right',minWidth:60}}>{fmt(v.inc)}</span><span style={{fontSize:12,textAlign:'right',color:'#ef4444',minWidth:60}}>{v.comm>0?'-'+fmt(v.comm):'-'}</span><span style={{fontSize:12,textAlign:'right',color:'#16a34a',fontWeight:600,minWidth:60}}>{fmt(v.inc-v.comm)}</span></div>)})}
          <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'8px 0 0',marginTop:4,borderTop:'2px solid #111'}}><span style={{fontSize:13,fontWeight:800}}>Total</span><span style={{fontSize:13,fontWeight:800,textAlign:'right',minWidth:60}}>{fmt(totalInc)}</span><span style={{fontSize:13,fontWeight:800,textAlign:'right',color:'#ef4444',minWidth:60}}>{totalComm>0?'-'+fmt(totalComm):'-'}</span><span style={{fontSize:13,fontWeight:800,textAlign:'right',color:'#16a34a',minWidth:60}}>{fmt(totalInc-totalComm)}</span></div>
        </Card>
        {refs.length>0&&(<><SecL>Referral commission</SecL>{refs.map(doc=>{const paid=allPaid.filter(e=>e.description===doc.name).reduce((a,e)=>a+e.amount,0);const balance=doc.commission-paid;const isOpen=payDoc===doc.name;return(<Card key={doc.name} style={{border:balance>0?'1px solid #fed7aa':'1px solid #f0f0f0'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}><div><div style={{fontSize:15,fontWeight:700}}>Dr. {doc.name}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>Income: {fmt(doc.income)}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:11,color:'#d97706',fontWeight:600}}>Commission</div><div style={{fontSize:20,fontWeight:700,color:'#c2410c'}}>{fmt(doc.commission)}</div></div></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,padding:'8px 0',borderTop:'1px solid #f5f5f5',borderBottom:'1px solid #f5f5f5',marginBottom:10}}><div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Earned</div><div style={{fontSize:13,fontWeight:700,color:'#c2410c'}}>{fmt(doc.commission)}</div></div><div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Paid</div><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(paid)}</div></div><div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Balance</div><div style={{fontSize:13,fontWeight:700,color:balance>0?'#ef4444':'#16a34a'}}>{fmt(balance)}</div></div></div>{balance>0&&(!isOpen?<button onClick={()=>setPayDoc(doc.name)} style={{width:'100%',padding:'10px',background:'#111',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Record commission payment</button>:<CommPayForm docName={doc.name} balance={balance} onCancel={()=>setPayDoc(null)} onSave={async(amt,date,pay)=>{await actions.addExpense({id:uid(),date,category:'ref_paid',amount:amt,description:doc.name,payment:pay,is_monthly:false});setPayDoc(null)}}/>)}{balance<=0&&<div style={{textAlign:'center',fontSize:12,color:'#16a34a',fontWeight:600}}>Fully paid</div>}</Card>)})}</>)}
        <SecL>All visits</SecL>
        <Card>
          {ents.slice().sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(e=>{const cr=isCredit(e);const comm=getComm(e);return(<div key={e.id} style={{padding:'9px 0',borderBottom:'1px solid #f5f5f5'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}><TypeTag t={e.type}/>{e.op_type&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#f0f0f0',color:'#555',fontWeight:600}}>{e.op_type}</span>}<span style={{fontSize:12,color:'#555'}}>{fmtD(e.date)}</span>{cr&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#fed7aa',color:'#92400e',fontWeight:700}}>CREDIT</span>}</div>{e.ref_doctor&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>Ref: {e.ref_doctor}{comm>0?' - Commission: '+fmt(comm):''}</div>}</div><div style={{display:'flex',alignItems:'center',gap:6,marginLeft:8}}>{cr&&<button onClick={()=>setCollectEntry(e)} style={{padding:'4px 10px',background:'#16a34a',border:'none',borderRadius:8,fontSize:11,color:'#fff',cursor:'pointer',fontWeight:700}}>Collect</button>}<button onClick={()=>setEditEntry(e)} style={{padding:'5px 12px',background:'#f0f9ff',border:'1.5px solid #3b82f6',borderRadius:8,fontSize:12,color:'#1d4ed8',cursor:'pointer',fontWeight:600}}>Edit</button><span style={{fontSize:13,fontWeight:600,color:cr?'#c2410c':'#16a34a'}}>{fmt(e.amount)}</span></div></div></div>)})}
        </Card>
    </div>
    )
  }
  // All referral doctors and consultants who appear in OP income
  const opRefDocs=[...new Set(opIncome.filter(e=>e.ref_doctor).map(e=>e.ref_doctor))].sort()
  const opConsultants=[...new Set(opIncome.filter(e=>e.consultant_name).map(e=>e.consultant_name))].sort()
  const PatCard=({pat})=>(<Card style={{cursor:'pointer',marginBottom:10}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}} onClick={()=>setSelPat((pat.name||'').trim().toLowerCase())}><div><div style={{fontSize:14,fontWeight:700,color:'#111'}}>{pat.name}</div>{pat.phone&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>Ph: {pat.phone}</div>}{pat.reg_no&&<div style={{fontSize:11,color:'#1d4ed8',fontWeight:600}}>Reg: {pat.reg_no}</div>}<div style={{fontSize:11,color:'#aaa',marginTop:2}}>{pat.entries.length} visit{pat.entries.length!==1?'s':''} - Last: {fmtD(pat.lastDate)}</div>{pat.totalComm>0&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>Ref comm: {fmt(pat.totalComm)}</div>}{pat.totalCredit>0&&<div style={{fontSize:11,color:'#c2410c',marginTop:2}}>Credit: {fmt(pat.totalCredit)}</div>}</div><div style={{textAlign:'right'}}><div style={{fontSize:15,fontWeight:700}}>{fmt(pat.total)}</div><div style={{fontSize:12,color:'#16a34a',fontWeight:600}}>Real: {fmt(pat.total-pat.totalComm)}</div><span style={{fontSize:16,color:'#aaa'}}></span></div></div></Card>)
  const VIEWS=[{k:'patients',l:'All Patients'},{k:'date',l:'By Date'},{k:'ref',l:'By Ref Doctor'},{k:'con',l:'By Consultant'}]
  return(
    <div>
      <div style={{background:'linear-gradient(135deg,#1d4ed8 0%,#1e40af 100%)',borderRadius:16,padding:'16px',marginBottom:12,color:'#fff'}}>
        <div style={{fontSize:12,color:'#bfdbfe',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>OP patients</div>
        <div style={{fontSize:32,fontWeight:800}}>{allPatients.length}</div>
        <div style={{fontSize:12,color:'#bfdbfe',marginTop:4}}>Total: {fmt(allPatients.reduce((a,p)=>a+p.total,0))} - Ref comm: {fmt(allPatients.reduce((a,p)=>a+p.totalComm,0))}</div>
      </div>
      <div style={{display:'flex',gap:6,marginBottom:12,overflowX:'auto',paddingBottom:2}}>
        {VIEWS.map(v=>(<button key={v.k} onClick={()=>setView(v.k)} style={{flexShrink:0,padding:'7px 14px',borderRadius:20,border:view===v.k?'none':'1.5px solid #e2e8f0',background:view===v.k?'linear-gradient(135deg,#4f46e5,#7c3aed)':'#fff',color:view===v.k?'#fff':'#64748b',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:view===v.k?'0 4px 12px rgba(79,70,229,0.3)':'none',transition:'all .15s'}}>{v.l}</button>))}
      </div>

      {view==='patients'&&(<>
        <div style={{position:'relative',marginBottom:12}}>
          <input style={{...S.inp,paddingLeft:36}} placeholder="Search by name or reg no..." value={search} onChange={e=>setSearch(e.target.value)} autoCorrect="off" autoCapitalize="none"/>
          <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:16,color:'#aaa'}}></span>
          {search&&<button onClick={()=>setSearch('')} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',fontSize:16,color:'#aaa',cursor:'pointer'}}></button>}
        </div>
        {search&&<div style={{fontSize:12,color:'#888',marginBottom:8}}>{patients.length} result{patients.length!==1?'s':''} for "{search}"</div>}
        {patients.length===0&&<div style={{textAlign:'center',padding:'40px 0',color:'#ccc',fontSize:13}}>No OP patients yet.</div>}
        {patients.map(pat=><PatCard key={pat.name} pat={pat}/>)}
      </>)}

      {view==='date'&&(()=>{
        const dateIncome=opIncome.filter(e=>e.date?.startsWith(filterDate))
        const datePats={}
        dateIncome.forEach(e=>{const k=e.patient_name;if(!datePats[k])datePats[k]={name:k,phone:e.patient_phone||'',reg_no:e.reg_no||'',entries:[],total:0,totalComm:0,totalCredit:0,lastDate:''};datePats[k].entries.push(e);datePats[k].total+=e.amount;datePats[k].totalComm+=getComm(e);datePats[k].totalCredit+=isCredit(e)?e.amount:0;if(e.date>datePats[k].lastDate)datePats[k].lastDate=e.date})
        const datePatList=Object.values(datePats).sort((a,b)=>b.lastDate.localeCompare(a.lastDate))
        return(<>
          <input style={{...S.inp,marginBottom:12}} type="month" value={filterDate} onChange={e=>setFilterDate(e.target.value)}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
            <div style={{background:'#dbeafe',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#1d4ed8',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Patients</div><div style={{fontSize:22,fontWeight:700,color:'#1d4ed8'}}>{datePatList.length}</div></div>
            <div style={{background:'#f0fdf4',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Total</div><div style={{fontSize:22,fontWeight:700,color:'#15803d'}}>{fmt(dateIncome.reduce((a,e)=>a+e.amount,0))}</div></div>
          </div>
          {datePatList.length===0&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No OP patients in this month</div>}
          {datePatList.map(pat=><PatCard key={pat.name} pat={pat}/>)}
        </>)
      })()}

      {view==='ref'&&(()=>{
        const refList=opRefDocs.length?opRefDocs:['(none)']
        return(<>
          <FSel label="Select referral doctor" value={filterRef} onChange={e=>setFilterRef(e.target.value)}>
            <option value="">- Select doctor -</option>
            {opRefDocs.map(d=><option key={d} value={d}>Dr. {d}</option>)}
          </FSel>
          {!filterRef&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>{opRefDocs.length?'Select a referral doctor above':'No referral data yet'}</div>}
          {filterRef&&(()=>{
            const refIncome=opIncome.filter(e=>e.ref_doctor===filterRef)
            const refPats={}
            refIncome.forEach(e=>{const k=e.patient_name;if(!refPats[k])refPats[k]={name:k,phone:e.patient_phone||'',reg_no:e.reg_no||'',entries:[],total:0,totalComm:0,totalCredit:0,lastDate:''};refPats[k].entries.push(e);refPats[k].total+=e.amount;refPats[k].totalComm+=getComm(e);refPats[k].totalCredit+=isCredit(e)?e.amount:0;if(e.date>refPats[k].lastDate)refPats[k].lastDate=e.date})
            const refPatList=Object.values(refPats).sort((a,b)=>b.lastDate.localeCompare(a.lastDate))
            const totalComm=refIncome.reduce((a,e)=>a+getComm(e),0)
            return(<>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                <div style={{background:'#fff7ed',borderRadius:12,padding:'10px'}}><div style={{fontSize:9,color:'#92400e',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Patients</div><div style={{fontSize:20,fontWeight:700,color:'#c2410c'}}>{refPatList.length}</div></div>
                <div style={{background:'#f0fdf4',borderRadius:12,padding:'10px'}}><div style={{fontSize:9,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Total</div><div style={{fontSize:20,fontWeight:700,color:'#15803d'}}>{fmt(refIncome.reduce((a,e)=>a+e.amount,0))}</div></div>
                <div style={{background:'#fff7ed',borderRadius:12,padding:'10px'}}><div style={{fontSize:9,color:'#b45309',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Commission</div><div style={{fontSize:20,fontWeight:700,color:'#d97706'}}>{fmt(totalComm)}</div></div>
              </div>
              {refPatList.map(pat=><PatCard key={pat.name} pat={pat}/>)}
            </>)
          })()}
        </>)
      })()}

      {view==='con'&&(()=>{
        return(<>
          <FSel label="Select visiting consultant" value={filterCon} onChange={e=>setFilterCon(e.target.value)}>
            <option value="">- Select consultant -</option>
            {opConsultants.map(d=><option key={d} value={d}>Dr. {d}</option>)}
          </FSel>
          {!filterCon&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>{opConsultants.length?'Select a consultant above':'No consultant records yet'}</div>}
          {filterCon&&(()=>{
            const conIncome=opIncome.filter(e=>e.consultant_name===filterCon)
            const conPats={}
            conIncome.forEach(e=>{const k=e.patient_name;if(!conPats[k])conPats[k]={name:k,phone:e.patient_phone||'',reg_no:e.reg_no||'',entries:[],total:0,totalComm:0,totalCredit:0,lastDate:''};conPats[k].entries.push(e);conPats[k].total+=e.amount;conPats[k].totalComm+=getComm(e);conPats[k].totalCredit+=isCredit(e)?e.amount:0;if(e.date>conPats[k].lastDate)conPats[k].lastDate=e.date})
            const conPatList=Object.values(conPats).sort((a,b)=>b.lastDate.localeCompare(a.lastDate))
            const con=db.consultants.find(d=>d.name===filterCon)
            const totalFee=conIncome.reduce((a,e)=>a+(e.consultant_fee||0),0)
            const totalCollected=conIncome.reduce((a,e)=>a+e.amount,0)
            return(<>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
                <div style={{background:'#f3e8ff',borderRadius:12,padding:'10px'}}><div style={{fontSize:9,color:'#7e22ce',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Patients</div><div style={{fontSize:20,fontWeight:700,color:'#7e22ce'}}>{conPatList.length}</div></div>
                <div style={{background:'#f3e8ff',borderRadius:12,padding:'10px'}}><div style={{fontSize:9,color:'#7e22ce',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Dr. fee</div><div style={{fontSize:20,fontWeight:700,color:'#7e22ce'}}>{fmt(totalFee)}</div></div>
                <div style={{background:'#f0fdf4',borderRadius:12,padding:'10px'}}><div style={{fontSize:9,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>Hospital</div><div style={{fontSize:20,fontWeight:700,color:'#15803d'}}>{fmt(totalCollected-totalFee)}</div></div>
              </div>
              {conPatList.map(pat=><PatCard key={pat.name} pat={pat}/>)}
            </>)
          })()}
        </>)
      })()}
    </div>
  )
}

/*  EXPENSES TAB  */
const ExpTab=({db,actions,exD,setExD,exF,setExF})=>{
  const exp=db.expenses.filter(e=>e.category!=='ref_paid').filter(e=>e.date===exD);const etot=exp.reduce((a,e)=>a+e.amount,0)
  const go=async()=>{const amt=parseFloat(exF.amt);if(!amt||amt<=0){alert('Enter amount');return};const ok=await actions.addExpense({id:uid(),date:exD,category:exF.cat,amount:amt,description:exF.desc,payment:exF.pay,is_monthly:exF.mon});if(ok!==false)setExF({...exF,amt:'',desc:''})}
  return(
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <input style={{...S.inp,flex:1}} type="date" value={exD} onChange={e=>setExD(e.target.value)}/>
        <GBtn onClick={()=>setExD(todayStr())}>Today</GBtn>
      </div>
      <Card>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FSel label="Category" value={exF.cat} onChange={e=>setExF({...exF,cat:e.target.value})}>
            {ECATS.map(c=><option key={c.key} value={c.key}>{c.label}</option>)}
          </FSel>
          <FInp label="Amount (Rs)" type="number" inputMode="numeric" placeholder="0" value={exF.amt} onChange={e=>setExF({...exF,amt:e.target.value})}/>
        </div>
        <FInp label="Description" type="text" placeholder="Details" value={exF.desc} onChange={e=>setExF({...exF,desc:e.target.value})}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,alignItems:'center'}}>
          <FSel label="Payment" value={exF.pay} onChange={e=>setExF({...exF,pay:e.target.value})}>
            {PMODES.map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}
          </FSel>
          <div style={{paddingTop:16}}><label style={{display:'flex',alignItems:'center',gap:8,fontSize:14,cursor:'pointer'}}><input type="checkbox" checked={exF.mon} onChange={e=>setExF({...exF,mon:e.target.checked})} style={{width:18,height:18}}/>Monthly</label></div>
        </div>
        <PBtn onClick={go}>Save expense</PBtn>
      </Card>
      <SecL>Expenses - {fmtD(exD)} - {fmt(etot)}</SecL>
      {exp.length===0?<div style={{textAlign:'center',padding:'24px 0',color:'#ccc',fontSize:13}}>No expenses</div>:<Card>{exp.map(e=>{const c=ECATS.find(c=>c.key===e.category);return<Row key={e.id} left={<span>{c?.label||e.category}{e.is_monthly&&<Pill label="monthly" bg="#dbeafe" tx="#1d4ed8"/>}</span>} sub={(e.description||'-')+' - '+e.payment} right={<><span style={{color:'#ef4444',fontWeight:600,fontSize:13}}>{fmt(e.amount)}</span><DBtn onClick={()=>actions.delExpense(e.id)}>X</DBtn></>}/>})}</Card>}
    </div>
  )
}

/*  REFERRALS REPORT  */
const ReferralsReport=({db,income,allPaid,rm,setRm,ry,setRy,yrs,actions})=>{
  const [per,setPer]=useState('month')
  const [payDoc,setPayDoc]=useState(null)
  const [subTab,setSubTab]=useState('commission')
  const [selDoc,setSelDoc]=useState('')
  const [editPayId,setEditPayId]=useState(null)
  const [editPayForm,setEditPayForm]=useState({amount:'',date:'',payment:'cash'})
  const fi=per==='month'?income.filter(e=>e.date?.startsWith(rm)):income.filter(e=>e.date?.startsWith(ry))
  const docs=buildRef(fi)
  const tc=docs.reduce((a,r)=>a+r.total_commission,0)
  const totalPaid=allPaid.reduce((a,e)=>a+e.amount,0)
  // All-time data for income & timeline tabs
  const allDocs=buildRef(income)
  const allRefDocs=[...new Set(income.filter(e=>e.ref_doctor).map(e=>e.ref_doctor))].sort()
  return(<>
    <div style={{display:'flex',gap:6,marginBottom:12,overflowX:'auto',paddingBottom:2}}>
      {[{k:'commission',l:'Commission'},{k:'income',l:'Income by Doctor'},{k:'timeline',l:'Doctor Timeline'}].map(v=>(<button key={v.k} onClick={()=>setSubTab(v.k)} style={{flexShrink:0,padding:'7px 14px',borderRadius:20,border:subTab===v.k?'none':'1.5px solid #e2e8f0',background:subTab===v.k?'linear-gradient(135deg,#0891b2,#06b6d4)':'#fff',color:subTab===v.k?'#fff':'#64748b',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:subTab===v.k?'0 4px 12px rgba(8,145,178,0.3)':'none',transition:'all .15s'}}>{v.l}</button>))}
    </div>
    {subTab==='commission'&&<>
    <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center'}}>
      <span style={{fontSize:13,color:'#888',fontWeight:600}}>Show:</span>
      {[{k:'month',l:'This month'},{k:'year',l:'This year'}].map(v=>(<button key={v.k} onClick={()=>setPer(v.k)} style={{padding:'7px 14px',borderRadius:20,border:per===v.k?'none':'1px solid #e5e7eb',background:per===v.k?'#111':'none',color:per===v.k?'#fff':'#888',fontSize:13,fontWeight:600,cursor:'pointer'}}>{v.l}</button>))}
    </div>
    {per==='month'&&<input style={{...S.inp,marginBottom:12}} type="month" value={rm} onChange={e=>setRm(e.target.value)}/>}
    {per==='year'&&<select style={{...S.sel,marginBottom:12}} value={ry} onChange={e=>setRy(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>}
    {!docs.length&&<div style={{textAlign:'center',padding:'20px 0',color:'#ccc',fontSize:13}}>No referral data</div>}
    {docs.length>0&&(<>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}>
        <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:12,padding:'12px 14px'}}><div style={{fontSize:10,color:'#92400e',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Commission earned</div><div style={{fontSize:22,fontWeight:700,color:'#c2410c'}}>{fmt(tc)}</div></div>
        <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:'12px 14px'}}><div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Total paid out</div><div style={{fontSize:22,fontWeight:700,color:'#15803d'}}>{fmt(totalPaid)}</div></div>
      </div>
      {docs.map(doc=>{const paid=allPaid.filter(e=>e.description===doc.name).reduce((a,e)=>a+e.amount,0);const balance=doc.total_commission-paid;const isOpen=payDoc===doc.name;return(
        <Card key={doc.name} style={{border:balance>0?'1px solid #fed7aa':'1px solid #f0f0f0'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}><div><div style={{fontSize:15,fontWeight:700}}>Dr. {doc.name}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>Income: {fmt(doc.total_income)}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:11,color:'#d97706',fontWeight:600}}>Commission earned</div><div style={{fontSize:18,fontWeight:700,color:'#c2410c'}}>{fmt(doc.total_commission)}</div></div></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,padding:'10px 0',borderTop:'1px solid #f5f5f5',borderBottom:'1px solid #f5f5f5',marginBottom:10}}>
            <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Earned</div><div style={{fontSize:13,fontWeight:700,color:'#c2410c'}}>{fmt(doc.total_commission)}</div></div>
            <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Paid</div><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(paid)}</div></div>
            <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Balance</div><div style={{fontSize:13,fontWeight:700,color:balance>0?'#ef4444':'#16a34a'}}>{fmt(balance)}</div></div>
          </div>
          {Object.entries(doc.by_type).map(([tk,v])=>(<Row key={tk} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={tk}/>{ITYPES.find(t=>t.key===tk)?.full}</span>} sub={fmt(v.income)+' x comm'} right={<span style={{color:'#d97706',fontWeight:700}}>{fmt(v.commission)}</span>}/>))}
          {paid>0&&(<div style={{marginTop:8,paddingTop:8,borderTop:'1px solid #f5f5f5'}}>
            <div style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:8}}>Payments made</div>
            {allPaid.filter(e=>e.description===doc.name).map(e=>{
              const isEditing=editPayId===e.id
              return(<div key={e.id} style={{marginBottom:8,padding:'8px 10px',background:'#f9fafb',borderRadius:10,border:'1px solid #f0f0f0'}}>
                {!isEditing
                  ?<div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div><div style={{fontSize:13,color:'#374151',fontWeight:500}}>{fmtD(e.date)}</div><div style={{fontSize:11,color:'#94a3b8',marginTop:1}}>{e.payment}</div></div>
                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                      <span style={{color:'#16a34a',fontWeight:700,fontSize:14}}>{fmt(e.amount)}</span>
                      <button onClick={()=>{setEditPayId(e.id);setEditPayForm({amount:String(e.amount),date:e.date,payment:e.payment||'cash'})}} style={{padding:'4px 10px',background:'none',border:'1px solid #e5e7eb',borderRadius:8,fontSize:11,color:'#6366f1',fontWeight:600,cursor:'pointer'}}>Edit</button>
                      <DBtn onClick={async()=>{if(window.confirm('Delete this payment?')){await actions.delExpense(e.id)}}}>Del</DBtn>
                    </div>
                  </div>
                  :<div>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                      <div><div style={{fontSize:10,color:'#aaa',fontWeight:700,marginBottom:4}}>Amount</div><input style={{...S.inp,fontSize:14}} type="number" value={editPayForm.amount} onChange={e2=>setEditPayForm(f=>({...f,amount:e2.target.value}))}/></div>
                      <div><div style={{fontSize:10,color:'#aaa',fontWeight:700,marginBottom:4}}>Date</div><input style={{...S.inp,fontSize:14}} type="date" value={editPayForm.date} onChange={e2=>setEditPayForm(f=>({...f,date:e2.target.value}))}/></div>
                    </div>
                    <select style={{...S.sel,marginBottom:8}} value={editPayForm.payment} onChange={e2=>setEditPayForm(f=>({...f,payment:e2.target.value}))}>
                      <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option><option value="bank">Bank transfer</option>
                    </select>
                    <div style={{display:'flex',gap:8}}>
                      <button onClick={async()=>{const amt=parseFloat(editPayForm.amount);if(!amt||amt<=0){alert('Enter valid amount');return};await actions.updateExpense(e.id,{amount:amt,date:editPayForm.date,payment:editPayForm.payment});setEditPayId(null)}} style={{flex:1,padding:'9px',background:'#16a34a',color:'#fff',border:'none',borderRadius:9,fontSize:13,fontWeight:700,cursor:'pointer'}}>Save</button>
                      <button onClick={()=>setEditPayId(null)} style={{flex:1,padding:'9px',background:'none',border:'1px solid #e5e7eb',borderRadius:9,fontSize:13,color:'#888',cursor:'pointer'}}>Cancel</button>
                    </div>
                  </div>}
              </div>)
            })}
          </div>)}
          {balance>0&&(<div style={{marginTop:10}}>{!isOpen?<button onClick={()=>setPayDoc(doc.name)} style={{width:'100%',padding:'10px',background:'#111',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Record commission payment</button>:<CommPayForm docName={doc.name} balance={balance} onCancel={()=>setPayDoc(null)} onSave={async(amt,date,pay)=>{await actions.addExpense({id:uid(),date,category:'ref_paid',amount:amt,description:doc.name,payment:pay,is_monthly:false});setPayDoc(null)}}/>}</div>)}
          {balance<=0&&<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:8,padding:'8px 12px',background:'#f0fdf4',borderRadius:10}}><span style={{fontSize:12,color:'#16a34a',fontWeight:700}}>Fully paid</span><button onClick={()=>setPayDoc(doc.name)} style={{fontSize:11,color:'#6366f1',background:'none',border:'1px solid #e5e7eb',borderRadius:8,padding:'4px 10px',fontWeight:600,cursor:'pointer'}}>+ Add payment</button></div>}
        </Card>
      )})}
    </>)}
    </>}

    {subTab==='income'&&(<>
      <div style={{fontSize:12,color:'#aaa',marginBottom:14}}>All-time income brought by each referral doctor</div>
      {!allDocs.length&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No referral data yet</div>}
      {allDocs.map(doc=>{
        const paidAll=allPaid.filter(e=>e.description===doc.name).reduce((a,e)=>a+e.amount,0)
        const realInc=doc.total_income-doc.total_commission
        return(<Card key={doc.name} style={{marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
            <div><div style={{fontSize:15,fontWeight:700}}>Dr. {doc.name}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>{Object.keys(doc.by_type).length} category{Object.keys(doc.by_type).length!==1?'s':''}</div></div>
            <div style={{textAlign:'right'}}><div style={{fontSize:20,fontWeight:800,color:'#16a34a'}}>{fmt(doc.total_income)}</div><div style={{fontSize:11,color:'#aaa'}}>total income</div></div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:6,marginBottom:10}}>
            {[{l:'Total income',v:fmt(doc.total_income),c:'#16a34a'},{l:'Commission paid',v:fmt(doc.total_commission),c:'#c2410c'},{l:'Real income',v:fmt(realInc),c:'#1d4ed8'}].map((m,i)=>(
              <div key={i} style={{background:'#f9f9f9',borderRadius:8,padding:'8px',textAlign:'center'}}>
                <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>{m.l}</div>
                <div style={{fontSize:14,fontWeight:800,color:m.c}}>{m.v}</div>
              </div>
            ))}
          </div>
          <div style={{borderTop:'1px solid #f0f0f0',paddingTop:8}}>
            {Object.entries(doc.by_type).map(([tk,v])=>{const it=ITYPES.find(t=>t.key===tk);return(
              <div key={tk} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px solid #f9f9f9'}}>
                <span style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}><TypeTag t={tk}/>{it?.full||tk}</span>
                <div style={{textAlign:'right'}}>
                  <span style={{fontWeight:600,fontSize:13}}>{fmt(v.income)}</span>
                  <span style={{fontSize:11,color:'#c2410c',marginLeft:8}}>-{fmt(v.commission)} comm</span>
                </div>
              </div>
            )})}
          </div>
        </Card>)
      })}
    </>)}

    {subTab==='timeline'&&(<>
      <FSel label="Select referral doctor" value={selDoc} onChange={e=>setSelDoc(e.target.value)}>
        <option value="">-- Select a doctor --</option>
        {allRefDocs.map(d=><option key={d} value={d}>Dr. {d}</option>)}
      </FSel>
      {!selDoc&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>{allRefDocs.length?'Select a doctor above to see their patient timeline':'No referral data yet'}</div>}
      {selDoc&&(()=>{
        const docIncome=income.filter(e=>e.ref_doctor===selDoc).slice().sort((a,b)=>(a.date||'').localeCompare(b.date||''))
        const docIPPats=db.ip_patients.filter(p=>p.ref_doctor===selDoc).slice().sort((a,b)=>(a.admission_date||'').localeCompare(b.admission_date||''))
        const totalInc=docIncome.reduce((a,e)=>a+e.amount,0)
        const totalComm=docIncome.reduce((a,e)=>a+getComm(e),0)
        const paidAll=allPaid.filter(e=>e.description===selDoc).reduce((a,e)=>a+e.amount,0)
        const allEvents=[]
        docIPPats.forEach(p=>{
          allEvents.push({date:p.admission_date,label:'Admitted: '+p.name,sub:(p.patient_type||'Regular')+(p.is_package?' - Package':'')+' IP patient'+(p.discharge_date?' - Discharged '+fmtD(p.discharge_date):''),color:'#1d4ed8',type:'admit'})
        })
        docIncome.forEach(e=>{
          const cr=isCredit(e);const comm=getComm(e);const it=ITYPES.find(t=>t.key===e.type)
          allEvents.push({date:e.date,label:(e.patient_name||'Patient')+' - '+fmt(e.amount),sub:(it?.full||e.type)+(cr?' (credit)':' '+e.payment)+(comm>0?' - Comm: '+fmt(comm):''),color:cr?'#c2410c':'#16a34a',type:'income',amount:e.amount,comm})
        })
        allEvents.sort((a,b)=>(a.date||'').localeCompare(b.date||''))
        return(<>
          <div style={{background:'linear-gradient(135deg,#d97706 0%,#b45309 100%)',borderRadius:14,padding:'14px 16px',marginBottom:14,color:'#fff'}}>
            <div style={{fontSize:12,color:'#fde68a',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Dr. {selDoc}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginTop:6}}>
              {[{l:'Total income',v:fmt(totalInc)},{l:'Commission',v:fmt(totalComm)},{l:'Patients',v:docIPPats.length+' IP'}].map((m,i)=>(
                <div key={i} style={{textAlign:'center'}}><div style={{fontSize:9,color:'#fde68a',fontWeight:700,textTransform:'uppercase'}}>{m.l}</div><div style={{fontSize:16,fontWeight:800}}>{m.v}</div></div>
              ))}
            </div>
          </div>
          {!allEvents.length&&<div style={{textAlign:'center',padding:'24px',color:'#ccc',fontSize:13}}>No records found</div>}
          <div style={{position:'relative',paddingLeft:32}}>
            <div style={{position:'absolute',left:11,top:8,bottom:8,width:2,background:'#e5e7eb'}}/>
            {allEvents.map((ev,i)=>(
              <div key={i} style={{position:'relative',marginBottom:14}}>
                <div style={{position:'absolute',left:-21,top:2,width:18,height:18,borderRadius:'50%',background:ev.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:8,color:'#fff',fontWeight:700}}>{ev.type==='admit'?'IP':'Rs'}</div>
                <div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:10,padding:'10px 12px',borderLeft:'3px solid '+ev.color}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div><div style={{fontSize:13,fontWeight:600}}>{ev.label}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>{ev.sub}</div></div>
                    <div style={{fontSize:11,color:'#aaa',flexShrink:0,marginLeft:8}}>{fmtD(ev.date)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>)
      })()}
    </>)}
  </>)
}

/*  EXPENSES REPORT  */
const ExpensesReport=({db})=>{
  const [per,setPer]=useState('month')
  const [rm2,setRm2]=useState(todayStr().slice(0,7))
  const [ry2,setRy2]=useState(todayStr().slice(0,4))
  const [from,setFrom]=useState(todayStr().slice(0,7)+'-01')
  const [to,setTo]=useState(todayStr())
  const yrs=[...new Set(db.expenses.map(e=>e.date?.slice(0,4)))].filter(Boolean).sort().reverse()
  if(!yrs.includes(ry2))yrs.unshift(ry2)
  const expList=(per==='month'?db.expenses.filter(e=>e.date?.startsWith(rm2)):per==='year'?db.expenses.filter(e=>e.date?.startsWith(ry2)):db.expenses.filter(e=>e.date>=from&&e.date<=to)).filter(e=>e.category!=='ref_paid')
  const total=expList.reduce((a,e)=>a+e.amount,0)
  const byCat={};expList.forEach(e=>{if(!byCat[e.category])byCat[e.category]=0;byCat[e.category]+=e.amount})
  const sorted=Object.entries(byCat).sort((a,b)=>b[1]-a[1])
  return(<>
    <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>
      {[{k:'month',l:'Month'},{k:'year',l:'Year'},{k:'custom',l:'Custom'}].map(v=>(<button key={v.k} onClick={()=>setPer(v.k)} style={{padding:'6px 14px',borderRadius:20,border:per===v.k?'none':'1px solid #e5e7eb',background:per===v.k?'#111':'none',color:per===v.k?'#fff':'#888',fontSize:12,fontWeight:600,cursor:'pointer'}}>{v.l}</button>))}
    </div>
    {per==='month'&&<input style={{...S.inp,marginBottom:12}} type="month" value={rm2} onChange={e=>setRm2(e.target.value)}/>}
    {per==='year'&&<select style={{...S.sel,marginBottom:12}} value={ry2} onChange={e=>setRy2(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>}
    {per==='custom'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}><FInp label="From" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><FInp label="To" type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>}
    <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:14,padding:'16px',marginBottom:14}}><div style={{fontSize:11,color:'#dc2626',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Total expenses</div><div style={{fontSize:32,fontWeight:800,color:'#dc2626'}}>{fmt(total)}</div><div style={{fontSize:11,color:'#aaa',marginTop:4}}>{expList.length} entries</div></div>
    <SecL>By category</SecL>
    <Card>
      {sorted.length===0&&<div style={{textAlign:'center',padding:'16px 0',color:'#ccc',fontSize:13}}>No expenses</div>}
      {sorted.map(([cat,amt])=>{const c=ECATS.find(x=>x.key===cat);const pct=total>0?Math.round(amt/total*100):0;return(<div key={cat} style={{padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}><span style={{fontSize:13,fontWeight:500}}>{c?.label||cat}</span><span style={{fontSize:13,fontWeight:700,color:'#ef4444'}}>{fmt(amt)}</span></div><div style={{display:'flex',alignItems:'center',gap:8}}><div style={{flex:1,height:6,background:'#f0f0f0',borderRadius:3}}><div style={{width:pct+'%',height:6,background:'#ef4444',borderRadius:3,opacity:0.7}}/></div><span style={{fontSize:10,color:'#aaa',minWidth:28}}>{pct}%</span></div></div>)})}
      {total>0&&<div style={{display:'flex',justifyContent:'space-between',paddingTop:10,marginTop:4,borderTop:'2px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total</span><span style={{color:'#ef4444'}}>{fmt(total)}</span></div>}
    </Card>
    <HBarChart title="Expenses by category" data={sorted.slice(0,8).map(([cat,amt])=>{const c=ECATS.find(x=>x.key===cat);return{label:(c?.label||cat).split(' ').slice(0,2).join(' '),value:amt,color:'#ef4444',fmt:fmt(amt)}})}/>
  </>)
}

/*  PATIENT LIST REPORT  */
const PatientListReport=({db,gotoTimeline})=>{
  const [per,setPer]=useState('month')
  const [rm2,setRm2]=useState(todayStr().slice(0,7))
  const [ry2,setRy2]=useState(todayStr().slice(0,4))
  const [from,setFrom]=useState(todayStr().slice(0,7)+'-01')
  const [to,setTo]=useState(todayStr())
  const [showType,setShowType]=useState('all')
  const [opView,setOpView]=useState('all')
  const [opRefFilter,setOpRefFilter]=useState('')
  const [opConFilter,setOpConFilter]=useState('')
  const [ipView,setIpView]=useState('all')
  const [ipSearch,setIpSearch]=useState('')
  const [ipRefFilter2,setIpRefFilter2]=useState('')
  const yrs=[...new Set(db.ip_patients.map(e=>e.admission_date?.slice(0,4)))].filter(Boolean).sort().reverse()
  if(!yrs.includes(ry2))yrs.unshift(ry2)
  const ipPats=db.ip_patients.filter(p=>{const adm=p.admission_date||'';const dis=p.discharge_date||'9999-12-31';if(per==='month')return adm.startsWith(rm2)||(adm<=rm2+'-31'&&dis>=rm2+'-01');if(per==='year')return adm.startsWith(ry2)||(adm<=ry2+'-12-31'&&dis>=ry2+'-01-01');return adm<=to&&(dis>=from||!p.discharge_date)})
  const periodInc=per==='month'?db.income.filter(e=>e.date?.startsWith(rm2)):per==='year'?db.income.filter(e=>e.date?.startsWith(ry2)):db.income.filter(e=>e.date>=from&&e.date<=to)
  const opEnts=periodInc.filter(e=>!['ip','ip_r','ip_l'].includes(e.type)&&e.patient_name&&!db.ip_patients.some(p=>p.id===e.patient_id))
  const opByPat={};opEnts.forEach(e=>{const k=(e.patient_name||'').trim().toLowerCase();if(!opByPat[k])opByPat[k]={name:e.patient_name,phone:e.patient_phone||'',reg_no:e.reg_no||'',total:0,cash:0,credit:0,comm:0,ref_doctor:'',entries:[],lastDate:''};opByPat[k].total+=e.amount;opByPat[k].cash+=isCredit(e)?0:e.amount;opByPat[k].credit+=isCredit(e)?e.amount:0;opByPat[k].comm+=getComm(e);if(e.ref_doctor&&!opByPat[k].ref_doctor)opByPat[k].ref_doctor=e.ref_doctor;opByPat[k].entries.push(e);if(e.date>opByPat[k].lastDate)opByPat[k].lastDate=e.date;if(e.consultant_name&&!opByPat[k].consultant_name)opByPat[k].consultant_name=e.consultant_name})
  const opPats=Object.values(opByPat).sort((a,b)=>(b.lastDate||'').localeCompare(a.lastDate||''))
  return(<>
    <div style={{display:'flex',gap:6,marginBottom:12,flexWrap:'wrap'}}>{[{k:'month',l:'Month'},{k:'year',l:'Year'},{k:'custom',l:'Custom'}].map(v=>(<button key={v.k} onClick={()=>setPer(v.k)} style={{padding:'6px 14px',borderRadius:20,border:per===v.k?'none':'1px solid #e5e7eb',background:per===v.k?'#111':'none',color:per===v.k?'#fff':'#888',fontSize:12,fontWeight:600,cursor:'pointer'}}>{v.l}</button>))}</div>
    {per==='month'&&<input style={{...S.inp,marginBottom:12}} type="month" value={rm2} onChange={e=>setRm2(e.target.value)}/>}
    {per==='year'&&<select style={{...S.sel,marginBottom:12}} value={ry2} onChange={e=>setRy2(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>}
    {per==='custom'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}><FInp label="From" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><FInp label="To" type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>}
    <div style={{display:'flex',gap:6,marginBottom:14}}>{[{k:'all',l:'All'},{k:'ip',l:'IP only'},{k:'op',l:'OP only'}].map(v=>(<button key={v.k} onClick={()=>setShowType(v.k)} style={{padding:'6px 12px',borderRadius:20,border:showType===v.k?'none':'1px solid #e5e7eb',background:showType===v.k?'#374151':'none',color:showType===v.k?'#fff':'#888',fontSize:11,fontWeight:600,cursor:'pointer'}}>{v.l}</button>))}</div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}>
      <div style={{background:'#f0fdf4',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>IP patients</div><div style={{fontSize:22,fontWeight:700,color:'#15803d'}}>{ipPats.length}</div></div>
      <div style={{background:'#dbeafe',borderRadius:12,padding:'10px 14px'}}><div style={{fontSize:10,color:'#1d4ed8',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>OP patients</div><div style={{fontSize:22,fontWeight:700,color:'#1d4ed8'}}>{opPats.length}</div></div>
    </div>
    {(showType==='all'||showType==='ip')&&(<>
      {showType==='ip'&&<>
        <div style={{display:'flex',gap:6,marginBottom:10,overflowX:'auto'}}>{[{k:'all',l:'All'},{k:'active',l:'Active'},{k:'discharged',l:'Discharged'},{k:'ref',l:'By Ref Doctor'}].map(v=>(<button key={v.k} onClick={()=>setIpView(v.k)} style={{flexShrink:0,padding:'6px 12px',borderRadius:20,border:ipView===v.k?'none':'1px solid #e5e7eb',background:ipView===v.k?'#16a34a':'none',color:ipView===v.k?'#fff':'#888',fontSize:11,fontWeight:600,cursor:'pointer'}}>{v.l}</button>))}</div>
        {ipView!=='ref'&&<div style={{position:'relative',marginBottom:10}}><input style={{...S.inp,paddingLeft:36}} placeholder="Search name, reg no, phone..." value={ipSearch} onChange={e=>setIpSearch(e.target.value)} autoCorrect="off" autoCapitalize="none"/><span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:16,color:'#aaa'}}></span>{ipSearch&&<button onClick={()=>setIpSearch('')} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',fontSize:16,color:'#aaa',cursor:'pointer'}}></button>}</div>}
        {ipView==='ref'&&<FSel label="Select referral doctor" value={ipRefFilter2} onChange={e=>setIpRefFilter2(e.target.value)}><option value="">- Select doctor -</option>{[...new Set(ipPats.filter(p=>p.ref_doctor).map(p=>p.ref_doctor))].sort().map(d=><option key={d} value={d}>Dr. {d}</option>)}</FSel>}
      </>}
      {(()=>{
        let pool=ipPats
        if(showType==='ip'){
          if(ipView==='active')pool=ipPats.filter(p=>!p.discharge_date)
          if(ipView==='discharged')pool=ipPats.filter(p=>p.discharge_date)
          if(ipView==='ref'&&ipRefFilter2)pool=ipPats.filter(p=>p.ref_doctor===ipRefFilter2)
          if(ipSearch.trim()&&ipView!=='ref')pool=pool.filter(p=>p.name.toLowerCase().includes(ipSearch.toLowerCase())||p.reg_no?.toLowerCase().includes(ipSearch.toLowerCase())||p.phone?.includes(ipSearch))
        }
        if(!pool.length)return null
        return(<><SecL>IP patients ({pool.length})</SecL>{pool.map(p=>{const ents=db.income.filter(e=>e.patient_id===p.id);const total=ents.reduce((a,e)=>a+e.amount,0);const cash=cashTotal(ents);const credit=credTotal(ents);const pkgPd=(p.payments||[]).reduce((a,e)=>a+e.amount,0);const comm=ents.reduce((a,e)=>a+getComm(e),0)+(p.payments||[]).reduce((a,py)=>a+(py.commission||0),0);return(<Card key={p.id} style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div><button onClick={()=>gotoTimeline(p.id)} style={{fontSize:14,fontWeight:700,color:'#1d4ed8',background:'none',border:'none',cursor:'pointer',padding:0,textAlign:'left'}}>{p.name}</button>{p.phone&&<div style={{fontSize:11,color:'#aaa'}}>Ph: {p.phone}</div>}{p.reg_no&&<div style={{fontSize:11,color:'#1d4ed8',fontWeight:600}}>Reg: {p.reg_no}</div>}<div style={{fontSize:11,color:'#aaa',marginTop:2}}>{fmtD(p.admission_date)}{p.discharge_date?' to '+fmtD(p.discharge_date):<Pill label="Active" bg="#dcfce7" tx="#16a34a"/>}</div>{p.ref_doctor&&<div style={{fontSize:11,color:'#d97706',fontWeight:600,marginTop:2}}>Ref: {p.ref_doctor}</div>}</div>
        <div style={{textAlign:'right'}}>{p.patient_type&&p.patient_type!=='Regular'&&<div style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#dbeafe',color:'#1d4ed8',fontWeight:700,marginBottom:4}}>{p.patient_type}</div>}<div style={{fontSize:14,fontWeight:700}}>{fmt(total)}</div></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4}}>
        {[{l:'Cash',v:fmt(cash),c:'#16a34a'},{l:'Credit',v:fmt(credit),c:credit>0?'#c2410c':'#aaa'},{l:'Pkg',v:fmt(pkgPd),c:'#1d4ed8'},{l:'Comm',v:fmt(comm),c:'#d97706'}].map((m,i)=>(<div key={i} style={{background:'#f9f9f9',borderRadius:8,padding:'6px 8px',textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:600,textTransform:'uppercase'}}>{m.l}</div><div style={{fontSize:11,fontWeight:700,color:m.c,marginTop:2}}>{m.v}</div></div>))}
      </div>
    </Card>)})}</>)})()}
    </>)}
    {(showType==='all'||showType==='op')&&(<>
      {showType==='op'&&<div style={{display:'flex',gap:6,marginBottom:12,overflowX:'auto'}}>{[{k:'all',l:'All'},{k:'ref',l:'By Ref Doctor'},{k:'con',l:'By Consultant'}].map(v=>(<button key={v.k} onClick={()=>setOpView(v.k)} style={{flexShrink:0,padding:'6px 12px',borderRadius:20,border:opView===v.k?'none':'1px solid #e5e7eb',background:opView===v.k?'#1d4ed8':'none',color:opView===v.k?'#fff':'#888',fontSize:11,fontWeight:600,cursor:'pointer'}}>{v.l}</button>))}</div>}
      {showType==='op'&&opView==='ref'&&<FSel label="Filter by referral doctor" value={opRefFilter} onChange={e=>setOpRefFilter(e.target.value)}><option value="">- All referral doctors -</option>{[...new Set(opEnts.filter(e=>e.ref_doctor).map(e=>e.ref_doctor))].sort().map(d=><option key={d} value={d}>Dr. {d}</option>)}</FSel>}
      {showType==='op'&&opView==='con'&&<FSel label="Filter by consultant" value={opConFilter} onChange={e=>setOpConFilter(e.target.value)}><option value="">- All consultants -</option>{[...new Set(opEnts.filter(e=>e.consultant_name).map(e=>e.consultant_name))].sort().map(d=><option key={d} value={d}>Dr. {d}</option>)}</FSel>}
      {(()=>{
        let filtered=opPats
        if(showType==='op'&&opView==='ref'&&opRefFilter)filtered=opPats.filter(p=>p.entries.some(e=>e.ref_doctor===opRefFilter))
        if(showType==='op'&&opView==='con'&&opConFilter)filtered=opPats.filter(p=>p.entries.some(e=>e.consultant_name===opConFilter))
        return filtered.length>0?(<><SecL>OP patients ({filtered.length})</SecL>{filtered.map(pt=>(<Card key={pt.name} style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#111'}}>{pt.name}</div>
          {pt.phone&&<div style={{fontSize:11,color:'#aaa'}}>Ph: {pt.phone}</div>}
          {pt.reg_no&&<div style={{fontSize:11,color:'#1d4ed8',fontWeight:600,marginTop:2}}>Reg: {pt.reg_no}</div>}
          {pt.ref_doctor&&<div style={{fontSize:11,color:'#d97706',fontWeight:600,marginTop:2}}>Ref: Dr. {pt.ref_doctor}</div>}
          <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{pt.entries.length} visit{pt.entries.length!==1?'s':''}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:14,fontWeight:700,color:'#111'}}>{fmt(pt.total)}</div>
          <div style={{fontSize:11,color:'#16a34a',fontWeight:600}}>Real: {fmt(pt.total-pt.comm)}</div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:4,marginBottom:10}}>
        {[{l:'Cash',v:fmt(pt.cash),c:'#16a34a'},{l:'Credit',v:fmt(pt.credit),c:pt.credit>0?'#c2410c':'#aaa'},{l:'Real income',v:fmt(pt.total-pt.comm),c:'#16a34a'},{l:'Commission',v:fmt(pt.comm),c:pt.comm>0?'#d97706':'#aaa'}].map((m,i)=>(<div key={i} style={{background:'#f9f9f9',borderRadius:8,padding:'6px 8px',textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:600,textTransform:'uppercase'}}>{m.l}</div><div style={{fontSize:11,fontWeight:700,color:m.c,marginTop:2}}>{m.v}</div></div>))}
      </div>
      <div style={{borderTop:'1px solid #f0f0f0',paddingTop:8}}>
        {(()=>{const byType={};pt.entries.forEach(e=>{if(!byType[e.type])byType[e.type]={inc:0,comm:0,credit:0,cash:0};byType[e.type].inc+=e.amount;byType[e.type].comm+=getComm(e);byType[e.type].credit+=isCredit(e)?e.amount:0;byType[e.type].cash+=isCredit(e)?0:e.amount});return Object.entries(byType).map(([tk,v])=>{const it=ITYPES.find(t=>t.key===tk);return(<div key={tk} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'5px 0',borderBottom:'1px solid #f9f9f9'}}><span style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}><TypeTag t={tk}/>{it?.full||tk}</span><div style={{textAlign:'right'}}><span style={{fontWeight:600,fontSize:13,color:'#111'}}>{fmt(v.inc)}</span>{v.comm>0&&<span style={{fontSize:11,color:'#d97706',marginLeft:8}}>-{fmt(v.comm)} comm</span>}{v.credit>0&&<span style={{fontSize:11,color:'#c2410c',marginLeft:8}}>{fmt(v.credit)} credit</span>}</div></div>)})})()}
      </div>
    </Card>))}</>):null})()}
    </>)}
    {ipPats.length===0&&opPats.length===0&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No patients for this period</div>}
  </>)
}

/*  PATIENT TIMELINE  */
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
