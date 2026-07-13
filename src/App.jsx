import { useState, useEffect, useCallback, useMemo, Fragment } from 'react'
import { supabase } from './supabase.js'

const ITYPES=[{key:'op',label:'OP',full:'OP Consultation'},{key:'opd',label:'OPD',full:'OPD Services'},{key:'op_p',label:'OP-P',full:'OP Procedures'},{key:'op_dm',label:'OP-DM',full:'OP Discharge Medicine'},{key:'ip',label:'IP',full:'IP Charges'},{key:'op_r',label:'OP-R',full:'OP Pharmacy'},{key:'ip_r',label:'IP-R',full:'IP Pharmacy'},{key:'op_l',label:'OP-L',full:'OP Lab'},{key:'ip_l',label:'IP-L',full:'IP Lab'},{key:'ip_p',label:'IP-P',full:'IP Package'},{key:'vc',label:'VC',full:'Visiting Consultant'}]
const ECATS=[{key:'ref_paid',label:'Referral commission paid',segment:'skip'},{key:'consultant_fee',label:'Consultant fee (OP Consult)',segment:'skip'},{key:'consultant_proc_comm',label:'Consultant commission (OP Procedure)',segment:'skip'},{key:'comm_retained_clinical',label:'Commission retained (Clinical)',segment:'skip'},{key:'comm_retained_lab',label:'Commission retained (Lab)',segment:'skip'},{key:'lab_to_lab',label:'Lab to lab expenses',segment:'lab'},{key:'lab_grbs',label:'GRBS strips',segment:'lab'},{key:'lab_ecg',label:'ECG strips/rolls',segment:'lab'},{key:'lab_reagents',label:'Lab reagents & kits',segment:'lab'},{key:'lab_consumables',label:'Lab consumables',segment:'lab'},{key:'rent',label:'Hospital rent',segment:'clinical'},{key:'electricity',label:'Electricity',segment:'clinical'},{key:'water',label:'Water',segment:'clinical'},{key:'salary',label:'Staff salary',segment:'clinical'},{key:'supplies',label:'Medical supplies',segment:'clinical'},{key:'municipality',label:'Municipality',segment:'clinical'},{key:'biomedical_bags',label:'Biomedical waste bags',segment:'clinical'},{key:'stationary',label:'Stationary',segment:'clinical'},{key:'washroom_cleaner',label:'Washroom cleaner',segment:'clinical'},{key:'biomedical_yearly',label:'Biomedical waste (yearly)',segment:'clinical'},{key:'misc',label:'Miscellaneous',segment:'clinical'}]
const LAB_INCOME_TYPES=new Set(['op_l','ip_l'])
let CUSTOM_CAT_REG={};const expenseSegment=(catKey)=>{const found=ECATS.find(c=>c.key===catKey);if(found)return found.segment;if(CUSTOM_CAT_REG[catKey])return CUSTOM_CAT_REG[catKey];if(catKey&&/lab|grbs|ecg|strip|reagent|kit/i.test(catKey))return 'lab';return 'clinical'}
const incomeSegment=(type)=>LAB_INCOME_TYPES.has(type)?'lab':'clinical'
const getCats=(db)=>{const custom=(db&&db.hospital&&Array.isArray(db.hospital.custom_expense_cats))?db.hospital.custom_expense_cats:[];const keys=new Set(ECATS.map(x=>x.key));return[...ECATS,...custom.filter(cc=>cc&&cc.key&&!keys.has(cc.key)).map(cc=>({key:cc.key,label:cc.label,segment:cc.segment==='lab'?'lab':'clinical',custom:true}))]}
const PMODES=['cash','upi','card','bank','credit','insurance','discount','written_off']
const MOS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MOFULL=['January','February','March','April','May','June','July','August','September','October','November','December']
const COMM={op:0,ip:0.40,op_r:0.40,ip_r:0.40,op_l:0.50,ip_l:0.50,ip_p:0.30,vc:0,op_dm:0.40,opd:0,op_p:0}
const CLBL={op:'None',ip:'40%',op_r:'40%',ip_r:'40%',op_l:'50%',ip_l:'50%',ip_p:'30%',vc:'None'}
const TC={op:['#dbeafe','#1d4ed8'],ip:['#dcfce7','#16a34a'],op_r:['#fef3c7','#b45309'],ip_r:['#ffedd5','#c2410c'],op_l:['#fce7f3','#9d174d'],ip_l:['#f3e8ff','#7e22ce'],ip_p:['#ecfdf5','#065f46'],vc:['#f0fdf4','#065f46'],opd:['#f0fdf4','#15803d'],op_p:['#fef3c7','#a16207'],op_dm:['#fce7f3','#be185d']}

const ROLES=['admin','management','accounts','staff']
const OP_TYPES=['New OP','Review OP']
const IP_PAT_TYPES=['Regular','Package','VC']
const PLANS=[{key:'trial',label:'Trial (7 days)',price:0},{key:'starter',label:'Starter',price:600},{key:'pro',label:'Pro',price:900},{key:'enterprise',label:'Enterprise',price:1900}]
const toEmail=u=>`${u.toLowerCase().replace(/\s+/g,'')}@easymedicalsolutions.in`

const todayStr=()=>new Date().toISOString().split('T')[0]
const fmtT=(ts)=>{if(!ts)return'';try{return new Date(ts).toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit',hour12:true})}catch(e){return''}}
const consPct=(con,t)=>t==='op_p'?(con?.op_p_pct||0):(con?.fee_share_pct||0)

const daysInMonth=(ym)=>{const [y,m]=ym.split('-').map(Number);return new Date(y,m,0).getDate()}
const computeSalaryDeduction=(emp,month,attList)=>{
  // leave + absent both count toward allowance; half = 0.5
  const monthAtt=attList.filter(a=>a.employee_id===emp.id&&a.date&&a.date.startsWith(month))
  let leaveUnits=0
  monthAtt.forEach(a=>{
    if(a.status==='leave'||a.status==='absent')leaveUnits+=1
    else if(a.status==='half')leaveUnits+=0.5
  })
  const ALLOWANCE=2
  const excess=Math.max(0,leaveUnits-ALLOWANCE)
  const dim=daysInMonth(month)
  const perDay=(emp.monthly_salary||0)/dim
  const deduction=Math.round(excess*perDay)
  const payable=Math.max(0,(emp.monthly_salary||0)-deduction)
  return{leaveUnits,excess,perDay:Math.round(perDay),deduction,payable,daysInMonth:dim,allowance:ALLOWANCE}
}
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6)
const genRegNo=async()=>{try{const {data}=await supabase.rpc('next_reg_no');return data||('REG'+Date.now().toString().slice(-5))}catch(e){return 'REG'+Date.now().toString().slice(-5)}}
const fmt=n=>'Rs '+(Math.round(n)||0).toLocaleString('en-IN')

const fmtD=d=>{if(!d)return'-';const x=new Date(d+'T00:00:00');return`${x.getDate()} ${MOS[x.getMonth()]} ${x.getFullYear()}`}
const getRefDoc=(e,pats)=>e.ref_doctor||(pats||[]).find(p=>p.id===e.patient_id)?.ref_doctor||null
const isCredit=e=>e.payment==='credit'
const isExcluded=e=>e.payment==='credit'||e.payment==='written_off'||e.payment==='discount'
const isPaid=e=>!isExcluded(e)
const getComm=e=>{if(e.payment==='written_off'||e.payment==='discount')return 0;if(!e.ref_doctor||e.ref_doctor.trim()==='')return 0;const rate=e.custom_commission!=null?(parseFloat(e.custom_commission)/100):(COMM[e.type]||0);return e.amount*rate}
const sumInc=list=>{const r={};ITYPES.forEach(t=>{r[t.key]=list.filter(e=>e.type===t.key).reduce((a,e)=>a+e.amount,0)});r.total=Object.values(r).reduce((a,b)=>a+b,0);return r}
const sumExp=list=>{const r={};ECATS.forEach(c=>{r[c.key]=list.filter(e=>e.category===c.key).reduce((a,e)=>a+e.amount,0)});r.total=ECATS.filter(c=>c.key!=='ref_paid'&&!isRetainedCat(c.key)).reduce((a,c)=>a+(r[c.key]||0),0);return r}
const totalRef=list=>list.reduce((a,e)=>a+getComm(e),0)
const cashTotal=list=>list.filter(e=>!isExcluded(e)).reduce((a,e)=>a+e.amount,0)
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

const RESP_CSS='@media(min-width:768px){'+
'.app-wrapper{max-width:100vw!important;width:100%!important;display:flex!important;flex-direction:row!important;align-items:flex-start!important}'+
'.app-header{width:230px!important;flex-shrink:0!important;min-height:100vh!important;position:sticky!important;top:0!important;overflow-y:auto!important;border-right:2px solid #f0f0f0!important;border-bottom:none!important;display:flex!important;flex-direction:column!important;padding:0!important;box-shadow:2px 0 12px rgba(0,0,0,0.06)!important;box-sizing:border-box!important}'+
'.app-nav-tabs{flex-direction:column!important;overflow:visible!important;gap:0!important;padding:0!important;margin:0!important;border-bottom:none!important}'+
'.app-nav-tabs button{width:100%!important;text-align:left!important;border-radius:0!important;border-bottom:none!important;border-right:3px solid transparent!important;padding:13px 20px!important;font-size:13px!important}'+
'.app-main-content{flex:1!important;min-width:0!important;max-width:none!important;padding:28px 32px 60px!important;box-sizing:border-box!important}'+
'.app-main-content .rvtabs-sticky{top:0!important}'+
'.dash-grid-2{grid-template-columns:repeat(4,1fr)!important}'+
'}'+
'@media(min-width:768px) and (max-width:1199px){'+
'.app-header{width:190px!important}'+
'.dash-grid-2{grid-template-columns:repeat(3,1fr)!important}'+
'.app-main-content{padding:20px 24px 40px!important}'+
'}'
const InjectCSS=()=>{useEffect(()=>{const el=Object.assign(document.createElement('style'),{id:'easymed-resp',textContent:RESP_CSS});document.head.appendChild(el);return()=>el.remove()},[]);return null}
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
const DBtn=({children,onClick,confirmText})=><button style={S.dbtn} onClick={()=>{
  const msg=confirmText||'Are you sure you want to delete this? This cannot be undone.'
  if(window.confirm(msg))onClick&&onClick()
}}>{children}</button>
const Pill=({label,bg='#e5e7eb',tx='#555'})=><span style={{fontSize:10,padding:'2px 7px',borderRadius:20,background:bg,color:tx,fontWeight:700,marginLeft:4}}>{label}</span>
const TypeTag=({t})=>{const [bg,tx]=TC[t]||['#f0f0f0','#555'];const it=ITYPES.find(x=>x.key===t);return<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:bg,color:tx,fontWeight:700}}>{it?.label||t}</span>}
const cleanNotes=n=>{
  if(!n)return ''
  if(n.indexOf('[splits:')>=0)return ''
  if(n.indexOf('SPL:')>=0)return n.slice(0,n.indexOf('SPL:')).trim()
  return n.trim()
}
const PAY_STYLE={cash:{bg:'#dcfce7',color:'#16a34a',label:'Cash'},upi:{bg:'#dbeafe',color:'#1d4ed8',label:'UPI'},card:{bg:'#f3e8ff',color:'#7c3aed',label:'Card'},bank:{bg:'#e0f2fe',color:'#0369a1',label:'Bank'},insurance:{bg:'#fef9c3',color:'#854d0e',label:'Insurance'},credit:{bg:'#fed7aa',color:'#c2410c',label:'Credit'},discount:{bg:'#ede9fe',color:'#6d28d9',label:'Discount'},written_off:{bg:'#f3f4f6',color:'#6b7280',label:'Written Off'}}
const PayBadges=({e,cr})=>{
  if(cr)return<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#fed7aa',color:'#c2410c',fontWeight:700}}>⏳ Credit</span>
  return(<span style={{display:'inline-flex',gap:4,flexWrap:'wrap'}}><span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:PAY_STYLE[e.payment]?.bg||'#f0f0f0',color:PAY_STYLE[e.payment]?.color||'#555',fontWeight:700}}>{PAY_STYLE[e.payment]?.label||e.payment}</span></span>)
}
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
const RETAINED_CATS=['comm_retained_clinical','comm_retained_lab']
const isRetainedCat=(k)=>k==='comm_retained_clinical'||k==='comm_retained_lab'
const deductCommSplit=async(actions,docName,date,clinAmt,labAmt)=>{
  if(clinAmt>0)await actions.addExpense({id:uid(),date,category:'comm_retained_clinical',amount:Math.round(clinAmt),description:docName,payment:'adjustment',is_monthly:false})
  if(labAmt>0)await actions.addExpense({id:uid(),date,category:'comm_retained_lab',amount:Math.round(labAmt),description:docName,payment:'adjustment',is_monthly:false})
}
const DeductCommForm=({docName,balance,db,onSave,onCancel})=>{
  const [date,setDate]=useState(todayStr())
  const [pay,setPay]=useState('cash')
  const clEarned=(db?.income||[]).filter(e=>e.ref_doctor===docName&&incomeSegment(e.type)==='clinical').reduce((a,e)=>a+getComm(e),0)
  const lbEarned=(db?.income||[]).filter(e=>e.ref_doctor===docName&&incomeSegment(e.type)==='lab').reduce((a,e)=>a+getComm(e),0)
  const tot=clEarned+lbEarned
  const clDue=tot>0?Math.round(balance*clEarned/tot):Math.round(balance)
  const lbDue=Math.round(balance)-clDue
  const [gClin,setGClin]=useState('')
  const [gLab,setGLab]=useState('')
  const [busy,setBusy]=useState(false)
  const g1=parseFloat(gClin)||0,g2=parseFloat(gLab)||0
  const d1=Math.max(0,clDue-g1),d2=Math.max(0,lbDue-g2)
  const give=g1+g2,ded=d1+d2
  const go=async()=>{
    if(give<=0&&!window.confirm('You are giving Rs 0 — the ENTIRE due of '+fmt(balance)+' will be deducted (nothing paid). Continue?'))return
    if(give>0&&!window.confirm('Settle Dr. '+docName+'?\n\nPay now: '+fmt(give)+' ('+fmt(g1)+' clinical + '+fmt(g2)+' lab)\nDeduct (kept by hospital): '+fmt(ded)+'\nDoctor due after: '+fmt(Math.max(0,Math.round(balance)-give-ded))))return
    setBusy(true);await onSave(g1,g2,d1,d2,date,pay);setBusy(false)
  }
  return(
    <div style={{background:'#fffbeb',borderRadius:10,padding:'12px 14px',border:'1px solid #fde68a',marginTop:10}}>
      <div style={{fontSize:12,fontWeight:700,color:'#92400e',marginBottom:4}}>Settle commission — Dr. {docName}</div>
      <div style={{fontSize:11,color:'#a16207',marginBottom:8}}>Enter what you are GIVING from each side. The rest of the due is deducted automatically.</div>
      <div style={{fontSize:10.5,color:'#a16207',marginBottom:8,background:'#fef3c7',borderRadius:6,padding:'5px 8px'}}>Due split — 🏥 Clinical: <b>{fmt(clDue)}</b> · 🧪 Lab: <b>{fmt(lbDue)}</b></div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
        <div><label style={{display:'block',fontSize:9,color:'#a16207',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>🏥 Giving from Clinical (Rs)</label><input type="number" inputMode="numeric" value={gClin} onChange={e=>setGClin(e.target.value)} placeholder={'Due: '+clDue} style={{width:'100%',padding:'9px 10px',border:'1.5px solid #fcd34d',borderRadius:8,fontSize:14,fontWeight:700,boxSizing:'border-box',outline:'none'}}/></div>
        <div><label style={{display:'block',fontSize:9,color:'#a16207',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>🧪 Giving from Lab (Rs)</label><input type="number" inputMode="numeric" value={gLab} onChange={e=>setGLab(e.target.value)} placeholder={'Due: '+lbDue} style={{width:'100%',padding:'9px 10px',border:'1.5px solid #fcd34d',borderRadius:8,fontSize:14,fontWeight:700,boxSizing:'border-box',outline:'none'}}/></div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
        <div><label style={{display:'block',fontSize:9,color:'#a16207',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{width:'100%',padding:'9px 10px',border:'1.5px solid #fcd34d',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none'}}/><div style={{fontSize:9.5,color:'#a16207',marginTop:3,lineHeight:1.4}}>Tip: date it when the commission arose (e.g. discharge date).</div></div>
        <div><label style={{display:'block',fontSize:9,color:'#a16207',fontWeight:700,textTransform:'uppercase',marginBottom:3}}>Payment mode</label><select value={pay} onChange={e=>setPay(e.target.value)} style={{width:'100%',padding:'9px 10px',border:'1.5px solid #fcd34d',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none',background:'#fff'}}>{['cash','upi','bank','card'].map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}</select></div>
      </div>
      <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'8px 10px',marginBottom:10,fontSize:11.5,lineHeight:1.6}}>
        <div style={{fontWeight:800,color:'#15803d'}}>You pay now: {fmt(give)}</div>
        <div style={{color:'#92400e',fontWeight:700}}>Auto-deducted (kept): {fmt(ded)} <span style={{fontWeight:600,color:'#a16207'}}>(🏥 {fmt(d1)} + 🧪 {fmt(d2)})</span></div>
        <div style={{color:'#475569'}}>Doctor due after: <b>{fmt(Math.max(0,Math.round(balance)-give-ded))}</b></div>
      </div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={onCancel} style={{flex:1,padding:'9px',background:'#fff',border:'1px solid #fde68a',borderRadius:8,fontSize:12,fontWeight:600,cursor:'pointer'}}>Cancel</button>
        <button onClick={go} disabled={busy} style={{flex:2,padding:'9px',background:'#d97706',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:800,cursor:busy?'not-allowed':'pointer'}}>{busy?'Saving...':'Settle (pay + deduct)'}</button>
      </div>
    </div>)
}
const settleRefPayment=async(db,actions,docName,amt,date,pay,settleAmt)=>{
  if(amt>0)await actions.addExpense({id:uid(),date,category:'ref_paid',amount:amt,description:docName,payment:pay,is_monthly:false})
  if(settleAmt>0){
    const dEnts=(db.income||[]).filter(e=>e.ref_doctor===docName)
    const cl=dEnts.filter(e=>incomeSegment(e.type)==='clinical').reduce((a,e)=>a+getComm(e),0)
    const lb=dEnts.filter(e=>incomeSegment(e.type)==='lab').reduce((a,e)=>a+getComm(e),0)
    const tot=cl+lb
    const clAmt=tot>0?Math.round(settleAmt*cl/tot):Math.round(settleAmt)
    const lbAmt=Math.round(settleAmt)-clAmt
    if(clAmt>0)await actions.addExpense({id:uid(),date,category:'comm_retained_clinical',amount:clAmt,description:docName,payment:'adjustment',is_monthly:false})
    if(lbAmt>0)await actions.addExpense({id:uid(),date,category:'comm_retained_lab',amount:lbAmt,description:docName,payment:'adjustment',is_monthly:false})
  }
}
const CommPayForm=({docName,balance,onSave,onCancel})=>{
  const [date,setDate]=useState(todayStr())
  const [amount,setAmount]=useState(String(Math.round(balance)))
  const [pay,setPay]=useState('cash')
  const [busy,setBusy]=useState(false)
  const go=async()=>{
    const amt=parseFloat(amount);if(!amt||amt<=0){alert('Enter amount');return}
    setBusy(true);await onSave(amt,date,pay,0);setBusy(false)
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


/*  SUPER ADMIN PREVIEW APP  */
const PreviewApp=({db,hospital,onExit})=>{
  const canSeeReports=true
  if(!db||!hospital)return null
  const [tab,setTab]=useState('rep')
  const [rv,setRv]=useState('daily')
  const [rd,setRd]=useState(todayStr())
  const [rm,setRm]=useState(todayStr().slice(0,7))
  const [ry,setRy]=useState(todayStr().slice(0,4))
  const [ipv,setIpv]=useState('list')
  const [ipid,setIpid]=useState('')
  const [prevTab,setPrevTab]=useState(null)
  const [opNavSearch,setOpNavSearch]=useState('')
  const [opPrevTab,setOpPrevTab]=useState(null)
  const gotoIP=useCallback((pid,from=null)=>{if(from)setPrevTab(from);setIpid(pid);setIpv('detail');setTab('ip')},[])
  const gotoOP=useCallback((name,from=null)=>{if(from)setOpPrevTab(from);setOpNavSearch(name||'');setTab('op')},[])
  const yrs=[...new Set((db.income||[]).map(e=>e.date?.slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a))
  const allPaidComm=useMemo(()=>(db.expenses||[]).filter(e=>e.category==='ref_paid'),[db.expenses])
  const fakeActions={editIncome:async()=>false,addIncome:async()=>{alert('Read-only preview');return false},admitPatient:async()=>{alert('Read-only preview');return false},dischargePatient:async()=>{alert('Read-only preview')},undoDischarge:async()=>{alert('Read-only preview')},updateIPPatient:async()=>{alert('Read-only preview');return false},deleteIncome:async()=>{alert('Read-only preview')},addExpense:async()=>{alert('Read-only preview');return false},addCustomCategory:async()=>{alert('Read-only preview');return false},delExpense:async()=>{alert('Read-only preview')},updateExpense:async()=>{alert('Read-only preview')},addEmployee:async()=>{alert('Read-only preview');return false},updateEmployee:async()=>{alert('Read-only preview');return false},deleteEmployee:async()=>{alert('Read-only preview');return false},markAttendance:async()=>{alert('Read-only preview');return false},paySalary:async()=>{alert('Read-only preview');return false},deleteSalaryPayment:async()=>{alert('Read-only preview');return false}}
  const PTABS=[{k:'dash',l:'Dashboard'},{k:'rep',l:'Reports'},{k:'ip',l:'IP Patients'},{k:'op',l:'OP Patients'}]
  return(
    <div style={{background:'#f8fafc',minHeight:'100vh'}}>
      <div style={{background:'#dc2626',color:'#fff',padding:'8px 16px',fontSize:12,fontWeight:700,display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,zIndex:1000}}>
        <span>SUPER ADMIN PREVIEW - {hospital.name}</span>
        <button onClick={onExit} style={{background:'rgba(255,255,255,0.2)',border:'none',color:'#fff',borderRadius:8,padding:'4px 12px',fontSize:12,fontWeight:700,cursor:'pointer'}}>Exit preview</button>
      </div>
      <div style={{background:'#fff',borderBottom:'1px solid #f0f0f0',padding:'10px 16px',display:'flex',gap:8,overflowX:'auto'}}>
        {PTABS.map(t=>(<button key={t.k} onClick={()=>setTab(t.k)} style={{padding:'7px 16px',borderRadius:20,border:'none',background:tab===t.k?'#16a34a':'#f1f5f9',color:tab===t.k?'#fff':'#64748b',fontSize:13,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>{t.l}</button>))}
      </div>
      <div style={{padding:'16px'}}>
        {tab==='dash'&&<AnalyticsDash db={db}/>}
        {tab==='rep'&&canSeeReports&&<RepTab canSeeReports={canSeeReports} db={db} rv={rv} setRv={setRv} rd={rd} setRd={setRd} rm={rm} setRm={setRm} ry={ry} setRy={setRy} gotoIP={gotoIP} gotoOP={gotoOP} actions={fakeActions}/>}
        {tab==='ip'&&<div style={{display:'block'}}><IPTab db={db} actions={fakeActions} gotoOP={name=>gotoOP(name,'ip')} ipv={ipv} setIpv={setIpv} ipid={ipid} setIpid={setIpid} pF={{name:'',adm:todayStr(),dx:'',room:'',ref:'',is_package:false,phone:'',patient_type:'Regular',custom_commission:'',linkedRegNo:'',patient_area:''}} setPF={()=>{}} cF={{}} setCF={()=>{}} pyF={{}} setPyF={()=>{}} gotoIP={gotoIP} prevTab={prevTab} setPrevTab={setPrevTab} setTab={setTab} setEditIPPatient={()=>alert('Read-only preview')}/></div>}
        {tab==='op'&&canSeeReports&&<OPTab db={db} actions={fakeActions} opSearch={opNavSearch} setOpSearch={setOpNavSearch} opPrevTab={opPrevTab} setOpPrevTab={setOpPrevTab} setTab={setTab} gotoIP={pid=>gotoIP(pid,'op')}/>}
      </div>
    </div>
  )
}

/*  SUPER ADMIN DASHBOARD  */
const SuperAdminDashboard=({onPreview=null})=>{
  const [hospitals,setHospitals]=useState([])
  const [loading,setLoading]=useState(true)
  const [isWide,setIsWide]=useState(()=>typeof window!=='undefined'&&window.innerWidth>=900)
  useEffect(()=>{const on=()=>setIsWide(window.innerWidth>=900);window.addEventListener('resize',on);return()=>window.removeEventListener('resize',on)},[])
  const [sortBy,setSortBy]=useState('created')
  const [sortDir,setSortDir]=useState('desc')
  const daysLeft=(h)=>{if(!h.plan_end)return null;return Math.ceil((new Date(h.plan_end+'T00:00:00').getTime()-Date.now())/86400000)}
  const [view,setView]=useState('list')
  const [sel,setSel]=useState(null)
  const [selUsers,setSelUsers]=useState([])
  const [hospData,setHospData]=useState(null)
  const [dataLoading,setDataLoading]=useState(false)
  const [saSearch,setSaSearch]=useState('')
  const [cityFilter,setCityFilter]=useState('all')
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
      supabase.from('income').select('id,date,type,amount,patient_name,ref_doctor,payment,consultant_fee,reg_no,patient_id,notes').eq('hospital_id',h.id).order('date',{ascending:false}).limit(500),
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
  const grantTrialDays=async(id,days)=>{const end=new Date(Date.now()+days*86400000).toISOString().split('T')[0];await supabase.from('hospitals').update({plan:'trial',plan_end:end,is_active:true,comped:false}).eq('id',id);load();if(sel)setSel({...sel,plan:'trial',plan_end:end,is_active:true,comped:false})}
  const setComped=async(id,val,note)=>{const upd={comped:val,is_active:true};if(note!=null)upd.override_note=note;if(val)upd.plan_end='2099-12-31';await supabase.from('hospitals').update(upd).eq('id',id);load();if(sel)setSel({...sel,...upd})}
  const saveOverrideNote=async(id,note)=>{await supabase.from('hospitals').update({override_note:note}).eq('id',id);if(sel)setSel({...sel,override_note:note})}
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
  if(view==='hospdata'&&sel&&hospData)return(
    <div style={{background:'#f8fafc',minHeight:'100vh'}}>
      <div style={{background:'#111',color:'#fff',padding:'14px 16px',display:'flex',alignItems:'center',gap:12,position:'sticky',top:0,zIndex:10}}>
        <button onClick={()=>setView('detail')} style={{color:'#9ca3af',background:'none',border:'1px solid #374151',borderRadius:8,padding:'5px 10px',fontSize:12,cursor:'pointer'}}>Back</button>
        <div style={{flex:1}}><div style={{fontSize:14,fontWeight:700}}>{sel.name}</div><div style={{fontSize:10,color:'#9ca3af'}}>Data summary</div></div>
      </div>
      <div style={{padding:'16px'}}>
        {(()=>{
          const inc=hospData.income||[]
          const exp=(hospData.expenses||[]).filter(e=>e.category!=='ref_paid')
          const thisMonth=new Date().toISOString().slice(0,7)
          const mInc=inc.filter(e=>e.date?.startsWith(thisMonth))
          const allGross=inc.reduce((a,e)=>a+(e.amount||0),0)
          const mGross=mInc.reduce((a,e)=>a+(e.amount||0),0)
          const mExp=exp.filter(e=>e.date?.startsWith(thisMonth)).reduce((a,e)=>a+(e.amount||0),0)
          const activeIP=(hospData.ip_patients||[]).filter(p=>!p.discharge_date).length
          const totalIP=(hospData.ip_patients||[]).length
          const owedComm=inc.reduce((a,e)=>a+getComm(e),0)
          const paidComm=(hospData.expenses||[]).filter(e=>e.category==='ref_paid').reduce((a,e)=>a+(e.amount||0),0)
          const cards=[
            {l:'This month income',v:fmt(mGross),c:'#16a34a',bg:'#f0fdf4'},
            {l:'This month expenses',v:fmt(mExp),c:'#dc2626',bg:'#fef2f2'},
            {l:'All-time income',v:fmt(allGross),c:'#0891b2',bg:'#f0f9ff'},
            {l:'Active IP patients',v:activeIP+' / '+totalIP+' total',c:'#7c3aed',bg:'#fdf4ff'},
            {l:'Commission owed',v:fmt(owedComm),c:'#d97706',bg:'#fffbeb'},
            {l:'Commission paid',v:fmt(paidComm),c:'#16a34a',bg:'#f0fdf4'},
          ]
          return(<>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:20}}>
              {cards.map((m,i)=>(<div key={i} style={{background:m.bg,borderRadius:12,padding:'14px'}}>
                <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>{m.l}</div>
                <div style={{fontSize:18,fontWeight:800,color:m.c}}>{m.v}</div>
              </div>))}
            </div>
            <div style={{fontWeight:700,fontSize:14,marginBottom:8,color:'#0f172a'}}>Recent income (last 20)</div>
            <Card>{inc.slice(0,20).map((e,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #f5f5f5'}}>
              <div><div style={{fontSize:13,fontWeight:600}}>{e.patient_name||'Patient'}</div><div style={{fontSize:11,color:'#94a3b8'}}>{e.date} - {e.type}{e.ref_doctor?' | '+e.ref_doctor:''}</div></div>
              <div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(e.amount)}</div>
            </div>))}
            {inc.length===0&&<div style={{textAlign:'center',padding:'20px',color:'#ccc'}}>No income yet</div>}</Card>
            <div style={{fontWeight:700,fontSize:14,margin:'16px 0 8px',color:'#0f172a'}}>IP Patients (last 10)</div>
            <Card>{(hospData.ip_patients||[]).slice(0,10).map((p,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid #f5f5f5'}}>
              <div><div style={{fontSize:13,fontWeight:600}}>{p.name}</div><div style={{fontSize:11,color:'#94a3b8'}}>Admitted: {p.admission_date}{p.ref_doctor?' | '+p.ref_doctor:''}</div></div>
              <div style={{fontSize:11,fontWeight:700,color:p.discharge_date?'#94a3b8':'#16a34a'}}>{p.discharge_date?'Discharged':'Active'}</div>
            </div>))}
            {(hospData.ip_patients||[]).length===0&&<div style={{textAlign:'center',padding:'20px',color:'#ccc'}}>No IP patients yet</div>}</Card>
          </>)
        })()}
      </div>
    </div>
  )
  if(view==='detail'&&sel)return(
    <div style={{maxWidth:isWide?900:520,margin:'0 auto',background:'#f8fafc',minHeight:'100vh'}}>
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
        <SecL>⏳ Trial / Access override</SecL>
        <Card style={{marginBottom:14,border:'1px solid #e0e7ff'}}>
          {(()=>{const dl=sel.plan_end?Math.ceil((new Date(sel.plan_end+'T00:00:00').getTime()-Date.now())/86400000):null;return(
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12,paddingBottom:12,borderBottom:'1px solid #f1f5f9'}}>
              <div><div style={{fontSize:11,color:'#94a3b8',fontWeight:700,textTransform:'uppercase'}}>Current access</div><div style={{fontSize:13,fontWeight:700,color:'#0f172a',marginTop:2}}>{sel.comped?'Free (comped)':sel.plan+' · ends '+fmtD(sel.plan_end)}</div></div>
              <div style={{textAlign:'right'}}><div style={{fontSize:22,fontWeight:900,color:sel.comped?'#4338ca':dl==null?'#cbd5e1':dl<0?'#dc2626':dl<=7?'#d97706':'#16a34a'}}>{sel.comped?'∞':dl==null?'—':dl<0?'Expired':dl+'d'}</div><div style={{fontSize:9,color:'#94a3b8',fontWeight:600}}>{sel.comped?'unlimited':'days left'}</div></div>
            </div>)})()}
          <div style={{fontSize:11,color:'#64748b',fontWeight:700,marginBottom:6}}>Grant trial from today:</div>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
            {[7,14,30,45,60,90].map(d=>(<button key={d} onClick={()=>{if(window.confirm('Grant '+d+'-day trial to '+sel.name+'? Access will run from today for '+d+' days.'))grantTrialDays(sel.id,d)}} style={{padding:'8px 14px',background:'#eef2ff',border:'1.5px solid #c7d2fe',borderRadius:10,fontSize:13,fontWeight:700,color:'#4338ca',cursor:'pointer'}}>+{d}d</button>))}
          </div>
          <div style={{fontSize:11,color:'#64748b',fontWeight:700,marginBottom:6}}>Or set custom end date:</div>
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            <input id="ovDate" type="date" defaultValue={sel.plan_end||''} style={{flex:1,padding:'9px 12px',border:'1.5px solid #cbd5e1',borderRadius:10,fontSize:14}}/>
            <button onClick={async()=>{const d=document.getElementById('ovDate').value;if(!d){alert('Pick a date');return}await supabase.from('hospitals').update({plan_end:d,is_active:true,comped:false}).eq('id',sel.id);setSel({...sel,plan_end:d,is_active:true,comped:false});load();alert('Access extended to '+fmtD(d))}} style={{padding:'9px 16px',background:'#16a34a',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer'}}>Set</button>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:12}}>
            {!sel.comped?<button onClick={()=>{if(window.confirm('Grant FREE unlimited access to '+sel.name+'?\n\nThey will never be asked to pay and access never expires until you turn this off.'))setComped(sel.id,true,null)}} style={{flex:1,padding:'11px',background:'#4338ca',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer'}}>🎁 Grant free unlimited access</button>
            :<button onClick={()=>{if(window.confirm('Remove free access for '+sel.name+'? They will go back to normal plan/trial expiry.'))setComped(sel.id,false,null)}} style={{flex:1,padding:'11px',background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer'}}>Remove free access</button>}
          </div>
          <div style={{fontSize:11,color:'#64748b',fontWeight:700,marginBottom:4}}>Override note (why comped/extended):</div>
          <textarea id="ovNote" defaultValue={sel.override_note||''} placeholder="e.g. Partner hospital, 3-month pilot agreed with Dr X" rows={2} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #cbd5e1',borderRadius:10,fontSize:13,fontFamily:'inherit',outline:'none',boxSizing:'border-box',resize:'vertical'}}/>
          <button onClick={()=>{const n=document.getElementById('ovNote').value;saveOverrideNote(sel.id,n);alert('Note saved')}} style={{marginTop:8,padding:'8px 14px',background:'#f1f5f9',border:'none',borderRadius:8,fontSize:12,fontWeight:700,color:'#475569',cursor:'pointer'}}>Save note</button>
        </Card>
        <SecL>Extend plan</SecL>
        <div style={{display:'flex',gap:8,marginBottom:8}}>
          <input id="extDate" type="date" defaultValue={sel.plan_end||''} style={{flex:1,padding:'10px 12px',border:'1px solid #e5e7eb',borderRadius:10,fontSize:14}} placeholder="Pick end date"/>
          <button onClick={async()=>{const d=document.getElementById('extDate').value;if(!d){alert('Pick a date');return}await supabase.from('hospitals').update({plan_end:d,is_active:true}).eq('id',sel.id);setSel({...sel,plan_end:d,is_active:true});load();alert('Plan extended to '+d)}} style={{padding:'10px 16px',background:'#16a34a',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer'}}>Extend</button>
        </div>
        <button onClick={async()=>{await supabase.from('hospitals').update({is_active:true}).eq('id',sel.id);setSel({...sel,is_active:true});load();alert('Hospital activated')}} style={{width:'100%',padding:'11px',background:'#f0fdf4',color:'#16a34a',border:'1px solid #bbf7d0',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer',marginBottom:8}}>Force Activate</button>
        <SecL>Preview</SecL>
        <button onClick={async()=>{
          setDataLoading(true)
          const [inc,exp,pts,rds,cons]=await Promise.all([
            supabase.from('income').select('id,date,type,amount,patient_id,patient_name,ref_doctor,payment,notes,consultant_fee,consultant_name,op_type,custom_commission,reg_no,patient_area,patient_phone,speciality,entered_by,conditions').eq('hospital_id',sel.id).order('date',{ascending:false}).limit(2000),
            supabase.from('expenses').select('id,date,category,amount,description,payment,is_monthly').eq('hospital_id',sel.id).order('date',{ascending:false}),
            supabase.from('ip_patients').select('*').eq('hospital_id',sel.id).order('admission_date',{ascending:false}),
            supabase.from('ref_doctors').select('*').eq('hospital_id',sel.id),
            supabase.from('consultants').select('*').eq('hospital_id',sel.id)
          ])
          setDataLoading(false)
          if(onPreview)onPreview(sel,{income:inc.data||[],expenses:exp.data||[],ip_patients:pts.data||[],ref_doctors:rds.data||[],consultants:cons.data||[]})
          else alert('Preview not available - reload the page')
        }} style={{width:'100%',padding:'12px',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:12,fontSize:14,fontWeight:700,cursor:'pointer',marginBottom:8}}>{dataLoading?'Loading data...':'Preview as Admin'}</button>
        <GBtn onClick={()=>loadHospData(sel)}>View hospital data (summary)</GBtn>
      </div>
    </div>
  )
  return(
    <div style={{maxWidth:isWide?1200:520,margin:'0 auto',background:'#f8fafc',minHeight:'100vh'}}>
      <div style={{background:'#111',color:'#fff',padding:'14px 16px 0',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div><div style={{fontWeight:700,fontSize:15}}> Super Admin</div><div style={{fontSize:11,color:'#9ca3af',marginTop:2}}>All hospitals</div></div>
          <button onClick={()=>supabase.auth.signOut()} style={{color:'#9ca3af',background:'none',border:'1px solid #374151',borderRadius:8,padding:'5px 10px',fontSize:12,cursor:'pointer'}}>Logout</button>
        </div>
        <div style={{padding:'8px 12px',background:'#111',borderBottom:'1px solid #1f2937'}}>
          <input value={saSearch} onChange={e=>setSaSearch(e.target.value)} placeholder="Search hospital or city..." style={{width:'100%',padding:'7px 12px',borderRadius:10,border:'1px solid #374151',background:'#1f2937',color:'#fff',fontSize:13,outline:'none',marginBottom:6}}/>
          <div style={{display:'flex',gap:5,overflowX:'auto'}}>
            {['all',...[...new Set(hospitals.map(h=>h.city).filter(Boolean))].sort()].map(city=>(<button key={city} onClick={()=>setCityFilter(city)} style={{padding:'3px 10px',borderRadius:20,border:'none',background:cityFilter===city?'#16a34a':'#374151',color:cityFilter===city?'#fff':'#9ca3af',fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>{city==='all'?'All':city}</button>))}
          </div>
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
          {(()=>{
            if(loading)return<div style={{textAlign:'center',padding:32,color:'#ccc'}}>Loading...</div>
            const q=(saSearch||'').toLowerCase()
            let rows=hospitals.filter(h=>(!q||h.name?.toLowerCase().includes(q)||h.city?.toLowerCase().includes(q))&&(cityFilter==='all'||h.city===cityFilter))
            const dir=sortDir==='asc'?1:-1
            rows=[...rows].sort((a,b)=>{
              let av,bv
              if(sortBy==='name'){av=(a.name||'').toLowerCase();bv=(b.name||'').toLowerCase()}
              else if(sortBy==='city'){av=(a.city||'').toLowerCase();bv=(b.city||'').toLowerCase()}
              else if(sortBy==='plan'){av=a.plan||'';bv=b.plan||''}
              else if(sortBy==='days'){av=daysLeft(a)??-99999;bv=daysLeft(b)??-99999}
              else if(sortBy==='status'){av=a.is_active?1:0;bv=b.is_active?1:0}
              else{av=a.created_at||'';bv=b.created_at||''}
              return av<bv?-1*dir:av>bv?1*dir:0
            })
            if(rows.length===0)return<div style={{textAlign:'center',padding:'40px 0',color:'#ccc',fontSize:13}}>No hospitals found</div>
            if(!isWide){
              return rows.map(h=>{const dl=daysLeft(h);return(
                <Card key={h.id} style={{cursor:'pointer'}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}} onClick={()=>openHosp(h)}>
                    <div><div style={{fontSize:14,fontWeight:700}}>{h.name}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>{h.city||'-'} · {fmtD(h.created_at?.split('T')[0])}</div><div style={{marginTop:6,display:'flex',gap:6,flexWrap:'wrap',alignItems:'center'}}><span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:(planClr[h.plan]||planClr.trial)[0],color:(planClr[h.plan]||planClr.trial)[1],fontWeight:700}}>{h.plan}</span>{h.comped&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#e0e7ff',color:'#4338ca',fontWeight:700}}>COMPED</span>}{!h.is_active&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#fee2e2',color:'#dc2626',fontWeight:700}}>Suspended</span>}{dl!=null&&!h.comped&&<span style={{fontSize:10,fontWeight:700,color:dl<0?'#dc2626':dl<=7?'#d97706':'#16a34a'}}>{dl<0?'Expired '+(-dl)+'d ago':dl+'d left'}</span>}</div></div>
                    <span style={{fontSize:18,color:'#aaa'}}>›</span>
                  </div>
                </Card>)})
            }
            // DESKTOP TABLE
            const Th=({k,label,align})=>(<th onClick={()=>{if(sortBy===k)setSortDir(sortDir==='asc'?'desc':'asc');else{setSortBy(k);setSortDir('asc')}}} style={{textAlign:align||'left',padding:'10px 12px',fontSize:11,fontWeight:800,color:'#64748b',textTransform:'uppercase',letterSpacing:'.4px',cursor:'pointer',userSelect:'none',whiteSpace:'nowrap'}}>{label}{sortBy===k?(sortDir==='asc'?' ▲':' ▼'):''}</th>)
            return(<div style={{background:'#fff',borderRadius:14,overflow:'hidden',border:'1px solid #eef2f7'}}>
              <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                <thead><tr style={{borderBottom:'2px solid #f1f5f9',background:'#fafbfc'}}>
                  <Th k="name" label="Hospital"/><Th k="city" label="City"/><Th k="plan" label="Plan"/><Th k="status" label="Status"/>
                  <Th k="days" label="Days left" align="right"/><th style={{textAlign:'right',padding:'10px 12px',fontSize:11,fontWeight:800,color:'#64748b',textTransform:'uppercase'}}>Plan end</th><Th k="created" label="Created" align="right"/>
                </tr></thead>
                <tbody>
                  {rows.map(h=>{const dl=daysLeft(h);return(<tr key={h.id} onClick={()=>openHosp(h)} style={{borderBottom:'1px solid #f5f7fa',cursor:'pointer'}} onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                    <td style={{padding:'11px 12px',fontWeight:700,color:'#0f172a'}}>{h.name}{h.comped&&<span style={{fontSize:9,padding:'1px 6px',borderRadius:20,background:'#e0e7ff',color:'#4338ca',fontWeight:700,marginLeft:6}}>COMPED</span>}</td>
                    <td style={{padding:'11px 12px',color:'#64748b'}}>{h.city||'—'}</td>
                    <td style={{padding:'11px 12px'}}><span style={{fontSize:11,padding:'3px 9px',borderRadius:20,background:(planClr[h.plan]||planClr.trial)[0],color:(planClr[h.plan]||planClr.trial)[1],fontWeight:700}}>{h.plan}</span></td>
                    <td style={{padding:'11px 12px'}}>{h.is_active?<span style={{color:'#16a34a',fontWeight:700,fontSize:12}}>● Active</span>:<span style={{color:'#dc2626',fontWeight:700,fontSize:12}}>● Suspended</span>}</td>
                    <td style={{padding:'11px 12px',textAlign:'right',fontWeight:700,color:h.comped?'#4338ca':dl==null?'#cbd5e1':dl<0?'#dc2626':dl<=7?'#d97706':'#16a34a'}}>{h.comped?'∞':dl==null?'—':dl<0?'Expired':dl+'d'}</td>
                    <td style={{padding:'11px 12px',textAlign:'right',color:'#64748b'}}>{fmtD(h.plan_end)}</td>
                    <td style={{padding:'11px 12px',textAlign:'right',color:'#94a3b8'}}>{fmtD(h.created_at?.split('T')[0])}</td>
                  </tr>)})}
                </tbody>
              </table>
            </div>)
          })()}
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
  const [showForgot,setShowForgot]=useState(false)
  const [fpEmail,setFpEmail]=useState('')
  const [fpMsg,setFpMsg]=useState('')
  const [fpBusy,setFpBusy]=useState(false)
  const sendReset=async()=>{
    const em=fpEmail.trim()
    if(!em){setFpMsg('Enter your email or username');return}
    const isRealEmail=em.includes('@')&&!/@(omhospital\.app|easymedicalsolutions\.in)$/i.test(em)
    if(!isRealEmail){
      setFpMsg('⚠️ This looks like a username or an internal login (not a real inbox). Password reset links can only be sent to a real email address. Please ask your hospital admin to reset it, or if you are the admin, reset it from the Users section after logging in.')
      return
    }
    setFpBusy(true);setFpMsg('')
    const {error}=await supabase.auth.resetPasswordForEmail(em,{redirectTo:window.location.origin})
    setFpBusy(false)
    if(error){setFpMsg('Could not send: '+error.message)}
    else{setFpMsg('✅ If an account exists for '+em+', a password reset link has been sent. Check your inbox (and spam).')}
  }
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
            <button onClick={()=>{setShowForgot(true);setFpEmail(username.includes('@')?username:'');setFpMsg('')}} style={{fontSize:12.5,color:'rgba(255,255,255,0.55)',background:'none',border:'none',cursor:'pointer',fontWeight:600,padding:'2px',marginTop:2}}>Forgot password?</button>
          </div>

          {showForgot&&<div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.7)',zIndex:400,display:'flex',alignItems:'center',justifyContent:'center',padding:18}} onClick={()=>setShowForgot(false)}>
            <div onClick={e=>e.stopPropagation()} style={{background:'#0f2044',border:'1px solid rgba(255,255,255,0.12)',borderRadius:16,width:'100%',maxWidth:400,padding:'24px 22px'}}>
              <div style={{fontSize:17,fontWeight:800,color:'#fff',marginBottom:6}}>Reset password</div>
              <div style={{fontSize:12.5,color:'rgba(255,255,255,0.5)',marginBottom:16,lineHeight:1.5}}>Enter the email address for your account. We'll send a reset link if it's a real inbox.</div>
              <input type="email" placeholder="you@example.com" value={fpEmail} onChange={e=>setFpEmail(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendReset()} style={{width:'100%',padding:'13px 14px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,fontSize:15,color:'#fff',fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:12}}/>
              {fpMsg&&<div style={{fontSize:12,color:fpMsg.startsWith('✅')?'#00e87f':fpMsg.startsWith('⚠️')?'#fcd34d':'#fca5a5',marginBottom:12,lineHeight:1.5,background:'rgba(255,255,255,0.04)',padding:'10px 12px',borderRadius:8}}>{fpMsg}</div>}
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>setShowForgot(false)} style={{flex:1,padding:'12px',background:'rgba(255,255,255,0.08)',border:'none',borderRadius:10,fontSize:13.5,fontWeight:700,color:'#fff',cursor:'pointer'}}>Close</button>
                <button onClick={sendReset} disabled={fpBusy} style={{flex:2,padding:'12px',background:fpBusy?'rgba(0,192,107,0.3)':'linear-gradient(135deg,#00c06b,#00e87f)',color:'#0a1628',border:'none',borderRadius:10,fontSize:13.5,fontWeight:800,cursor:fpBusy?'not-allowed':'pointer'}}>{fpBusy?'Sending...':'Send reset link'}</button>
              </div>
              <div style={{fontSize:10.5,color:'rgba(255,255,255,0.3)',marginTop:14,lineHeight:1.5}}>Staff with internal usernames (no real email): ask your hospital admin to reset your password from the Users section.</div>
            </div>
          </div>}

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
  const [resetUid,setResetUid]=useState(null)
  const [resetPwd,setResetPwd]=useState('')
  const [resetMsg,setResetMsg]=useState('')
  const [myPwd,setMyPwd]=useState('')
  const [myPwdMsg,setMyPwdMsg]=useState('')
  const [showMyPwd,setShowMyPwd]=useState(false)
  const resetUser=users.find(x=>x.id===resetUid)||null
  const doSetPwd=()=>{if(resetPwd.length<6){setResetMsg('Min 6 characters');return};setResetMsg('Share → Login: '+resetUser.username+' | Password: '+resetPwd)}
  const doMyPwd=async()=>{if(myPwd.length<6){setMyPwdMsg('Min 6 characters');return};const{error}=await supabase.auth.updateUser({password:myPwd});if(error)setMyPwdMsg('Error: '+error.message);else{setMyPwdMsg('Password updated!');setMyPwd('');setShowMyPwd(false)}}
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
            <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
              <div style={{fontSize:11,color:'#bfdbfe',fontWeight:700,textTransform:'uppercase'}}>Your hospital</div>
              {hospital.plan&&hospital.plan!=='trial'&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:hospital.plan==='enterprise'?'linear-gradient(135deg,#d97706,#f59e0b)':hospital.plan==='pro'?'linear-gradient(135deg,#7c3aed,#a855f7)':'linear-gradient(135deg,#2563eb,#3b82f6)',color:'#fff',fontWeight:800,textTransform:'uppercase',letterSpacing:'.05em'}}>{hospital.plan==='enterprise'?'Enterprise':hospital.plan==='pro'?'Pro':'Starter'}</span>}
              {hospital.plan==='trial'&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'rgba(255,255,255,0.15)',color:'#fff',fontWeight:700}}>Trial</span>}
            </div>
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
        <><Card>{users.map(u=>{const [bg,tx]=(RC[u.role]||RC.staff);return(
          <Row key={u.id} left={<span style={{fontSize:14,fontWeight:600}}>{u.name||'-'}</span>} sub={`@${u.username||'-'}`} right={
            <div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap',justifyContent:'flex-end'}}>
              <span style={{fontSize:10,padding:'3px 9px',borderRadius:20,background:bg,color:tx,fontWeight:700}}>{u.role||'staff'}</span>
              <button onClick={()=>{setResetUid(u.id);setResetPwd('');setResetMsg('')}} style={{padding:'4px 10px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:8,fontSize:11,color:'#1d4ed8',cursor:'pointer',fontWeight:700}}>🔑 Reset</button>
              {u.id!==currentUser?.id&&<button onClick={async()=>{if(!window.confirm('Remove '+u.name+'?\n\n(This removes profile only. To fully delete login, use Supabase Auth dashboard.)'))return;const {error}=await supabase.from('profiles').delete().eq('id',u.id);if(error){alert('Delete failed: '+error.message);return}setUsers(prev=>prev.filter(x=>x.id!==u.id))}} style={{padding:'4px 10px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,fontSize:11,color:'#dc2626',cursor:'pointer',fontWeight:700}}>✕</button>}
            </div>
          }/>
        )})}</Card>
        {resetUser&&<div style={{marginTop:10,background:'#eff6ff',border:'1.5px solid #bfdbfe',borderRadius:12,padding:'14px'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#1d4ed8',marginBottom:4}}>🔑 Reset password — {resetUser.name}</div>
          <div style={{display:'flex',gap:8,marginBottom:6}}>
            <input type="text" value={resetPwd} onChange={e=>setResetPwd(e.target.value)} placeholder="New password (min 6)" style={{flex:1,padding:'9px 12px',border:'1.5px solid #bfdbfe',borderRadius:8,fontSize:13,outline:'none'}}/>
            <button onClick={doSetPwd} style={{padding:'9px 14px',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'}}>Set</button>
            <button onClick={()=>setResetUid(null)} style={{padding:'9px 12px',background:'#f0f0f0',border:'none',borderRadius:8,fontSize:12,cursor:'pointer'}}>✕</button>
          </div>
          {resetMsg&&<div style={{fontSize:12,fontWeight:700,padding:'8px 10px',background:'#dbeafe',borderRadius:8,color:'#1d4ed8'}}>{resetMsg}</div>}
        </div>}
        </>
      )}
      <div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:'12px',marginTop:12}}>
        <button onClick={()=>setShowMyPwd(p=>!p)} style={{fontSize:13,fontWeight:700,color:'#16a34a',background:'none',border:'none',cursor:'pointer',padding:0}}>🔑 Change My Password</button>
        {showMyPwd&&<div style={{marginTop:8}}>
          <div style={{display:'flex',gap:8,marginBottom:6}}>
            <input type="password" value={myPwd} onChange={e=>setMyPwd(e.target.value)} placeholder="New password (min 6)" style={{flex:1,padding:'9px 12px',border:'1.5px solid #e2e8f0',borderRadius:8,fontSize:13,outline:'none'}}/>
            <button onClick={doMyPwd} style={{padding:'9px 14px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'}}>Update</button>
          </div>
          {myPwdMsg&&<div style={{fontSize:12,fontWeight:600,color:'#16a34a'}}>{myPwdMsg}</div>}
        </div>}
      </div>
    </div>
  )
}

/*  CREDIT TAB  */
const CreditTab=({db,actions,canSeeReports})=>{
  const [collectEntry,setCollectEntry]=useState(null)
  if(collectEntry)return(<CollectCreditForm entry={collectEntry} actions={actions} db={db} onCancel={()=>setCollectEntry(null)}/>)
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
                    <button onClick={()=>setCollectEntry(e)} style={{padding:'4px 12px',background:'#16a34a',border:'none',borderRadius:8,fontSize:11,color:'#fff',cursor:'pointer',fontWeight:700,whiteSpace:'nowrap'}}>Collect</button>{canSeeReports&&<button onClick={async()=>{if(!window.confirm('Write off Rs '+e.amount+' credit for '+(e.patient_name||'this patient')+'?\n\nThis is treated as an uncollectible loss. The entry stays on record but stops counting as outstanding credit.'))return;const note='\u26A0\uFE0F Written off on '+fmtD(todayStr())+(e.notes?' \u00B7 '+e.notes:'');await actions.editIncome({...e,payment:'written_off',notes:note})}} style={{padding:'4px 12px',background:'#fff',border:'1.5px solid #dc2626',borderRadius:8,fontSize:11,color:'#dc2626',cursor:'pointer',fontWeight:700,whiteSpace:'nowrap',marginLeft:6}}>Write off</button>}
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
const CollectCreditForm=({entry,actions,db,onSave,onCancel})=>{
  const [date,setDate]=useState(todayStr())
  const [pay,setPay]=useState('cash')
  
  // Find ALL credit entries for this patient (across all types)
  const allCredits=(db?.income||[]).filter(e=>{
    if(e.payment!=='credit')return false
    // Match by patient_id if both have it
    if(entry.patient_id&&e.patient_id)return e.patient_id===entry.patient_id
    // Otherwise match by reg_no (if available)
    if(entry.reg_no&&e.reg_no)return e.reg_no===entry.reg_no
    // Fallback: match by patient name
    return (e.patient_name||'').trim().toLowerCase()===(entry.patient_name||'').trim().toLowerCase()
  }).sort((a,b)=>(a.date||'').localeCompare(b.date||''))
  const totalCredit=allCredits.reduce((a,e)=>a+e.amount,0)
  const byType={}
  allCredits.forEach(e=>{if(!byType[e.type])byType[e.type]=0;byType[e.type]+=e.amount})
  
  const [collectAmt,setCollectAmt]=useState(String(totalCredit))
  const [busy,setBusy]=useState(false)
  const collected=parseFloat(collectAmt)||0
  const remaining=totalCredit-collected
  const isPartial=collected>0&&collected<totalCredit
  const isFull=collected>=totalCredit
  const isInvalid=collected<=0||collected>totalCredit
  
  const go=async()=>{
    if(isInvalid){alert('Enter amount between Rs 1 and Rs '+fmt(totalCredit));return}
    setBusy(true)
    // Distribute collection across credit entries (oldest first)
    let remainingToCollect=collected
    for(const ce of allCredits){
      if(remainingToCollect<=0)break
      const useAmt=Math.min(remainingToCollect,ce.amount)
      const origDate=ce.date
      const settledNote='💰 Credit settled on '+fmtD(date)+(origDate!==date?' (originally from '+fmtD(origDate)+')':'')
      if(useAmt>=ce.amount){
        // Full entry payment: convert credit → paid, date moves to today, append settled note
        const mergedNotes=ce.notes?ce.notes+' · '+settledNote:settledNote
        await actions.editIncome({...ce,payment:pay,date,notes:mergedNotes})
      } else {
        // Partial: reduce credit on original entry (keep original date), add NEW paid entry on today
        await actions.editIncome({...ce,amount:ce.amount-useAmt})
        const partialNote='💰 Partial credit settlement (originally from '+fmtD(origDate)+')'
        await actions.addIncome({id:uid(),date,type:ce.type,amount:useAmt,patient_id:ce.patient_id,patient_name:ce.patient_name,payment:pay,ref_doctor:ce.ref_doctor||'',notes:partialNote,custom_commission:ce.custom_commission!=null?ce.custom_commission:null,reg_no:ce.reg_no||''})
      }
      remainingToCollect-=useAmt
    }
    setBusy(false)
    onCancel()
  }
  
  return(
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:200,display:'flex',alignItems:'flex-end',justifyContent:'center'}}>
      <div style={{background:'#fff',borderRadius:'20px 20px 0 0',padding:'20px 16px 40px',width:'100%',maxWidth:520,maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
          <div style={{fontSize:15,fontWeight:700,color:'#16a34a'}}>💰 Collect Payment — {entry.patient_name}</div>
          <button onClick={onCancel} style={{background:'#f0f0f0',border:'none',borderRadius:20,width:32,height:32,fontSize:16,cursor:'pointer',color:'#555'}}>×</button>
        </div>
        
        <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:10,padding:'14px 16px',marginBottom:14}}>
          <div style={{fontSize:11,color:'#92400e',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>⏳ Total Credit Due</div>
          <div style={{fontSize:28,fontWeight:800,color:'#c2410c',marginBottom:8}}>{fmt(totalCredit)}</div>
          <div style={{borderTop:'1px dashed #fed7aa',paddingTop:8,marginTop:6}}>
            {Object.entries(byType).map(([tk,amt])=>{const it=ITYPES.find(t=>t.key===tk);return(
              <div key={tk} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#92400e',padding:'2px 0'}}>
                <span>{it?.full||tk}</span><span style={{fontWeight:700}}>{fmt(amt)}</span>
              </div>
            )})}
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <label style={{display:'block',fontSize:11,color:'#555',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:6,fontWeight:700}}>Amount being collected (Rs)</label>
          <input type="number" inputMode="numeric" value={collectAmt} onChange={e=>setCollectAmt(e.target.value)} 
            style={{width:'100%',padding:'12px 14px',border:'2px solid #16a34a',borderRadius:10,fontSize:18,fontWeight:700,color:'#16a34a',outline:'none',boxSizing:'border-box'}}/>
          <div style={{display:'flex',gap:6,marginTop:6}}>
            <button onClick={()=>setCollectAmt(String(totalCredit))} style={{flex:1,padding:'6px',background:'#f0fdf4',color:'#16a34a',border:'1px solid #bbf7d0',borderRadius:8,fontSize:11,fontWeight:700,cursor:'pointer'}}>Full ({fmt(totalCredit)})</button>
            <button onClick={()=>setCollectAmt(String(Math.round(totalCredit/2)))} style={{flex:1,padding:'6px',background:'#eff6ff',color:'#1d4ed8',border:'1px solid #bfdbfe',borderRadius:8,fontSize:11,fontWeight:700,cursor:'pointer'}}>Half ({fmt(Math.round(totalCredit/2))})</button>
          </div>
        </div>

        {isPartial&&<div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'10px 12px',marginBottom:14}}>
          <div style={{fontSize:11,color:'#1d4ed8',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>📊 After this collection</div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:600,marginBottom:2}}>
            <span style={{color:'#16a34a'}}>✓ Collected</span><span style={{color:'#16a34a'}}>{fmt(collected)}</span>
          </div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:13,fontWeight:600}}>
            <span style={{color:'#c2410c'}}>⏳ Remaining (Against IP)</span><span style={{color:'#c2410c'}}>{fmt(remaining)}</span>
          </div>
          <div style={{fontSize:10,color:'#94a3b8',marginTop:4,fontStyle:'italic'}}>Auto-applied to oldest credit entries first</div>
        </div>}
        {isFull&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'10px 12px',marginBottom:14,fontSize:13,color:'#15803d',fontWeight:600}}>✅ All credit will be cleared</div>}
        {isInvalid&&collectAmt&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'10px 12px',marginBottom:14,fontSize:12,color:'#dc2626',fontWeight:600}}>⚠️ Amount must be between Rs 1 and Rs {fmt(totalCredit)}</div>}

        <FInp label="Collection date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
        <div style={{marginBottom:14}}>
          <label style={{display:'block',fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8,fontWeight:700}}>Payment received via</label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
            {['cash','upi','card','bank'].map(m=>(
              <button key={m} onClick={()=>setPay(m)} style={{padding:'10px 4px',border:pay===m?'2px solid #16a34a':'1px solid #e5e7eb',borderRadius:10,background:pay===m?'#f0fdf4':'#fff',color:pay===m?'#16a34a':'#555',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                {m[0].toUpperCase()+m.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <PBtn onClick={go} disabled={busy||isInvalid} style={{background:isInvalid?'#ccc':'#16a34a'}}>
          {busy?'Saving...':isFull?'Collect Full '+fmt(totalCredit):'Collect '+fmt(collected||0)+' (Rs '+fmt(remaining)+' remains)'}
        </PBtn>
      </div>
    </div>
  )
}

const EditEntryForm=({entry,db,onSave,onCancel,canSeeReports})=>{
  const [amount,setAmount]=useState(String(entry.amount))
  const [patName,setPatName]=useState(entry.patient_name||'')
  const [patPhone,setPatPhone]=useState(entry.patient_phone||'')
  const [patArea,setPatArea]=useState(entry.patient_area||'')
  const [ref,setRef]=useState(entry.ref_doctor||'')
  const [custComm,setCustComm]=useState(entry.custom_commission!=null?String(Math.round(entry.custom_commission)):'')
  const [pay,setPay]=useState(entry.payment||'cash')
  const [splits,setSplits]=useState([{amount:String(entry.amount||''),mode:entry.payment||'cash'}])
  const [notes,setNotes]=useState(entry.notes||'')
  const [conds,setConds]=useState((entry.conditions||'').split(',').map(x=>x.trim()).filter(Boolean))
  const [newCond,setNewCond]=useState('')
  const [date,setDate]=useState(entry.date||todayStr())
  const [opType,setOpType]=useState(entry.op_type||'New OP')
  const [type,setType]=useState(entry.type)
  const [vcConsultant,setVcConsultant]=useState(entry.consultant_name||'')
  const [vcFee,setVcFee]=useState(entry.consultant_fee!=null?String(entry.consultant_fee):'')
  const [opConsFee,setOpConsFee]=useState('')
  const [busy,setBusy]=useState(false)
  const isOP=type==='op'
  const isVC=type==='vc'
  const isIPtype=['ip','ip_r','ip_l','ip_p'].includes(type)
  const showRefField=!isIPtype&&!isVC
  const defaultCommPct=COMM[type]!=null?Math.round(COMM[type]*100):0
  const commPct=custComm!==''?parseFloat(custComm)||0:defaultCommPct
  const comm=ref.trim()&&commPct>0?parseFloat(amount||0)*commPct/100:0
  const go=async()=>{
    const amt=parseFloat(amount);if(!amt||amt<=0){alert('Enter valid amount');return}
    setBusy(true)
    // If changing to IP type and not yet linked to IP patient, try to link by name
    let linkedPatientId=entry.patient_id
    if(isIPtype&&!linkedPatientId&&patName){
      const ipPat=(db?.ip_patients||[]).find(p=>p.name&&p.name.trim().toLowerCase()===patName.trim().toLowerCase())
      if(ipPat){
        linkedPatientId=ipPat.id
        // Also inherit ref_doctor from IP patient if entry doesn't have one
        if(!ref.trim()&&ipPat.ref_doctor){setRef(ipPat.ref_doctor)}
      }
    }
    await onSave({...entry,type,amount:amt,patient_id:linkedPatientId,patient_name:patName,patient_phone:patPhone||'',patient_area:patArea||'',ref_doctor:ref.trim(),payment:pay,notes,date,op_type:opType,custom_commission:custComm!==''?parseFloat(custComm):null,consultant_name:isVC?vcConsultant:entry.consultant_name,consultant_fee:isVC?parseFloat(vcFee||0):(opConsFee!==''?parseFloat(opConsFee||0):entry.consultant_fee),conditions:conds.join(',')})
    setBusy(false)
  }
  return(
    <div style={{position:'fixed',inset:0,background:'#f8fafc',zIndex:9999,overflowY:'auto'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #f0f0f0',padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,zIndex:10}}>
        <button onClick={onCancel} style={{background:'none',border:'none',color:'#3b82f6',fontSize:14,fontWeight:600,cursor:'pointer',padding:'4px 0'}}>Cancel</button>
        <div style={{display:'flex',alignItems:'center',gap:8}}><TypeTag t={type}/><span style={{fontSize:14,fontWeight:700}}>Edit entry</span></div>
        <button onClick={go} disabled={busy} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',fontSize:14,fontWeight:700,cursor:'pointer',opacity:busy?0.6:1}}>{busy?'Saving...':'Save'}</button>
      </div>
      <div style={{padding:'16px',maxWidth:480,margin:'0 auto'}}>
        <FInp label="Date" type="date" value={date} onChange={e=>setDate(e.target.value)}/>
        <FSel label="Type" value={type} onChange={e=>{setType(e.target.value);setCustComm('')}}>
          {ITYPES.map(t=><option key={t.key} value={t.key}>{t.label} - {t.full}</option>)}
        </FSel>
        {!isIPtype&&<FInp label="Patient name" type="text" value={patName} onChange={e=>setPatName(e.target.value)} placeholder="Patient name"/>}
        {!isIPtype&&<FInp label="Patient phone (optional)" type="tel" value={patPhone} onChange={e=>setPatPhone(e.target.value)} placeholder="9999999999"/>}
        {!isIPtype&&<FInp label="Patient area (optional)" type="text" value={patArea} onChange={e=>setPatArea(e.target.value)} placeholder="e.g. Kukatpally, Miyapur"/>}
        <FInp label="Amount (Rs)" type="number" inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)}/>
        {isOP&&<FSel label="OP type" value={opType} onChange={e=>setOpType(e.target.value)}>{OP_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</FSel>}
        <div style={{marginBottom:12}}>
          <label style={{display:'block',fontSize:11,color:'#555',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',marginBottom:6}}>PAYMENT MODE</label>
          {splits.map((sp,si)=>{const multi=splits.length>1;return(<div key={si} style={{display:'grid',gridTemplateColumns:multi?'1fr 1fr auto':'1fr auto',gap:6,marginBottom:6,alignItems:'center'}}>
            {multi&&<input type="number" inputMode="numeric" value={sp.amount} placeholder="Amount" onChange={e=>{const s=[...splits];s[si]={...s[si],amount:e.target.value};const tot=s.reduce((a,x)=>a+(parseFloat(x.amount)||0),0);setSplits(s);setAmount(String(tot));setPay(s[0].mode)}} style={{padding:'9px 12px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:14,outline:'none',boxSizing:'border-box'}}/>}
            <select value={sp.mode} onChange={e=>{const s=[...splits];s[si]={...s[si],mode:e.target.value};setSplits(s);setPay(s[0].mode)}} style={{padding:'9px 12px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:13,outline:'none',background:'#fff',boxSizing:'border-box'}}>
              {PMODES.map(m=><option key={m} value={m}>{m==='credit'?'⏳ Credit':m==='written_off'?'✂️ Written Off':m==='discount'?'🎟️ Discount':m[0].toUpperCase()+m.slice(1)}</option>)}
            </select>
            {si>0?<button onClick={()=>{const s=splits.filter((_,i)=>i!==si);const tot=s.reduce((a,x)=>a+(parseFloat(x.amount)||0),0);setSplits(s);setAmount(String(tot));setPay(s[0].mode)}} style={{padding:'8px 12px',background:'#fee2e2',color:'#dc2626',border:'none',borderRadius:10,cursor:'pointer',fontWeight:800,fontSize:16}}>×</button>:<div/>}
          </div>)})}
          <button onClick={()=>setSplits([{amount:amount||'',mode:splits[0]?.mode||pay},{amount:'',mode:'cash'}])} style={{width:'100%',padding:'8px',background:'#f0f9ff',color:'#0369a1',border:'1.5px dashed #7dd3fc',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer',marginBottom:4}}>+ Split Payment</button>
          {splits.length>1&&<div style={{display:'flex',justifyContent:'space-between',padding:'6px 10px',background:'#f0fdf4',borderRadius:8,fontSize:13,fontWeight:700}}><span style={{color:'#16a34a'}}>Total</span><span style={{color:'#16a34a'}}>Rs {splits.reduce((a,s)=>a+(parseFloat(s.amount)||0),0).toLocaleString('en-IN')}</span></div>}
        </div>
        {isVC&&<>
          <FSel label="Visiting consultant" value={vcConsultant} onChange={e=>setVcConsultant(e.target.value)}>
            <option value="">- Select consultant -</option>
            {(db?.consultants||[]).map(d=><option key={d.id} value={d.name}>{d.name}</option>)}
          </FSel>
          <FInp label="Consultant fee paid (Rs)" type="number" inputMode="numeric" value={vcFee} onChange={e=>setVcFee(e.target.value)} placeholder="0"/>
          {vcFee&&parseFloat(vcFee)>0&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#15803d'}}>Hospital profit: {fmt(parseFloat(amount||0)-parseFloat(vcFee||0))}</div>}
        </>}
        {showRefField&&<FSel label="Referring doctor" value={ref} onChange={e=>{const sel=(db?.ref_doctors||[]).find(d=>d.name===e.target.value);const pctKey={op_r:'op_r_pct',op_l:'op_l_pct',op:'op_pct',opd:'op_pct',op_p:'op_p_pct',op_dm:'op_r_pct',ip:'ip_pct',ip_r:'ip_r_pct',ip_l:'ip_l_pct',ip_p:'ip_pct'}[type]||'op_pct';const pct=sel?sel[pctKey]:null;setRef(e.target.value);if(pct!=null&&custComm==='')setCustComm(String(pct))}}>
          <option value="">- No referral / Self -</option>
          {(db?.ref_doctors||[]).map(d=><option key={d.id} value={d.name}>Dr. {d.name}{d.area?' ('+d.area+')':''}</option>)}
        </FSel>}
        {showRefField&&ref.trim()!==''&&<FInp label={`Commission % (default ${defaultCommPct}%)`} type="number" inputMode="numeric" value={custComm} onChange={e=>setCustComm(e.target.value)} placeholder={String(defaultCommPct)}/>}
        {canSeeReports&&comm>0&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#92400e'}}>Commission to Dr. {ref}: {fmt(comm)} ({commPct}%)</div>}
      {type==='op'&&entry.consultant_name&&<div style={{background:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:8,padding:'10px 12px',marginBottom:8}}>
        <div style={{fontSize:11,fontWeight:700,color:'#7e22ce',marginBottom:6}}>Consultant: Dr. {entry.consultant_name} — current fee: {fmt(entry.consultant_fee||0)}</div>
        <FInp label="Correct consultant fee (Rs) — leave blank to keep current" type="number" value={opConsFee} onChange={e=>setOpConsFee(e.target.value)}/>
      </div>}
        <FInp label="Notes (optional)" type="text" placeholder="Optional" value={notes} onChange={e=>setNotes(e.target.value)}/>
        <div style={{marginBottom:14}}>
          <label style={{display:'block',fontSize:10,color:'#7c3aed',fontWeight:700,textTransform:'uppercase',marginBottom:6}}>Conditions / Comorbidities</label>
          <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:8}}>
            {['Diabetes','Hypertension','Thyroid','TB','Anemia','Asthma','Heart Disease','Kidney Disease',...(db.income.flatMap(e=>(e.conditions||'').split(',').map(x=>x.trim()).filter(x=>x&&!['Diabetes','Hypertension','Thyroid','TB','Anemia','Asthma','Heart Disease','Kidney Disease'].includes(x)))).filter((v,i,a)=>a.indexOf(v)===i),...conds.filter(cd=>!['Diabetes','Hypertension','Thyroid','TB','Anemia','Asthma','Heart Disease','Kidney Disease'].includes(cd))].filter((v,i,a)=>a.indexOf(v)===i).map(cond=>{
              const sel=conds.includes(cond)
              return(<button key={cond} type="button" onClick={()=>setConds(sel?conds.filter(x=>x!==cond):[...conds,cond])} style={{padding:'4px 12px',borderRadius:20,border:sel?'none':'1.5px solid #e8e2d9',background:sel?'#1a1a2e':'#fff',color:sel?'#c9a84c':'#555',fontSize:12,fontWeight:sel?700:400,cursor:'pointer'}}>{cond}</button>)
            })}
          </div>
          <div style={{display:'flex',gap:6}}>
            <input type="text" placeholder="Add other condition..." value={newCond} onChange={e=>setNewCond(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&newCond.trim()){setConds([...conds,newCond.trim()]);setNewCond('')}}} style={{flex:1,padding:'8px 12px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:13,outline:'none'}}/>
            <button type="button" onClick={()=>{if(newCond.trim()){setConds([...conds.filter(x=>x!==newCond.trim()),newCond.trim()]);setNewCond('')}}} style={{padding:'7px 14px',background:'#1a1a2e',color:'#c9a84c',border:'none',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Add</button>
          </div>
          {conds.length>0&&<div style={{marginTop:6,fontSize:11,color:'#7c3aed',fontWeight:600}}>Selected: {conds.join(', ')}</div>}
        </div>
        <PBtn onClick={go} disabled={busy} style={{marginTop:8}}>{busy?'Saving...':'Save changes'}</PBtn>
        <button onClick={onCancel} style={{width:'100%',padding:'12px',background:'none',border:'1px solid #e5e7eb',borderRadius:12,fontSize:14,color:'#aaa',cursor:'pointer',marginTop:8}}>Cancel</button>
      </div>
    </div>
  )
}

const EntryTab=({db,actions,eDate,setEDate,itype,setItype,iF,setIF,profile,canSeeReports})=>{
  const [editEntry,setEditEntry]=useState(null)
  const di=db.income.filter(e=>e.date===eDate)
  const tots={};ITYPES.forEach(t=>{tots[t.key]=di.filter(e=>e.type===t.key).reduce((a,e)=>a+e.amount,0)})
  const tot=Object.values(tots).reduce((a,b)=>a+b,0)
  const isIP=['ip','ip_r','ip_l','ip_p'].includes(itype)
  const aps=db.ip_patients.filter(p=>!p.discharge_date)
  const custCommPct=iF.custom_commission!==''?parseFloat(iF.custom_commission)/100:(COMM[itype]||0)
  const prev=iF.amount&&iF.ref&&iF.ref.trim()&&(custCommPct>0||iF.custom_commission!=='')?parseFloat(iF.amount||0)*(iF.custom_commission!==''?parseFloat(iF.custom_commission)/100:(COMM[itype]||0)):0
  const todayCash=cashTotal(di);const todayCredit=credTotal(di)
  if(editEntry)return(<EditEntryForm entry={editEntry} db={db} canSeeReports={canSeeReports} onSave={async row=>{const ok=await actions.editIncome(row);if(ok!==false)setEditEntry(null)}} onCancel={()=>setEditEntry(null)}/>)
  const go=async()=>{
    const amt=parseFloat(iF.amount);
    if(isNaN(amt)||amt<0){alert('Enter a valid amount (Rs 0 allowed for free consultation)');return}
    let pid=null,pname=''
    if(isIP){pid=iF.pid||null;if(pid){pname=db.ip_patients.find(p=>p.id===pid)?.name||''}}
    else if(itype==='op_dm'&&iF.linkedIpId){
      pid=iF.linkedIpId
      const linked=db.ip_patients.find(p=>p.id===pid)
      pname=linked?.name||iF.pname.trim()
      if(!pname){alert('Please select an IP patient for OP Discharge Medicine');return}
    }
    else{if(!iF.pname.trim()&&itype!=='vc'){alert('Patient name is required');return};pname=iF.pname.trim()}
    // Phone is mandatory - default to 0000000000 if missing
    if(!isIP&&itype!=='vc'){
      if(!iF.phone||!iF.phone.trim())iF.phone='0000000000'
      else iF.phone=iF.phone.trim()
    }
    let regNo=iF.reg_no||null  // if user picked from suggestions, use that
    if(!isIP&&!regNo&&['op','opd','op_p','op_r','op_l','op_dm'].includes(itype)){
      // Match by name only (phones can be shared across family members)
      const existingEntry=db.income.find(e=>e.patient_name&&e.patient_name.trim().toLowerCase()===pname.trim().toLowerCase()&&e.reg_no)
      if(existingEntry){
        regNo=existingEntry.reg_no
      } else {
        const ipMatch=(db.ip_patients||[]).find(p=>p.name&&p.name.trim().toLowerCase()===pname.trim().toLowerCase()&&p.reg_no)
        if(ipMatch)regNo=ipMatch.reg_no
      }
      if(!regNo)regNo=await genRegNo()
    }
    const activeSplits=(iF.splits||[]).filter(s=>parseFloat(s.amount)>0)
    const isMultiSplit=activeSplits.length>1
    let ok=true
    if(isMultiSplit){
      const summary=activeSplits.map(s=>'Rs '+s.amount+' '+s.mode).join(' + ')
      const totalCheck=activeSplits.reduce((a,s)=>a+(parseFloat(s.amount)||0),0)
      if(Math.abs(totalCheck-amt)>0.01){
        const proceed=window.confirm('⚠️ Amount mismatch:\n\nMain amount: Rs '+amt+'\nSplits sum: Rs '+totalCheck+'\n\nProceed with splits ('+summary+')?')
        if(!proceed)return
      }
      for(const sp of activeSplits){
        const sa=parseFloat(sp.amount)||0
        const r=await actions.addIncome({id:uid(),date:eDate,type:itype,amount:sa,patient_id:pid,patient_name:pname,payment:sp.mode,ref_doctor:itype==='vc'?'':iF.ref.trim(),notes:cleanNotes(iF.notes)||'',patient_phone:(!isIP&&iF.phone?.trim())||'',consultant_fee:(itype==='op'||itype==='op_p')?Math.round(sa*consPct(db.consultants.find(d=>d.name===iF.consultant_name),itype)/100):(itype==='vc'?parseFloat(iF.consultant_fee||0):0),consultant_name:(itype==='op'||itype==='op_p')?iF.consultant_name:'',op_type:['op'].includes(itype)?iF.op_type:'',custom_commission:iF.custom_commission!==''?parseFloat(iF.custom_commission):null,reg_no:regNo,patient_area:iF.patient_area?.trim()||'',speciality:iF.speciality||'General Medicine',entered_by:profile?.name||profile?.username||'',conditions:(iF.conditions||[]).join(',')})
        if(!r)ok=false
      }
    } else { const ok2=await actions.addIncome({id:uid(),date:eDate,type:itype,amount:amt,patient_id:pid,patient_name:pname,payment:iF.pay,ref_doctor:itype==='vc'?'':iF.ref.trim(),notes:cleanNotes(iF.notes)||'',patient_phone:(!isIP&&iF.phone?.trim())||'',consultant_fee:(itype==='op'||itype==='op_p')?Math.round(amt*consPct(db.consultants.find(d=>d.name===iF.consultant_name),itype)/100):(itype==='vc'?parseFloat(iF.consultant_fee||0):0),consultant_name:(itype==='op'||itype==='op_p')?iF.consultant_name:'',op_type:['op'].includes(itype)?iF.op_type:'',custom_commission:iF.custom_commission!==''?parseFloat(iF.custom_commission):null,reg_no:regNo,patient_area:iF.patient_area?.trim()||'',speciality:iF.speciality||'General Medicine',entered_by:profile?.name||profile?.username||'',conditions:(iF.conditions||[]).join(',')});ok=ok2}
    if(ok!==false)setIF({amount:'',pid:'',pname:'',ref:'',pay:'cash',notes:'',consultant_fee:0,consultant_name:'',phone:'',op_type:'New OP',custom_commission:'',patient_area:'',linkedIpId:'',conditions:[],newCondition:'',splits:[{amount:'',mode:'cash'}]})
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
        {canSeeReports&&prev>0&&iF.ref&&itype!=='op'&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'10px 12px',marginBottom:10,fontSize:13,color:'#92400e'}}>Commission to Dr. <strong>{iF.ref}</strong>: <strong style={{color:'#c2410c'}}>{fmt(prev)}</strong> <span style={{fontSize:11,opacity:.8}}>({iF.custom_commission!==''?iF.custom_commission+'%':'auto'} of {fmt(parseFloat(iF.amount||0))})</span></div>}
        {isIP?<FSel label="IP Patient" value={iF.pid} onChange={e=>setIF({...iF,pid:e.target.value})}><option value="">- select admitted patient -</option>{aps.map(p=><option key={p.id} value={p.id}>{p.name}{canSeeReports&&p.ref_doctor?' (Ref: '+p.ref_doctor+')':''}</option>)}</FSel>
          :<>
            {(itype==='op_r'||itype==='op_l')?(
              <div style={{marginBottom:10}}>
                <label style={{display:'block',fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:5,fontWeight:700}}>Patient name *</label>
                <input list="op-patients-list" style={S.inp} placeholder="Type or select patient name" value={iF.pname} onChange={e=>setIF({...iF,pname:e.target.value})} autoCorrect="off" autoCapitalize="words"/>
                {iF.pname?.trim().length>2&&(()=>{
                  const ex=db.income.find(e=>e.patient_name&&e.patient_name.trim().toLowerCase()===iF.pname.trim().toLowerCase()&&e.reg_no)
                  const ip=ex?null:(db.ip_patients||[]).find(p=>p.name&&p.name.trim().toLowerCase()===iF.pname.trim().toLowerCase()&&p.reg_no)
                  const rn=ex?.reg_no||ip?.reg_no
                  if(!rn)return null
                  return(<div style={{marginTop:6,padding:'6px 10px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,fontSize:11,color:'#16a34a',fontWeight:600}}>✓ Existing patient — Reg No: <strong>{rn}</strong></div>)
                })()}
                <datalist id="op-patients-list">
                  {[...new Set(db.income.filter(e=>e.type==='op'&&e.date===eDate&&e.patient_name).map(e=>e.patient_name))].map(n=><option key={n} value={n}/>)}
                </datalist>
                {iF.pname&&db.income.find(e=>e.type==='op'&&e.patient_name.toLowerCase()===iF.pname.toLowerCase())&&<div style={{fontSize:11,color:'#16a34a',marginTop:4,fontWeight:600}}>Patient matched - all entries will group together</div>}
              </div>
            ):(<>
              <FInp label="Patient name *" type="text" placeholder="Required" value={iF.pname} onChange={e=>setIF({...iF,pname:e.target.value})}/>
              {iF.pname?.trim().length>2&&(()=>{
                const ex=db.income.find(e=>e.patient_name&&e.patient_name.trim().toLowerCase()===iF.pname.trim().toLowerCase()&&e.reg_no)
                const ip=ex?null:(db.ip_patients||[]).find(p=>p.name&&p.name.trim().toLowerCase()===iF.pname.trim().toLowerCase()&&p.reg_no)
                const rn=ex?.reg_no||ip?.reg_no
                if(!rn)return null
                return(<div style={{margin:'-6px 0 10px 0',padding:'6px 10px',background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,fontSize:11,color:'#16a34a',fontWeight:600}}>✓ Existing patient — Reg No: <strong>{rn}</strong></div>)
              })()}
            </>)}
            <FInp label="Phone" type="tel" placeholder="9999999999 (leave empty for 0000000000)" value={iF.phone||''} onChange={e=>setIF({...iF,phone:e.target.value,reg_no:''})}/>
          {(()=>{
            const phone=(iF.phone||'').trim()
            if(!phone||phone==='0000000000'||phone.length<3)return null
            const seen=new Set()
            const opMatches=db.income.filter(e=>e.patient_phone===phone&&e.patient_name&&e.reg_no).filter(e=>{const k=(e.patient_name||'').toLowerCase()+'|'+e.reg_no;if(seen.has(k))return false;seen.add(k);return true})
            const ipMatches=(db.ip_patients||[]).filter(p=>p.phone===phone&&p.name&&p.reg_no).filter(p=>{const k=(p.name||'').toLowerCase()+'|'+p.reg_no;if(seen.has(k))return false;seen.add(k);return true})
            const allMatches=[...opMatches.map(e=>({source:'op',name:e.patient_name,reg_no:e.reg_no,area:e.patient_area,date:e.date})),...ipMatches.map(p=>({source:'ip',name:p.name,reg_no:p.reg_no,area:p.patient_area,date:p.admission_date}))]
            if(allMatches.length===0)return null
            return(<div style={{background:'#eff6ff',border:'1.5px solid #3b82f6',borderRadius:10,padding:'10px 12px',marginTop:-4,marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:800,color:'#1d4ed8',marginBottom:8,textTransform:'uppercase',letterSpacing:'.5px'}}>📞 {allMatches.length} patient{allMatches.length!==1?'s':''} share this phone</div>
              <div style={{display:'flex',flexDirection:'column',gap:6,maxHeight:200,overflowY:'auto'}}>
                {allMatches.map((m,i)=><button key={i} type="button" onClick={()=>setIF({...iF,pname:m.name,reg_no:m.reg_no,patient_area:m.area||iF.patient_area||''})} style={{textAlign:'left',padding:'8px 12px',background:'#fff',border:'1.5px solid #bfdbfe',borderRadius:8,cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:700,color:'#0f172a'}}>{m.name}</div>
                    <div style={{fontSize:11,color:'#64748b',marginTop:2}}>Reg: {m.reg_no}{m.area?' · '+m.area:''}{m.date?' · last: '+m.date:''}</div>
                  </div>
                  <div style={{fontSize:10,fontWeight:700,padding:'2px 8px',borderRadius:12,background:m.source==='ip'?'#dbeafe':'#dcfce7',color:m.source==='ip'?'#1d4ed8':'#15803d'}}>{m.source.toUpperCase()}</div>
                </button>)}
                <button type="button" onClick={()=>setIF({...iF,reg_no:''})} style={{padding:'8px 12px',background:'#fef3c7',border:'1.5px dashed #f59e0b',borderRadius:8,cursor:'pointer',fontSize:12,fontWeight:700,color:'#92400e'}}>+ Add as NEW patient (different from above)</button>
              </div>
              {iF.reg_no&&<div style={{marginTop:8,padding:'6px 10px',background:'#fff',border:'1px solid #3b82f6',borderRadius:6,fontSize:11,color:'#1d4ed8',fontWeight:700}}>✓ Selected: {iF.pname} · Reg {iF.reg_no}</div>}
            </div>)
          })()}
            {!isIP&&<FInp label="Patient area (optional)" type="text" placeholder="e.g. Kukatpally, Miyapur, KPHB" value={iF.patient_area||''} onChange={e=>setIF({...iF,patient_area:e.target.value})}/>}
            {itype==='op'&&<FSel label="OP type" value={iF.op_type} onChange={e=>setIF({...iF,op_type:e.target.value})}>{OP_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</FSel>}
            {!isIP&&(itype==='op'||itype==='op_p')&&(<>
              <FSel label="Visiting consultant (optional)" value={iF.consultant_name||''} onChange={e=>{const con=db.consultants.find(d=>d.name===e.target.value);setIF({...iF,consultant_name:e.target.value,consultant_fee:con&&iF.amount?Math.round(parseFloat(iF.amount||0)*consPct(con,itype)/100):0})}}>
                <option value="">- No visiting consultant -</option>
                {db.consultants.map(d=><option key={d.id} value={d.name}>Dr. {d.name}</option>)}
              </FSel>
              {iF.consultant_name&&iF.amount&&(()=>{const con=db.consultants.find(d=>d.name===iF.consultant_name);if(!con)return null;const share=parseFloat(iF.amount||0)*(consPct(con,itype)/100);const hospital=parseFloat(iF.amount||0)-share;return(<div style={{background:'#f3e8ff',border:'1px solid #d8b4fe',borderRadius:8,padding:'10px 12px',marginBottom:8,fontSize:13}}><div style={{color:'#7e22ce',fontWeight:700,marginBottom:6}}>Dr. {con.name} - fee split</div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}><div style={{textAlign:'center',background:'#ede9fe',borderRadius:8,padding:'8px'}}><div style={{fontSize:9,color:'#7e22ce',fontWeight:700,textTransform:'uppercase'}}>Doctor gets ({consPct(con,itype)}%)</div><div style={{fontSize:20,fontWeight:800,color:'#7e22ce'}}>{fmt(share)}</div></div><div style={{textAlign:'center',background:'#f0fdf4',borderRadius:8,padding:'8px'}}><div style={{fontSize:9,color:'#15803d',fontWeight:700,textTransform:'uppercase'}}>Hospital keeps</div><div style={{fontSize:20,fontWeight:800,color:'#15803d'}}>{fmt(hospital)}</div></div></div></div>)})()}
              {canSeeReports&&(<><FSel label="Referring doctor (optional)" value={iF.ref} onChange={e=>{const sel=db.ref_doctors.find(d=>d.name===e.target.value);const pk={op:'op_pct',opd:'op_pct',op_p:'op_p_pct',op_r:'op_r_pct',op_l:'op_l_pct',op_dm:'op_r_pct'}[itype]||'op_pct';const pct=sel?sel[pk]:null;setIF({...iF,ref:e.target.value,custom_commission:pct!=null?String(pct):''})}}>
                <option value="">- No referral / Self patient -</option>
                {db.ref_doctors.map(d=><option key={d.id} value={d.name}>Dr. {d.name}{d.area?' ('+d.area+')':''}</option>)}
              </FSel>
              {iF.ref&&(()=>{const doc=db.ref_doctors.find(d=>d.name===iF.ref);if(!doc)return null;return(<div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:8}}>
                {doc.area&&<span style={{background:'#eff6ff',border:'1px solid #bfdbfe',color:'#1d4ed8',fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:100}}>Area: {doc.area}</span>}
                {iF.amount&&doc.op_pct>0&&<span style={{background:'#fff7ed',border:'1px solid #fed7aa',color:'#92400e',fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:100}}>Commission: {fmt(parseFloat(iF.amount||0)*(doc.op_pct/100))} ({doc.op_pct}%)</span>}
              </div>)})()}</>)}
              {!canSeeReports&&<div style={{background:'#f9fafb',border:'1px dashed #d1d5db',borderRadius:10,padding:'10px 14px',marginBottom:8,fontSize:12,color:'#94a3b8',fontStyle:'italic',textAlign:'center'}}>Referral doctor will be added by admin/management</div>}
            </>)}
            {!isIP&&(itype==='op_r'||itype==='op_l')&&iF.pname.trim()&&(()=>{const opEntry=db.income.find(e=>e.type==='op'&&e.patient_name===iF.pname.trim()&&e.ref_doctor);if(!opEntry)return null;const doc=db.ref_doctors.find(d=>d.name===opEntry.ref_doctor);const pctKey=itype==='op_r'?'op_r_pct':'op_l_pct';const pct=doc?doc[pctKey]:null;if(iF.ref!==opEntry.ref_doctor){setIF({...iF,ref:opEntry.ref_doctor,custom_commission:pct!=null?String(pct):''})}return canSeeReports?(<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#15803d'}}>Ref doctor auto-filled: <strong>Dr. {opEntry.ref_doctor}</strong>{pct!=null?' ('+pct+'%)':''}</div>):null})()}
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
        <FInp label="Amount (Rs )" type="number" inputMode="numeric" placeholder="0" value={iF.amount} onChange={e=>{const newAmt=e.target.value;const newSplits=(iF.splits||[]).length<=1?[{amount:newAmt,mode:(iF.splits||[])[0]?.mode||iF.pay}]:iF.splits;setIF({...iF,amount:newAmt,splits:newSplits})}}/>
        <div style={{marginBottom:12}}>
          <label style={{display:'block',fontSize:11,color:'#555',fontWeight:700,textTransform:'uppercase',letterSpacing:'.04em',marginBottom:6}}>PAYMENT MODE</label>
          {(iF.splits||[{amount:iF.amount,mode:iF.pay}]).map((sp,si)=>{const multi=(iF.splits||[]).length>1;return(<div key={si} style={{display:'grid',gridTemplateColumns:multi?'1fr 1fr auto':'1fr auto',gap:6,marginBottom:6,alignItems:'center'}}>
            {multi&&<input type="number" inputMode="numeric" value={sp.amount} placeholder="Amount" onChange={e=>{const s=[...(iF.splits||[])];s[si]={...s[si],amount:e.target.value};const tot=s.reduce((a,x)=>a+(parseFloat(x.amount)||0),0);setIF({...iF,splits:s,amount:String(tot),pay:s[0].mode})}} style={{padding:'9px 12px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:14,outline:'none',boxSizing:'border-box'}}/>}
            <select value={sp.mode} onChange={e=>{const s=[...(iF.splits||[])];s[si]={...s[si],mode:e.target.value};setIF({...iF,splits:s,pay:s[0].mode})}} style={{padding:'9px 12px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:13,outline:'none',background:'#fff',boxSizing:'border-box'}}>
              {PMODES.map(m=><option key={m} value={m}>{m==='credit'?'⏳ Credit':m==='written_off'?'✂️ Written Off':m==='discount'?'🎟️ Discount':m[0].toUpperCase()+m.slice(1)}</option>)}
            </select>
            {si>0?<button onClick={()=>{const s=(iF.splits||[]).filter((_,i)=>i!==si);const tot=s.reduce((a,x)=>a+(parseFloat(x.amount)||0),0);setIF({...iF,splits:s,amount:String(tot),pay:s[0].mode})}} style={{padding:'8px 12px',background:'#fee2e2',color:'#dc2626',border:'none',borderRadius:10,cursor:'pointer',fontWeight:800,fontSize:16}}>×</button>:<div/>}
          </div>)})}
          <button onClick={()=>setIF({...iF,splits:[{amount:iF.amount||'',mode:iF.pay},{amount:'',mode:'cash'}]})} style={{width:'100%',padding:'8px',background:'#f0f9ff',color:'#0369a1',border:'1.5px dashed #7dd3fc',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer',marginBottom:4}}>+ Split Payment (e.g. Cash + UPI)</button>
          {(iF.splits||[]).length>1&&<div style={{display:'flex',justifyContent:'space-between',padding:'6px 10px',background:'#f0fdf4',borderRadius:8,fontSize:13,fontWeight:700}}><span style={{color:'#16a34a'}}>Total</span><span style={{color:'#16a34a'}}>Rs {(iF.splits||[]).reduce((a,s)=>a+(parseFloat(s.amount)||0),0).toLocaleString('en-IN')}</span></div>}
        </div>
          <FInp label="Notes" type="text" placeholder="Optional" value={iF.notes} onChange={e=>setIF({...iF,notes:e.target.value})}/>
            {itype==='op_dm'&&<div style={{marginBottom:10}}>
          <label style={{display:'block',fontSize:10,color:'#a89880',fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>🏥 Tag to IP Patient (Discharge)</label>
          <select value={iF.linkedIpId||''} onChange={e=>{
            const ipId=e.target.value
            if(!ipId){setIF({...iF,linkedIpId:'',pname:'',ref:'',phone:'',patient_area:''});return}
            const pat=(db.ip_patients||[]).find(p=>p.id===ipId)
            if(pat){
              const doc=(db.ref_doctors||[]).find(d=>d.name===pat.ref_doctor)
              const rate=doc?doc.op_r_pct:(pat.custom_commission!=null?pat.custom_commission:null)
              setIF({...iF,linkedIpId:ipId,pname:pat.name||'',ref:pat.ref_doctor||'',phone:pat.phone||'',patient_area:pat.patient_area||'',custom_commission:rate!=null?String(rate):''})
            }
          }} style={{width:'100%',padding:'10px 12px',border:'2px solid #ec4899',borderRadius:10,fontSize:13,background:'#fff',fontWeight:700,color:'#be185d',outline:'none'}}>
            <option value="">- Select IP patient being discharged -</option>
            {(db.ip_patients||[]).slice().sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(p=><option key={p.id} value={p.id}>{p.name}{p.discharge_date?' (Discharged '+fmtD(p.discharge_date)+')':' - Active'}{canSeeReports&&p.ref_doctor?' [Dr. '+p.ref_doctor+']':''}</option>)}
          </select>
          {iF.linkedIpId&&(()=>{const pat=(db.ip_patients||[]).find(p=>p.id===iF.linkedIpId);if(!pat)return null;return(<div style={{marginTop:8,padding:'8px 12px',background:'#fdf2f8',border:'1px solid #fbcfe8',borderRadius:8,fontSize:12,color:'#831843',fontWeight:600}}>✓ Linked to {pat.name}{pat.ref_doctor?' · Dr. '+pat.ref_doctor:''}{pat.reg_no?' · Reg '+pat.reg_no:''}</div>)})()}
        </div>}
                {['op','opd','op_r','op_l'].includes(itype)&&<div style={{marginBottom:8}}>
              <label style={{display:'block',fontSize:10,color:'#a89880',fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:6}}>Conditions / Comorbidities</label>
              <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:6}}>
                {['Diabetes','Hypertension','Thyroid','TB','Anemia','Asthma','Heart Disease','Kidney Disease',...(db.income.flatMap(e=>(e.conditions||'').split(',').filter(x=>x&&!['Diabetes','Hypertension','Thyroid','TB','Anemia','Asthma','Heart Disease','Kidney Disease'].includes(x)))).filter((v,i,a)=>a.indexOf(v)===i)].map(cond=>{
                  const sel=(iF.conditions||[]).includes(cond)
                  return(<button key={cond} type="button" onClick={()=>setIF(f=>({...f,conditions:sel?f.conditions.filter(c=>c!==cond):[...(f.conditions||[]),cond]}))} style={{padding:'4px 12px',borderRadius:20,border:sel?'none':'1.5px solid #e8e2d9',background:sel?'#1a1a2e':'#fff',color:sel?'#c9a84c':'#555',fontSize:12,fontWeight:sel?700:400,cursor:'pointer'}}>
                    {sel?'✓ ':''}{cond}
                  </button>)
                })}
              </div>
              <div style={{display:'flex',gap:6}}>
                <input type="text" value={iF.newCondition||''} onChange={e=>setIF(f=>({...f,newCondition:e.target.value}))} placeholder="Add new condition..." style={{flex:1,fontSize:12,padding:'7px 10px',border:'1.5px solid #e8e2d9',borderRadius:8,outline:'none',background:'#fff'}}/>
                <button type="button" onClick={()=>{if(iF.newCondition?.trim()){setIF(f=>({...f,conditions:[...(f.conditions||[]),f.newCondition.trim()],newCondition:''}));}}} style={{padding:'7px 14px',background:'#1a1a2e',color:'#c9a84c',border:'none',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Add</button>
              </div>
              {(iF.conditions||[]).length>0&&<div style={{marginTop:6,fontSize:11,color:'#7c3aed',fontWeight:600}}>Selected: {iF.conditions.join(', ')}</div>}
            </div>}
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
          <Card>{(()=>{
            const grouped={}
            ents.forEach(e=>{
              const k=(e.patient_name||'').trim().toLowerCase()+'|'+e.type+'|'+e.date+'|'+(e.ref_doctor||'')+'|'+(e.consultant_name||'')
              if(!grouped[k])grouped[k]={base:e,entries:[]}
              grouped[k].entries.push(e)
            })
            return Object.values(grouped).map(g=>{
              const e=g.base
              const allEntries=g.entries
              const totalAmt=allEntries.reduce((a,x)=>a+x.amount,0)
              const doc=getRefDoc(e,db.ip_patients)
              const comm=allEntries.reduce((a,x)=>a+getComm(x),0)
              const cr=isCredit(e)
              return(
            <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}>
              <div style={{flex:1,minWidth:0,paddingRight:8}}>
                <div style={{fontSize:13,fontWeight:500,color:'#111',display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>
                  <TypeTag t={t.key}/>{e.patient_name||'-'}
                  {cr&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#fed7aa',color:'#92400e',fontWeight:700}}>CREDIT</span>}
                </div>
                <div style={{marginTop:3,display:'flex',gap:4,flexWrap:'wrap',alignItems:'center'}}>
                  {allEntries.map((x,xi)=><PayBadges key={xi} e={x} cr={isCredit(x)}/>)}
                  {canSeeReports&&doc&&<span style={{fontSize:10,color:'#d97706'}}>Ref: {doc}</span>}
                  {canSeeReports&&comm>0&&<span style={{fontSize:10,color:'#f59e0b',fontWeight:600}}>Comm: {fmt(comm)}</span>}
                  {e.type==='vc'&&e.consultant_fee>0&&<span style={{fontSize:10,color:'#7c3aed'}}>Fee: {fmt(e.consultant_fee)}</span>}
                  {cleanNotes(e.notes)&&<span style={{fontSize:10,color:'#aaa'}}>{cleanNotes(e.notes)}</span>}
                </div>
                {e.conditions&&e.conditions.split(',').filter(Boolean).length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:3}}>
                  {e.conditions.split(',').filter(Boolean).map(cd=><span key={cd} style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fdf4ff',color:'#7c3aed',fontWeight:700}}>{cd.trim()}</span>)}
                </div>}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
                <span style={{color:cr?'#c2410c':'#16a34a',fontWeight:600,fontSize:13}}>{fmt(totalAmt)}</span>
                <button onClick={()=>setEditEntry(e)} style={{padding:'5px 12px',background:'#f0f9ff',border:'1.5px solid #3b82f6',borderRadius:8,fontSize:12,color:'#1d4ed8',cursor:'pointer',fontWeight:600}}>Edit</button>
                <DBtn confirmText={allEntries.length>1?'Delete all '+allEntries.length+' split entries for '+(e.patient_name||'this patient')+'?\n\nTotal: Rs '+totalAmt+'\n\nThis cannot be undone.':'Delete entry for '+(e.patient_name||'this patient')+'?\n\nAmount: Rs '+e.amount+'\nType: '+(ITYPES.find(t=>t.key===e.type)?.full||e.type)+'\n\nThis cannot be undone.'} onClick={()=>allEntries.forEach(x=>actions.delIncome(x.id))}></DBtn>
              </div>
            </div>
          )})})()}</Card>
        </div>)
      })}
    </div>
  )
}

const IPTab=({db,actions,ipv,setIpv,ipid,setIpid,pF,setPF,cF,setCF,pyF,setPyF,gotoIP,prevTab,setPrevTab,setTab,setEditIPPatient,hospital,canSeeReports,gotoOP=null})=>{
  const [billPatient,setBillPatient]=useState(null)
  const [editIPEntry,setEditIPEntry]=useState(null)
  const [collectEntry,setCollectEntry]=useState(null)
  const [showRefModal,setShowRefModal]=useState(false)
  const [bulkRefDoc,setBulkRefDoc]=useState(null)
  const [payDocI,setPayDocI]=useState(null)
  const [pharmView,setPharmView]=useState('all')  // 'all' | 'settled' | 'credit'
  const [ipSearch,setIpSearch]=useState('')
  const [ipView,setIpView]=useState('active')
  const [ipMonth,setIpMonth]=useState(todayStr().slice(0,7))
  const [ipSort,setIpSort]=useState('newest')
  const [ipRefFilter,setIpRefFilter]=useState('')
  const [ipShowFilters,setIpShowFilters]=useState(false)
  const getBill=pid=>{
    const pat=db.ip_patients.find(x=>x.id===pid)
    const rawEn=db.income.filter(e=>e.patient_id===pid||(pat&&e.patient_name&&e.patient_name.trim().toLowerCase()===(pat.name||'').trim().toLowerCase()))
    // Enrich entries: use patient's ref_doctor + commission rate if entry lacks them
    const en=rawEn.map(e=>{
      if(e.ref_doctor&&e.ref_doctor.trim())return e
      if(!pat?.ref_doctor)return e
      const doc=db.ref_doctors.find(d=>d.name===pat.ref_doctor)
      const pctKey={ip:'ip_pct',ip_r:'ip_r_pct',ip_l:'ip_l_pct',ip_p:'ip_pct'}[e.type]
      let cc=e.custom_commission
      if(cc==null){
        if(doc&&pctKey&&doc[pctKey]!=null)cc=doc[pctKey]
        else if(pat.custom_commission!=null&&pat.custom_commission!=='')cc=parseFloat(pat.custom_commission)
      }
      return{...e,ref_doctor:pat.ref_doctor,custom_commission:cc}
    })
    // Split entries by purpose
    const chargeEnts=en.filter(e=>e.payment!=='discount'&&e.payment!=='written_off')
    const discount=en.filter(e=>e.payment==='discount').reduce((a,e)=>a+e.amount,0)
    const writtenOff=en.filter(e=>e.payment==='written_off').reduce((a,e)=>a+e.amount,0)
    const billed=chargeEnts.reduce((a,e)=>a+e.amount,0)  // gross charges
    const paid=cashTotal(chargeEnts)  // actually collected (cash/upi/card/bank/insurance)
    const credit=credTotal(chargeEnts)  // still owed
    const total=billed  // For backward compat — gross charges
    const comm=en.reduce((a,e)=>a+getComm(e),0)  // commission (already excludes discount/writeoff)
    const pats=db.ip_patients.find(p=>p.id===pid)
    const payments=pats?.payments||[]
    const pkgPaid=payments.reduce((a,e)=>a+e.amount,0)
    const pkgComm=payments.reduce((a,py)=>a+(py.commission||0),0)
    const balance=pats?.is_package?0:credit  // remaining credit IS the balance
    return{total,billed,paid:pats?.is_package?pkgPaid:paid,balance,commission:comm+pkgComm,credit,pkgComm,discount,writtenOff}
  }
  if(collectEntry)return(<CollectCreditForm entry={collectEntry} actions={actions} db={db} onCancel={()=>setCollectEntry(null)}/>)
  if(editIPEntry)return(<EditEntryForm entry={editIPEntry} db={db} canSeeReports={canSeeReports} onSave={async row=>{const ok=await actions.editIncome(row);if(ok!==false)setEditIPEntry(null)}} onCancel={()=>setEditIPEntry(null)}/>)

  if(billPatient)return(<IPBillingModule p={billPatient} db={db} onClose={()=>setBillPatient(null)} hospital={db.hospital}/>)
  if(ipv==='detail'&&ipid){
    const p=db.ip_patients.find(p=>p.id===ipid)
    if(!p)return<button onClick={()=>setIpv('list')} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer'}}>Back</button>
    const b=getBill(p.id)
    const rawEnts=db.income.filter(e=>e.patient_id===p.id||(e.patient_name&&e.patient_name.trim().toLowerCase()===(p.name||'').trim().toLowerCase()))
    const ents=rawEnts.map(e=>{
      if(e.ref_doctor&&e.ref_doctor.trim())return e
      if(!p.ref_doctor)return e
      const doc=db.ref_doctors.find(d=>d.name===p.ref_doctor)
      const pctKey={ip:'ip_pct',ip_r:'ip_r_pct',ip_l:'ip_l_pct',ip_p:'ip_pct'}[e.type]
      let cc=e.custom_commission
      if(cc==null){
        if(doc&&pctKey&&doc[pctKey]!=null)cc=doc[pctKey]
        else if(p.custom_commission!=null&&p.custom_commission!=='')cc=parseFloat(p.custom_commission)
      }
      return{...e,ref_doctor:p.ref_doctor,custom_commission:cc}
    })
    const patType=p.patient_type||'Regular'
    return(
      <div>
        {prevTab&&<button onClick={()=>{setPrevTab(null);setTab(prevTab);setIpv('list')}} style={{color:'#16a34a',fontSize:13,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,cursor:'pointer',marginBottom:8,display:'block',padding:'6px 14px',fontWeight:600}}>Back to Daily Report</button>}
        <button onClick={()=>{setPrevTab(null);setIpv('list')}} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer',marginBottom:12,display:'block'}}>All patients</button>

        <Card>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div>
              {(()=>{const opv=db.income.filter(e=>!['ip','ip_r','ip_l','ip_p'].includes(e.type)&&(e.patient_name||'').trim().toLowerCase()===(p.name||'').trim().toLowerCase()).length;return opv>0&&gotoOP?<button onClick={()=>gotoOP(p.name)} style={{float:'right',padding:'5px 12px',background:'#f0fdf4',border:'1.5px solid #86efac',borderRadius:8,fontSize:11,fontWeight:700,color:'#15803d',cursor:'pointer'}}>👤 OP profile ({opv} visits) →</button>:null})()}
              <div style={{fontSize:17,fontWeight:700,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>{p.name}{[...new Set(db.income.filter(e=>e.patient_id===p.id).flatMap(e=>(e.conditions||'').split(',').map(x=>x.trim()).filter(Boolean)))].map(cd=><span key={cd} style={{fontSize:10,padding:'2px 9px',borderRadius:20,background:'#fdf4ff',color:'#7c3aed',fontWeight:700}}>{cd}</span>)}</div>
              <div style={{fontSize:11,color:'#aaa',marginTop:4}}>Admitted: {fmtD(p.admission_date)}{p.discharge_date?' - Discharged: '+fmtD(p.discharge_date):<Pill label="Active" bg="#dcfce7" tx="#16a34a"/>}</div>
              {p.diagnosis&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>Dx: {p.diagnosis}</div>}
              {p.room&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>Room: {p.room}</div>}
              {p.phone&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>Ph: {p.phone}</div>}
              {p.reg_no&&<div style={{fontSize:11,color:'#1d4ed8',marginTop:2,fontWeight:600}}>Reg: {p.reg_no}</div>}
              {canSeeReports&&p.ref_doctor&&<div style={{fontSize:12,color:'#d97706',fontWeight:700,marginTop:6}}>Ref: Dr. {p.ref_doctor}</div>}
              <div style={{marginTop:8,display:'flex',gap:6,flexWrap:'wrap'}}>
                {patType==='Package'&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#dbeafe',color:'#1d4ed8',fontWeight:700}}>Package</span>}
                {patType==='VC'&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#f0fdf4',color:'#065f46',fontWeight:700}}>Visiting Consultant</span>}
                {patType==='Regular'&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#f0fdf4',color:'#16a34a',fontWeight:700}}>Regular IP</span>}
                {p.custom_commission!=null&&<span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#fff7ed',color:'#b45309',fontWeight:700}}>Custom comm: {p.custom_commission}%</span>}
              </div>
            </div>
            <div style={{display:'flex',gap:8,flexDirection:'column',alignItems:'flex-end'}}>
            {!p.discharge_date&&canSeeReports&&<GBtn onClick={()=>{if(window.confirm('Discharge '+(p.name||'this patient')+'?\n\nDischarge date will be set to today.\n\nThis can be undone later.'))actions.dischargePatient(p.id)}}>Discharge</GBtn>}
            {p.discharge_date&&canSeeReports&&<button onClick={async()=>{if(window.confirm('Undo discharge for '+(p.name||'this patient')+'?\n\nPatient was discharged on '+fmtD(p.discharge_date)+'.\n\nThis will reactivate the patient (discharge date cleared).'))await actions.undoDischarge(p.id)}} style={{padding:'8px 14px',background:'#fff7ed',border:'1.5px solid #fb923c',borderRadius:8,color:'#c2410c',fontSize:12,fontWeight:700,cursor:'pointer'}}>↻ Undo Discharge</button>}
            <button onClick={()=>setEditIPPatient&&setEditIPPatient({id:p.id,name:p.name,phone:p.phone||'',adm:p.admission_date||'',dx:p.diagnosis||'',room:p.room||'',ref:p.ref_doctor||'',patient_area:p.patient_area||'',insurance_type:p.insurance_type||'',insurance_policy_no:p.insurance_policy_no||'',insurance_expected:p.insurance_expected||0,insurance_status:p.insurance_status||'pending'})} style={{padding:'6px 12px',background:'#f0f9ff',border:'1.5px solid #3b82f6',borderRadius:8,fontSize:12,color:'#1d4ed8',cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>Edit info</button>
            {canSeeReports&&<button onClick={()=>setBulkRefDoc({patientId:p.id,name:p.name,currentRef:p.ref_doctor||''})} style={{padding:'6px 12px',background:'#fff7ed',border:'1.5px solid #f59e0b',borderRadius:8,fontSize:12,color:'#c2410c',cursor:'pointer',fontWeight:700,whiteSpace:'nowrap'}}>👨‍⚕️ Set Ref Doctor</button>}
            <button onClick={()=>setBillPatient(p)} style={{padding:'6px 12px',background:'#fefce8',border:'1.5px solid #d97706',borderRadius:8,fontSize:12,color:'#d97706',cursor:'pointer',fontWeight:600,whiteSpace:'nowrap'}}>🧾 Generate Bill</button>
          </div>
          </div>
        </Card>
        <MetGrid items={[{label:'Total billed',value:fmt(b.total)},{label:'Cash collected',value:fmt(b.paid),color:'#16a34a'},{label:'Credit (due)',value:fmt(b.credit),color:b.credit>0?'#c2410c':'#111'},{label:'Balance due',value:fmt(b.balance),color:b.balance>0?'#ef4444':'#16a34a'}]}/>
        {(()=>{
          const nm=(p.name||'').trim().toLowerCase()
          const entIds=new Set(ents.map(x=>x.id));const opEnts=db.income.filter(e=>!['ip','ip_r','ip_l','ip_p'].includes(e.type)&&(e.patient_name||'').trim().toLowerCase()===nm&&!entIds.has(e.id))
          if(opEnts.length===0)return null
          const byType={};opEnts.forEach(e=>{byType[e.type]=(byType[e.type]||0)+(e.amount||0)})
          const opTotal=opEnts.reduce((a,e)=>a+(e.amount||0),0)
          return(<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:'10px 14px',marginBottom:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <div style={{fontSize:11,fontWeight:800,color:'#15803d',textTransform:'uppercase',letterSpacing:'.4px'}}>👤 OP income — same patient ({opEnts.length} visits)</div>
              {gotoOP&&<button onClick={()=>gotoOP(p.name)} style={{padding:'3px 10px',background:'#fff',border:'1px solid #86efac',borderRadius:8,fontSize:10.5,fontWeight:700,color:'#15803d',cursor:'pointer'}}>View →</button>}
            </div>
            {Object.entries(byType).sort((a,b)=>b[1]-a[1]).map(([t,amt])=>(<div key={t} style={{display:'flex',justifyContent:'space-between',fontSize:12,color:'#374151',padding:'3px 0'}}><span>{(ITYPES.find(x=>x.key===t)||{}).full||t}</span><span style={{fontWeight:600,color:'#16a34a'}}>{fmt(amt)}</span></div>))}
            <div style={{display:'flex',justifyContent:'space-between',fontSize:12.5,fontWeight:800,paddingTop:6,marginTop:4,borderTop:'1px solid #bbf7d0'}}><span style={{color:'#15803d'}}>Total OP income</span><span style={{color:'#15803d'}}>{fmt(opTotal)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:13.5,fontWeight:900,paddingTop:8,marginTop:6,borderTop:'2px solid #86efac'}}><span style={{color:'#0f172a'}}>COMPLETE PATIENT TOTAL (IP + OP)</span><span style={{color:'#1d4ed8'}}>{fmt(b.total+opTotal)}</span></div>
          </div>)
        })()}
        {!p.discharge_date&&!p.is_package&&(<><SecL>Add charge</SecL><Card>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <FInp label="Date" type="date" value={cF.date} onChange={e=>setCF({...cF,date:e.target.value})}/>
            <FSel label="Type" value={cF.type} onChange={e=>{const newType=e.target.value;const newPay=newType==='ip_l'?'cash':'credit';setCF({...cF,type:newType,pay:newPay})}}>
              <option value="ip">IP Charges</option><option value="ip_r">IP Pharmacy</option><option value="ip_l">IP Lab</option><option value="ip_p">IP Package</option><option value="op_dm">OP Discharge Medicine</option><option value="vc">Visiting Consultant</option>
            </FSel>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <FInp label="Amount (Rs)" type="number" inputMode="numeric" placeholder="0" value={cF.amt} onChange={e=>setCF({...cF,amt:e.target.value})}/>
            <FSel label="Payment" value={cF.pay} onChange={e=>setCF({...cF,pay:e.target.value})}>
              {PMODES.map(m=><option key={m} value={m}>{m==='credit'?'⏳ Credit':m==='written_off'?'✂️ Written Off':m==='discount'?'🎟️ Discount':m[0].toUpperCase()+m.slice(1)}</option>)}
            </FSel>
          </div>
          {cF.type==='vc'&&<FInp label="Visiting consultant name" type="text" placeholder="e.g. Dr. Rao (Cardiologist)" value={cF.vcName||''} onChange={e=>setCF({...cF,vcName:e.target.value})}/> }
          {cF.type==='vc'&&<FInp label="Consultant fee to pay (Rs)" type="number" inputMode="numeric" placeholder="Amount you pay to consultant" value={cF.vcFee||''} onChange={e=>setCF({...cF,vcFee:e.target.value})}/> }
          {cF.pay==='credit'&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'7px 10px',marginBottom:8,fontSize:13,color:'#92400e'}}>Recording as credit</div>}
          {canSeeReports&&cF.amt&&p.ref_doctor&&cF.type!=='vc'&&(()=>{const doc=db.ref_doctors.find(d=>d.name===p.ref_doctor);const pctKey={ip:'ip_pct',ip_r:'ip_r_pct',ip_l:'ip_l_pct',ip_p:'ip_pct',op_dm:'op_r_pct'}[cF.type];const rate=doc&&pctKey?doc[pctKey]/100:(p.custom_commission!=null?p.custom_commission/100:(COMM[cF.type]||0));const comm=parseFloat(cF.amt||0)*rate;const typeLabel={'ip':'IP Charges','ip_r':'IP Pharmacy','ip_l':'IP Lab','ip_p':'IP Package','op_dm':'OP Discharge Medicine'}[cF.type]||cF.type;return(<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#92400e'}}><div style={{fontWeight:600,marginBottom:2}}>Commission to Dr. {p.ref_doctor}</div><div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{fontSize:11,color:'#b45309'}}>{typeLabel}: {Math.round(rate*100)}%</span><span style={{fontSize:15,fontWeight:700,color:'#c2410c'}}>{fmt(comm)}</span></div></div>)})()}
          {cF.type==='vc'&&cF.amt&&cF.vcFee&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,padding:'7px 10px',marginBottom:8,fontSize:13,color:'#065f46'}}>Your income: <strong>{fmt(parseFloat(cF.amt||0)-parseFloat(cF.vcFee||0))}</strong></div>}
          <FInp label="Notes" type="text" placeholder="e.g. Day 3 medicines" value={cF.notes} onChange={e=>setCF({...cF,notes:e.target.value})}/>
          <PBtn onClick={async()=>{const amt=parseFloat(cF.amt);if(!amt||amt<=0){alert('Enter amount');return};const isVC=cF.type==='vc';const ok=await actions.addIncome({id:uid(),date:cF.date,type:cF.type,amount:amt,patient_id:p.id,patient_name:p.name,payment:cF.pay,ref_doctor:isVC?(cF.vcName||''):(p.ref_doctor||''),notes:cF.notes,custom_commission:(()=>{const doc=db.ref_doctors.find(d=>d.name===p.ref_doctor);const pctKey={ip:'ip_pct',ip_r:'ip_r_pct',ip_l:'ip_l_pct',ip_p:'ip_pct',op_dm:'op_r_pct'}[cF.type];const isVC=cF.type==='vc';if(isVC)return null;if(doc&&pctKey)return doc[pctKey];if(p.custom_commission!=null)return p.custom_commission;return null})(),consultant_fee:isVC?parseFloat(cF.vcFee||0):0,reg_no:p.reg_no||''});if(ok!==false)setCF({...cF,amt:'',notes:'',vcName:'',vcFee:''})}}>Add charge</PBtn>
        </Card></>)}
        {/* Charges breakdown */}
        {canSeeReports&&<Card style={{marginBottom:12}}>
          <div style={{fontSize:11,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:10}}>Charges breakdown</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,marginBottom:8,paddingBottom:6,borderBottom:'1px solid #f0f0f0'}}>
            <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Type</div>
            <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:60}}>Billed</div>
            <div style={{fontSize:9,color:'#ef4444',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:60}}>Comm</div>
            <div style={{fontSize:9,color:'#16a34a',fontWeight:700,textTransform:'uppercase',textAlign:'right',minWidth:60}}>Real</div>
          </div>
          {ITYPES.map(t=>{const te=ents.filter(e=>e.type===t.key);if(!te.length)return null;const inc=te.reduce((a,e)=>a+e.amount,0);const cm=te.reduce((a,e)=>a+getComm(e),0);return(<div key={t.key} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'6px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center'}}><span style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}><TypeTag t={t.key}/>{t.full}</span><span style={{fontSize:12,textAlign:'right',minWidth:60}}>{fmt(inc)}</span><span style={{fontSize:12,textAlign:'right',color:'#ef4444',minWidth:60}}>{cm>0?'-'+fmt(cm):'-'}</span><span style={{fontSize:12,textAlign:'right',color:'#16a34a',fontWeight:600,minWidth:60}}>{fmt(inc-cm)}</span></div>)})}
          {(()=>{
            const nm=(p.name||'').trim().toLowerCase()
            const entIds=new Set(ents.map(x=>x.id));const opEnts=db.income.filter(e=>!['ip','ip_r','ip_l','ip_p'].includes(e.type)&&(e.patient_name||'').trim().toLowerCase()===nm&&!entIds.has(e.id))
            if(opEnts.length===0)return null
            const ipInc=ents.reduce((a,e)=>a+e.amount,0),ipCm=ents.reduce((a,e)=>a+getComm(e),0)
            const opInc=opEnts.reduce((a,e)=>a+e.amount,0),opCm=opEnts.reduce((a,e)=>a+getComm(e),0)
            return(<>
              <div style={{fontSize:10,fontWeight:800,color:'#15803d',textTransform:'uppercase',letterSpacing:'.4px',padding:'8px 0 4px'}}>👤 OP visits (same patient)</div>
              {ITYPES.map(t=>{const te=opEnts.filter(e=>e.type===t.key);if(!te.length)return null;const inc=te.reduce((a,e)=>a+e.amount,0);const cm=te.reduce((a,e)=>a+getComm(e),0);return(<div key={'op'+t.key} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'6px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center',background:'#f0fdf422'}}><span style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}><TypeTag t={t.key}/>{t.full}</span><span style={{fontSize:12,textAlign:'right',minWidth:60}}>{fmt(inc)}</span><span style={{fontSize:12,textAlign:'right',color:'#ef4444',minWidth:60}}>{cm>0?'-'+fmt(cm):'-'}</span><span style={{fontSize:12,textAlign:'right',color:'#16a34a',fontWeight:600,minWidth:60}}>{fmt(inc-cm)}</span></div>)})}
              <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'8px 0 2px',alignItems:'center',borderTop:'2px solid #e2e8f0',marginTop:4}}>
                <span style={{fontSize:12.5,fontWeight:900,color:'#0f172a'}}>TOTAL (IP + OP)</span>
                <span style={{fontSize:12.5,textAlign:'right',fontWeight:800,minWidth:60}}>{fmt(ipInc+opInc)}</span>
                <span style={{fontSize:12.5,textAlign:'right',color:'#ef4444',fontWeight:800,minWidth:60}}>-{fmt(ipCm+opCm)}</span>
                <span style={{fontSize:12.5,textAlign:'right',color:'#16a34a',fontWeight:900,minWidth:60}}>{fmt(ipInc+opInc-ipCm-opCm)}</span>
              </div>
            </>)
          })()}
          {p.is_package&&(p.payments||[]).length>0&&(()=>{const pkgPd=(p.payments||[]).reduce((a,py)=>a+py.amount,0);const pkgCm=(p.payments||[]).reduce((a,py)=>a+(py.commission||0),0);return(<div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'6px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center'}}><span style={{fontSize:12,color:'#1d4ed8'}}>Package received</span><span style={{fontSize:12,textAlign:'right',color:'#1d4ed8',minWidth:60}}>{fmt(pkgPd)}</span><span style={{fontSize:12,textAlign:'right',color:'#ef4444',minWidth:60}}>{pkgCm>0?'-'+fmt(pkgCm):'-'}</span><span style={{fontSize:12,textAlign:'right',color:'#16a34a',fontWeight:600,minWidth:60}}>{fmt(pkgPd-pkgCm)}</span></div>)})()}
          {(()=>{const allInc=ents.reduce((a,e)=>a+e.amount,0);const allComm=ents.reduce((a,e)=>a+getComm(e),0);const pkgPd=(p.payments||[]).reduce((a,py)=>a+py.amount,0);const totDeduct=allComm+b.pkgComm;return(<div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'8px 0 2px',marginTop:2,borderTop:'2px solid #111'}}><span style={{fontSize:13,fontWeight:800}}>Total</span><span style={{fontSize:13,fontWeight:800,textAlign:'right',minWidth:60}}>{fmt(allInc+pkgPd)}</span><span style={{fontSize:13,fontWeight:800,textAlign:'right',color:'#ef4444',minWidth:60}}>{totDeduct>0?'-'+fmt(totDeduct):'-'}</span><span style={{fontSize:13,fontWeight:800,textAlign:'right',color:'#16a34a',minWidth:60}}>{fmt(allInc+pkgPd-totDeduct)}</span></div>)})()}
        </Card>}
        {canSeeReports&&(()=>{
          const nm=(p.name||'').trim().toLowerCase()
          const entIds=new Set(ents.map(x=>x.id));const opEnts=db.income.filter(e=>!['ip','ip_r','ip_l','ip_p'].includes(e.type)&&(e.patient_name||'').trim().toLowerCase()===nm&&!entIds.has(e.id))
          const allP=[...ents,...opEnts]
          // Effective payout ratio per doctor: (earned − deducted) / earned — reflects what you ACTUALLY give
          const effCache={}
          const eff=(dn)=>{
            if(!dn)return 1
            if(effCache[dn]!=null)return effCache[dn]
            const earned=db.income.filter(e=>e.ref_doctor===dn).reduce((a,e)=>a+getComm(e),0)
            const ded=db.expenses.filter(e=>isRetainedCat(e.category)&&(e.description||'').trim()===dn).reduce((a,e)=>a+e.amount,0)
            const r=earned>0?Math.max(0,Math.min(1,(earned-ded)/earned)):1
            effCache[dn]=r;return r
          }
          const seg=(s)=>{
            const se=allP.filter(e=>incomeSegment(e.type)===s&&e.payment!=='discount'&&e.payment!=='written_off')
            const inc=se.reduce((a,e)=>a+(e.amount||0),0)
            const cmCalc=se.reduce((a,e)=>a+getComm(e),0)
            const cm=se.reduce((a,e)=>a+getComm(e)*eff((e.ref_doctor||'').trim()),0)
            const cf=s==='clinical'?se.reduce((a,e)=>a+(e.consultant_fee||0),0):0
            return{inc,cm,cmCalc,cf,left:inc-cm-cf}
          }
          const cl=seg('clinical'),lb=seg('lab')
          if(cl.inc+lb.inc===0)return null
          const totalLeft=cl.left+lb.left
          return(<div style={{background:'linear-gradient(135deg,#15803d,#16a34a)',color:'#fff',borderRadius:14,padding:'14px 16px',marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:800,textTransform:'uppercase',letterSpacing:'.5px',opacity:.9,marginBottom:10}}>💰 Profit after doctor payouts — this patient</div>
            <div style={{background:'rgba(255,255,255,.13)',borderRadius:10,padding:'8px 12px',marginBottom:8}}>
              <div style={{fontSize:11,fontWeight:800,opacity:.85,marginBottom:4}}>🏥 CLINICAL</div>
              <div style={{fontSize:12,opacity:.95,lineHeight:1.6}}>Income {fmt(cl.inc)} − Ref commission (actual) {fmt(Math.round(cl.cm))}{cl.cf>0?' − Consultant fees '+fmt(Math.round(cl.cf)):''}</div>{Math.round(cl.cmCalc)>Math.round(cl.cm)&&<div style={{fontSize:10.5,opacity:.75}}>Calculated was {fmt(Math.round(cl.cmCalc))} — you kept {fmt(Math.round(cl.cmCalc-cl.cm))} via deduction</div>}
              <div style={{fontSize:17,fontWeight:900,marginTop:2}}>= {fmt(Math.round(cl.left))}</div>
            </div>
            <div style={{background:'rgba(255,255,255,.13)',borderRadius:10,padding:'8px 12px',marginBottom:10}}>
              <div style={{fontSize:11,fontWeight:800,opacity:.85,marginBottom:4}}>🧪 LAB</div>
              <div style={{fontSize:12,opacity:.95,lineHeight:1.6}}>Income {fmt(lb.inc)} − Ref commission (actual) {fmt(Math.round(lb.cm))}</div>{Math.round(lb.cmCalc)>Math.round(lb.cm)&&<div style={{fontSize:10.5,opacity:.75}}>Calculated was {fmt(Math.round(lb.cmCalc))} — you kept {fmt(Math.round(lb.cmCalc-lb.cm))} via deduction</div>}
              <div style={{fontSize:17,fontWeight:900,marginTop:2}}>= {fmt(Math.round(lb.left))}</div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',borderTop:'2px solid rgba(255,255,255,.35)',paddingTop:10}}>
              <span style={{fontSize:12.5,fontWeight:800,textTransform:'uppercase',letterSpacing:'.4px'}}>Left with hospital</span>
              <span style={{fontSize:24,fontWeight:900}}>{fmt(Math.round(totalLeft))}</span>
            </div>
            <div style={{fontSize:10,opacity:.75,marginTop:6}}>Uses each doctor's actual payout ratio (after your deductions) · includes this admission + OP visits · before operating expenses</div>
          </div>)
        })()}
        {b.credit>0&&(<><SecL>Credit by type</SecL><Card style={{border:'1px solid #fed7aa',background:'#fffbf5'}}>{['ip','ip_r','ip_l','ip_p','op_dm'].map(tk=>{const te=ents.filter(e=>e.type===tk&&isCredit(e));if(!te.length)return null;const ta=te.reduce((a,e)=>a+e.amount,0);return(<div key={tk} style={{padding:'8px 0',borderBottom:'1px solid #fef3c7'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{display:'flex',alignItems:'center',gap:6,fontSize:13}}><TypeTag t={tk}/>{ITYPES.find(t=>t.key===tk)?.full}</span>
                  <div style={{display:'flex',alignItems:'center',gap:8}}>
                    <span style={{color:'#c2410c',fontWeight:700}}>{fmt(ta)}</span>
                  </div>
                </div>
                {te.map(e=>(
                  <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:6,paddingTop:6,borderTop:'1px dashed #fef3c7'}}>
                    <span style={{fontSize:12,color:'#92400e',flex:1,minWidth:0}}>{fmtD(e.date)} - {fmt(e.amount)}{e.notes?' - '+e.notes:''}</span>
                    <div style={{display:'flex',gap:4,flexShrink:0}}>
                      <button onClick={()=>setCollectEntry(e)} style={{padding:'4px 10px',background:'#16a34a',border:'none',borderRadius:8,fontSize:11,color:'#fff',cursor:'pointer',fontWeight:700}}>Collect</button>
                      {canSeeReports&&<button onClick={async()=>{if(!window.confirm('Write off Rs '+e.amount+' credit?\n\nThis is treated as an uncollectible loss. The entry stays on record but stops counting as outstanding credit.'))return;const note='\u26A0\uFE0F Written off on '+fmtD(todayStr())+(e.notes?' \u00B7 '+e.notes:'');await actions.editIncome({...e,payment:'written_off',notes:note})}} style={{padding:'4px 10px',background:'#fff',border:'1.5px solid #dc2626',borderRadius:8,fontSize:11,color:'#dc2626',cursor:'pointer',fontWeight:700}}>Write off</button>}
                    </div>
                  </div>
                ))}
              </div>)})}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #fed7aa',fontSize:14,fontWeight:700,color:'#c2410c'}}><span>Total credit</span><span>{fmt(b.credit)}</span></div>
        {b.credit>0&&!p.discharge_date&&<div style={{display:'flex',gap:8,marginTop:10,paddingTop:10,borderTop:'1px dashed #fed7aa'}}>
          <button onClick={async()=>{
            const amt=prompt('Discount amount (Rs)?\n\nThis will reduce the outstanding credit balance.\nNot counted as income.','0')
            const n=parseFloat(amt);if(!n||n<=0)return
            if(n>b.credit){alert('Cannot exceed credit balance Rs '+fmt(b.credit));return}
            const note=prompt('Reason for discount (e.g. Senior citizen, repeat patient)','Discount')||'Discount applied'
            // Create discount entry for audit trail
            await actions.addIncome({id:uid(),date:todayStr(),type:'ip',amount:n,patient_id:p.id,patient_name:p.name,payment:'discount',ref_doctor:p.ref_doctor||'',notes:note,reg_no:p.reg_no||''})
            // Reduce credit entries (oldest first) by discount amount
            const creditEnts=db.income.filter(e=>e.patient_id===p.id&&e.payment==='credit').sort((a,b)=>(a.date||'').localeCompare(b.date||''))
            let remaining=n
            for(const ce of creditEnts){
              if(remaining<=0)break
              const reduce=Math.min(remaining,ce.amount)
              if(reduce>=ce.amount){await actions.delIncome(ce.id)}
              else{await actions.editIncome({...ce,amount:ce.amount-reduce})}
              remaining-=reduce
            }
          }} style={{flex:1,padding:'9px 12px',background:'#ede9fe',color:'#6d28d9',border:'1.5px solid #c4b5fd',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'}}>🎟️ Apply Discount</button>
          <button onClick={async()=>{
            if(!window.confirm('Write off ENTIRE balance of Rs '+fmt(b.credit)+'?\n\nThis will be marked as bad debt and NOT counted as income.'))return
            const note=prompt('Reason for write-off (e.g. Patient absconded, charity case)','Bad debt')||'Written off'
            // Create write-off entry for audit
            await actions.addIncome({id:uid(),date:todayStr(),type:'ip',amount:b.credit,patient_id:p.id,patient_name:p.name,payment:'written_off',ref_doctor:p.ref_doctor||'',notes:note,reg_no:p.reg_no||''})
            // Remove all credit entries for this patient
            const creditEnts=db.income.filter(e=>e.patient_id===p.id&&e.payment==='credit')
            for(const ce of creditEnts){await actions.delIncome(ce.id)}
          }} style={{flex:1,padding:'9px 12px',background:'#f3f4f6',color:'#374151',border:'1.5px solid #d1d5db',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'}}>✂️ Write Off Balance</button>
        </div>}
        </Card></>)}
        {p.ref_doctor&&!p.is_package&&ents.length>0&&canSeeReports&&(<><SecL>Commission breakdown</SecL><Card style={{border:'1px solid #fed7aa',background:'#fffbf5'}}>{['ip','ip_r','ip_l','ip_p','op_dm','op','opd','op_r','op_l','op_p','vc'].map(tk=>{const te=ents.filter(e=>e.type===tk&&getComm(e)>0);if(!te.length)return null;const inc=te.reduce((a,e)=>a+e.amount,0);const cm=te.reduce((a,e)=>a+getComm(e),0);return(<Row key={tk} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={tk}/>{ITYPES.find(t=>t.key===tk)?.full}</span>} sub={fmt(inc)+' x comm'} right={<span style={{color:'#d97706',fontWeight:700}}>{fmt(cm)}</span>}/>)})}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #fed7aa',fontSize:14,fontWeight:700,color:'#c2410c'}}><span>Total to pay {p.ref_doctor}</span><span>{fmt(b.commission)}</span></div>
        {(()=>{
          const dn=p.ref_doctor
          const gEarned=db.income.filter(e=>e.ref_doctor===dn).reduce((a,e)=>a+getComm(e),0)
          const gPaid=db.expenses.filter(e=>e.category==='ref_paid'&&e.description===dn).reduce((a,e)=>a+e.amount,0)
          const gRet=db.expenses.filter(e=>isRetainedCat(e.category)&&e.description===dn).reduce((a,e)=>a+e.amount,0)
          const gDue=gEarned-gPaid-gRet
          return(<div style={{marginTop:10}}>
            <div style={{fontSize:10.5,color:'#94a3b8',fontWeight:600,marginBottom:8}}>Dr. {dn} account (all patients): Earned {fmt(gEarned)} · Paid {fmt(gPaid)}{gRet>0?' · Retained '+fmt(gRet):''} · <span style={{color:gDue>0?'#c2410c':'#16a34a',fontWeight:800}}>Due {fmt(Math.max(0,gDue))}</span></div>
            {payDocI==='PAY'?<CommPayForm docName={dn} balance={Math.max(0,Math.min(b.commission,gDue))||b.commission} onCancel={()=>setPayDocI(null)} onSave={async(amt,date,pay)=>{await settleRefPayment(db,actions,dn,amt,date,pay,0);setPayDocI(null)}}/>
             :payDocI==='DED'?<DeductCommForm db={db} docName={dn} balance={Math.max(0,gDue)} onCancel={()=>setPayDocI(null)} onSave={async(g1,g2,d1,d2,date,pay)=>{if(g1+g2>0)await actions.addExpense({id:uid(),date,category:'ref_paid',amount:Math.round(g1+g2),description:dn,payment:pay,is_monthly:false});await deductCommSplit(actions,dn,date,d1,d2);setPayDocI(null)}}/>
             :gDue>0.5?<div style={{display:'flex',gap:8}}>
                <button onClick={()=>setPayDocI('PAY')} style={{flex:2,padding:'10px',background:'#111',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Record commission payment</button>
                <button onClick={()=>setPayDocI('DED')} style={{flex:1,padding:'10px',background:'#fffbeb',color:'#b45309',border:'1.5px solid #fcd34d',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer'}}>− Deduct</button>
              </div>
             :<div style={{textAlign:'center',fontSize:12,color:'#16a34a',fontWeight:600}}>✓ Doctor fully settled</div>}
          </div>)
        })()}
        {canSeeReports&&<button onClick={()=>setShowRefModal(true)} style={{marginTop:10,width:'100%',padding:'10px',background:'linear-gradient(135deg,#1a1a2e,#16213e)',color:'#c9a84c',border:'none',borderRadius:10,fontSize:13,fontWeight:800,cursor:'pointer'}}>📄 Generate Referral PDF</button>}
        {showRefModal&&<ReferralReportModal entries={ents.filter(e=>getComm(e)>0)} docName={p.ref_doctor} patientName={p.name} hospital={hospital} onClose={()=>setShowRefModal(false)}/>}
        
        </Card></>)}

        {!p.discharge_date&&p.is_package&&(<><SecL>Package payment received</SecL><Card style={{border:'1px solid #d1fae5',background:'#f0fdf4'}}>
          <div style={{fontSize:11,color:'#065f46',fontWeight:600,marginBottom:10}}>Package payment - commission: {p.custom_commission!=null?p.custom_commission+'%':'40% (default)'}. Referral commission auto-calculated.</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <FInp label="Date" type="date" value={pyF.date} onChange={e=>setPyF({...pyF,date:e.target.value})}/>
            <FInp label="Package amount (Rs)" type="number" inputMode="numeric" placeholder="0" value={pyF.amt} onChange={e=>setPyF({...pyF,amt:e.target.value})}/>
          </div>
          {canSeeReports&&pyF.amt&&p.ref_doctor&&(()=>{const pkgRate=p.custom_commission!=null?p.custom_commission/100:0.40;const pkgComm=parseFloat(pyF.amt||0)*pkgRate;const pkgNet=parseFloat(pyF.amt||0)-pkgComm;return(<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'8px 12px',marginBottom:8,fontSize:13,color:'#92400e'}}>Commission to Dr. {p.ref_doctor}: <strong>{fmt(pkgComm)}</strong> ({Math.round(pkgRate*100)}%) - Net: <strong style={{color:'#16a34a'}}>{fmt(pkgNet)}</strong></div>)})()}
          <FSel label="Payment mode" value={pyF.pay} onChange={e=>setPyF({...pyF,pay:e.target.value})}>
            {PMODES.map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}
          </FSel>
          <PBtn style={{background:'#16a34a'}} onClick={async()=>{const amt=parseFloat(pyF.amt);if(!amt||amt<=0){alert('Enter amount');return};const pkgRate=p.custom_commission!=null?p.custom_commission/100:0.40;const comm=p.ref_doctor?Math.round(amt*pkgRate):0;await actions.addPayment(p.id,{id:uid(),date:pyF.date,amount:amt,payment:pyF.pay,commission:comm,ref_doctor:p.ref_doctor||''});setPyF({...pyF,amt:''})}}>Save package payment</PBtn>
        </Card></>)}
        {!p.is_package&&ITYPES.filter(t=>['ip','ip_r','ip_l','ip_p','op_dm','vc'].includes(t.key)).map(t=>{const teAll=ents.filter(e=>e.type===t.key);if(!teAll.length)return null;const isPharm=t.key==='ip_r';const te=isPharm?(pharmView==='settled'?teAll.filter(e=>!isCredit(e)):pharmView==='credit'?teAll.filter(e=>isCredit(e)):teAll):teAll;return(<div key={t.key}><SecL>{t.full} - {fmt(te.reduce((a,e)=>a+e.amount,0))}</SecL>
        {isPharm&&<div style={{display:'flex',gap:6,marginBottom:8}}>
          {[{k:'all',l:'📋 Actual bills'},{k:'settled',l:'✓ After settlement'},{k:'credit',l:'⏳ Pending credit'}].map(v=>(
            <button key={v.k} onClick={()=>setPharmView(v.k)} style={{flex:1,padding:'7px 8px',background:pharmView===v.k?'#1a1a2e':'#fff',color:pharmView===v.k?'#c9a84c':'#64748b',border:pharmView===v.k?'none':'1.5px solid #e2e8f0',borderRadius:8,fontSize:11,fontWeight:700,cursor:'pointer'}}>{v.l}</button>
          ))}
        </div>}
        {isPharm&&te.length===0?<Card><div style={{textAlign:'center',padding:'10px 0',color:'#94a3b8',fontSize:12}}>{pharmView==='credit'?'✓ No pending credit — all settled':'No settled entries yet'}</div></Card>:<Card>{te.map(e=>{const cr=isCredit(e);return(<div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}><div style={{flex:1}}><div style={{fontSize:13,fontWeight:500,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>{fmtD(e.date)}{e.created_at&&<span style={{fontSize:10.5,color:'#94a3b8',fontWeight:600}}>🕐 {fmtT(e.created_at)}</span>}{cr&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#fed7aa',color:'#92400e',fontWeight:700}}>CREDIT</span>}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>{cr?'Credit':e.payment}{e.notes?' - '+e.notes:''}{canSeeReports&&getComm(e)>0?' - Comm: '+fmt(getComm(e)):''}{e.entered_by?<span style={{marginLeft:6,fontStyle:'italic',color:'#94a3b8'}}>· by {e.entered_by}</span>:null}</div></div><div style={{display:'flex',alignItems:'center',gap:6}}><span style={{color:cr?'#c2410c':'#16a34a',fontWeight:600,fontSize:13}}>{fmt(e.amount)}</span>{cr&&<><button onClick={()=>setCollectEntry(e)} style={{padding:'4px 10px',background:'#16a34a',border:'none',borderRadius:8,fontSize:11,color:'#fff',cursor:'pointer',fontWeight:700}}>Collect</button>{canSeeReports&&<button onClick={async()=>{if(!window.confirm('Write off Rs '+e.amount+' credit?\n\nThis is treated as an uncollectible loss. The entry stays on record but stops counting as outstanding credit.'))return;const note='\u26A0\uFE0F Written off on '+fmtD(todayStr())+(e.notes?' \u00B7 '+e.notes:'');await actions.editIncome({...e,payment:'written_off',notes:note})}} style={{padding:'4px 10px',background:'#fff',border:'1.5px solid #dc2626',borderRadius:8,fontSize:11,color:'#dc2626',cursor:'pointer',fontWeight:700,marginLeft:4}}>Write off</button>}</>}<button onClick={()=>setEditIPEntry(e)} style={{padding:'5px 12px',background:'#f0f9ff',border:'1.5px solid #3b82f6',borderRadius:8,fontSize:12,color:'#1d4ed8',cursor:'pointer',fontWeight:600}}>Edit</button><DBtn confirmText={'Delete this charge?\n\nPatient: '+(p.name||'')+'\nType: '+(ITYPES.find(t=>t.key===e.type)?.full||e.type)+'\nAmount: Rs '+e.amount+'\nPayment: '+e.payment+'\n\nThis cannot be undone.'} onClick={()=>actions.delIncome(e.id)}>X</DBtn></div></div>)})}</Card>}</div>)})}
        {p.insurance_type&&(<>

          <Card>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'8px 0',borderBottom:'1px solid #f5f5f5'}}>
              <div><div style={{fontSize:13,fontWeight:700}}>{p.insurance_type}</div>
                {p.insurance_policy_no&&<div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>Policy: {p.insurance_policy_no}</div>}
                {p.insurance_expected>0&&<div style={{fontSize:11,color:'#2563eb',marginTop:2}}>Expected: {fmt(p.insurance_expected)}</div>}
              </div>
              <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:700,
                background:p.insurance_status==='approved'?'#f0fdf4':p.insurance_status==='rejected'?'#fef2f2':'#fffbeb',
                color:p.insurance_status==='approved'?'#16a34a':p.insurance_status==='rejected'?'#dc2626':'#d97706'
              }}>{p.insurance_status==='approved'?'Approved':p.insurance_status==='rejected'?'Rejected':'Pending'}</span>
            </div>
            {/* Insurance update UI */}
            {p.insurance_expected>0&&(()=>{
              const insRec=(p.payments||[]).filter(py=>py.mode==='insurance').reduce((a,py)=>a+(py.amount||0),0)
              const insPend=p.insurance_expected-insRec
              const totalBill=db.income.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+(e.amount||0),0)
              const copay=Math.max(totalBill-p.insurance_expected,0)
              const cashRec=(p.payments||[]).filter(py=>py.mode!=='insurance').reduce((a,py)=>a+(py.amount||0),0)
              const copayPending=Math.max(copay-cashRec,0)
              return(<div style={{marginTop:8,paddingTop:8,borderTop:'1px solid #e5e7eb'}}>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:6}}>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:9,color:'#94a3b8',fontWeight:700}}>TOTAL BILL</div>
                    <div style={{fontSize:13,fontWeight:800,color:'#0f172a'}}>{fmt(totalBill)}</div>
                  </div>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:9,color:'#2563eb',fontWeight:700}}>INS PAYS</div>
                    <div style={{fontSize:13,fontWeight:800,color:'#2563eb'}}>{fmt(p.insurance_expected)}</div>
                  </div>
                  <div style={{textAlign:'center'}}>
                    <div style={{fontSize:9,color:'#7c3aed',fontWeight:700}}>CO-PAY</div>
                    <div style={{fontSize:13,fontWeight:800,color:'#7c3aed'}}>{fmt(copay)}</div>
                  </div>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:11}}>
                  <div>
                    <div style={{color:'#94a3b8'}}>Ins received: {fmt(insRec)}</div>
                    {insPend>0&&<div style={{color:'#d97706',fontWeight:700}}>Ins pending: {fmt(insPend)}</div>}
                    {copayPending>0&&<div style={{color:'#dc2626',fontWeight:700}}>Co-pay pending: {fmt(copayPending)}</div>}
                  </div>
                  <span style={{fontSize:12,fontWeight:800,color:insPend===0&&copayPending===0?'#16a34a':'#d97706',alignSelf:'center'}}>{insPend===0&&copayPending===0?'Settled':'Pending'}</span>
                </div>
              </div>)
            })()}
          </Card>
        </>)}
        {!p.is_package&&(()=>{
          const nm=(p.name||'').trim().toLowerCase()
          const ids=new Set(ents.map(e=>e.id))
          const opEnts=db.income.filter(e=>!['ip','ip_r','ip_l','ip_p'].includes(e.type)&&(e.patient_name||'').trim().toLowerCase()===nm&&!ids.has(e.id))
          if(opEnts.length===0)return null
          return ITYPES.filter(t=>opEnts.some(e=>e.type===t.key)).map(t=>{
            const te=opEnts.filter(e=>e.type===t.key).slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))
            return(<div key={'optx'+t.key}><SecL>👤 OP · {t.full} - {fmt(te.reduce((a,e)=>a+e.amount,0))}</SecL><Card style={{border:'1px solid #bbf7d0'}}>{te.map(e=>{const cr=isCredit(e);return(
              <div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>{fmtD(e.date)}{e.created_at&&<span style={{fontSize:10.5,color:'#94a3b8',fontWeight:600}}>🕐 {fmtT(e.created_at)}</span>}{cr&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#fed7aa',color:'#92400e',fontWeight:700}}>CREDIT</span>}<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#f0fdf4',color:'#15803d',fontWeight:700}}>OP</span></div>
                  <div style={{fontSize:11,color:'#aaa',marginTop:2}}>{cr?'Credit':e.payment}{e.notes?' - '+cleanNotes(e.notes):''}{canSeeReports&&getComm(e)>0?' - Comm: '+fmt(getComm(e)):''}</div>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:6}}>
                  <span style={{color:cr?'#c2410c':'#16a34a',fontWeight:600,fontSize:13}}>{fmt(e.amount)}</span>
                  {cr&&<button onClick={()=>setCollectEntry(e)} style={{padding:'4px 10px',background:'#16a34a',border:'none',borderRadius:8,fontSize:11,color:'#fff',cursor:'pointer',fontWeight:700}}>Collect</button>}
                </div>
              </div>)})}
            </Card></div>)})
        })()}
        {(()=>{const nonInsPay=(p.payments||[]).filter(py=>py.mode!=='insurance');if(!nonInsPay.length)return null;return(<><SecL>Payments received</SecL><Card>{nonInsPay.map(py=>(<div key={py.id} style={{padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{fontSize:13,fontWeight:500}}>{fmtD(py.date)} - {py.payment||py.mode||'cash'}</div>{py.commission>0&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>Commission: {fmt(py.commission)} - Net: {fmt(py.amount-py.commission)}</div>}</div><div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:6}}><span style={{color:'#16a34a',fontWeight:700,fontSize:14}}>{fmt(py.amount)}</span><DBtn onClick={()=>{if(window.confirm('Delete this payment?'))actions.deletePayment(p.id,py.id)}}>Delete</DBtn></div></div></div>))}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #f0f0f0',fontSize:13,fontWeight:700}}><span>Total received</span><span style={{color:'#16a34a'}}>{fmt(nonInsPay.reduce((a,py)=>a+py.amount,0))}</span></div></Card>
</>)})()}
        {bulkRefDoc&&(<div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.6)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
          <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:480,padding:'20px 18px'}}>
            <div style={{fontSize:17,fontWeight:800,color:'#1a1a2e',marginBottom:4}}>Set Ref Doctor</div>
            <div style={{fontSize:12,color:'#64748b',marginBottom:14}}>Patient: <strong>{bulkRefDoc.name}</strong><br/>This will set the ref doctor on the patient AND propagate to ALL IP entries (charges, pharmacy, lab, package, OP-DM).</div>
            <FSel label="Referring Doctor" value={bulkRefDoc.currentRef} onChange={e=>setBulkRefDoc({...bulkRefDoc,currentRef:e.target.value})}>
              <option value="">- No referral / Self -</option>
              {db.ref_doctors.map(d=><option key={d.id} value={d.name}>Dr. {d.name}{d.area?' ('+d.area+')':''}</option>)}
            </FSel>
            <div style={{display:'flex',gap:8,marginTop:14}}>
              <button onClick={()=>setBulkRefDoc(null)} style={{flex:1,padding:'10px',background:'#f3f4f6',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Cancel</button>
              <button onClick={async()=>{
                const newRef=(bulkRefDoc.currentRef||'').trim()
                const targetEnts=db.income.filter(e=>['ip','ip_r','ip_l','ip_p','op_dm'].includes(e.type)&&(e.patient_id===bulkRefDoc.patientId||(e.patient_name||'').trim().toLowerCase()===(bulkRefDoc.name||'').trim().toLowerCase()))
                if(!window.confirm('Set Dr. '+(newRef||'(no referral)')+' for '+bulkRefDoc.name+' and update '+targetEnts.length+' existing IP entries?'))return
                await actions.updateIPPatient(bulkRefDoc.patientId,{ref_doctor:newRef})
                const doc=db.ref_doctors.find(d=>d.name===newRef)
                let updated=0
                for(const e of targetEnts){
                  const pctKey={ip:'ip_pct',ip_r:'ip_r_pct',ip_l:'ip_l_pct',ip_p:'ip_pct',op_dm:'op_r_pct'}[e.type]
                  const newCC=doc&&pctKey&&doc[pctKey]!=null?doc[pctKey]:null
                  const ok=await actions.editIncome({...e,ref_doctor:newRef,custom_commission:newCC,patient_id:bulkRefDoc.patientId})
                  if(ok!==false)updated++
                }
                alert('✅ Updated patient and '+updated+' entries with Dr. '+(newRef||'(no referral)'))
                setBulkRefDoc(null)
              }} style={{flex:2,padding:'10px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Apply to All Entries</button>
            </div>
          </div>
        </div>)}
        <div style={{marginTop:24,paddingTop:16,borderTop:'2px solid #fecaca'}}><button style={{width:'100%',padding:'12px',background:'#fef2f2',color:'#dc2626',border:'2px solid #fecaca',borderRadius:12,fontSize:14,fontWeight:700,cursor:'pointer'}} onClick={()=>{if(window.confirm('Delete '+p.name+' and ALL their records?')){actions.deletePatient(p.id);setIpv('list')}}}>Delete this patient and all records</button></div>
    </div>
    )
  }
  const active=db.ip_patients.filter(p=>!p.discharge_date)
  const disc=db.ip_patients.filter(p=>p.discharge_date)
  const allIP=[...active,...disc.slice().reverse()]
  const qb=pid=>{const en=db.income.filter(e=>e.patient_id===pid);const t=en.reduce((a,e)=>a+e.amount,0);const p=db.ip_patients.find(pt=>pt.id===pid);const cr=credTotal(en);const balance=p?.is_package?0:cr;return{total:t,balance,credit:cr}}
  const ipRefDocs=[...new Set(db.ip_patients.filter(p=>p.ref_doctor).map(p=>p.ref_doctor))].sort()
  const IPRow=({p})=>{const b=qb(p.id);const pt=p.patient_type||'Regular';const disc2=!!p.discharge_date;const pconds=[...new Set(db.income.filter(e=>e.patient_id===p.id).flatMap(e=>(e.conditions||'').split(',').map(x=>x.trim()).filter(Boolean)))];return(<Row key={p.id} onClick={()=>{setIpid(p.id);setIpv('detail')}} left={<span style={{fontSize:14}}>{p.name}{pt==='Package'&&<Pill label="Pkg" bg="#dbeafe" tx="#1d4ed8"/>}{disc2&&<Pill label="Discharged"/>}{canSeeReports&&p.ref_doctor&&<Pill label={'Ref: '+p.ref_doctor} bg="#fff7ed" tx="#b45309"/>}{pconds.map(cd=><span key={cd} style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fdf4ff',color:'#7c3aed',fontWeight:700,marginLeft:4}}>{cd}</span>)}</span>} sub={fmtD(p.admission_date)+(disc2?' to '+fmtD(p.discharge_date):' Active')+(p.reg_no?' - Reg: '+p.reg_no:'')+(p.phone?' - '+p.phone:'')} right={<div style={{textAlign:'right'}}><div style={{fontWeight:600}}>{fmt(b.total)}</div>{b.credit>0&&<div style={{fontSize:11,color:'#c2410c'}}>credit: {fmt(b.credit)}</div>}</div>}/>)}
  const IPVIEWS=[{k:'active',l:'Active'},{k:'all',l:'All'},{k:'discharged',l:'Discharged'},{k:'date',l:'By Month'},...(canSeeReports?[{k:'ref',l:'By Ref Doctor'}]:[])]
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
            const opInc=db.income.filter(e=>!['ip','ip_r','ip_l','ip_p'].includes(e.type)&&e.patient_name&&e.patient_name.toLowerCase().includes(pF.name.toLowerCase()))
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
        {canSeeReports&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:12,padding:'12px 14px',marginBottom:8}}>
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
        </div>}
        {!canSeeReports&&<div style={{background:'#f9fafb',border:'1px dashed #d1d5db',borderRadius:10,padding:'10px 14px',marginBottom:8,fontSize:12,color:'#94a3b8',fontStyle:'italic',textAlign:'center'}}>Referral can be added by admin/management after admission</div>}
        {/* ADMIT TYPE SELECTION */}
        <div style={{marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:'#374151',marginBottom:8}}>Admission type</div>
          <div style={{display:'flex',gap:8}}>
            {[{k:'cash',l:'Cash / Regular',icon:'💵'},{k:'insurance',l:'Insurance',icon:'🏥'}].map(t=>(
              <button key={t.k} onClick={()=>setPF({...pF,admit_type:t.k})} style={{flex:1,padding:'10px',borderRadius:12,border:pF.admit_type===t.k?'2px solid #16a34a':'1.5px solid #e5e7eb',background:pF.admit_type===t.k?'#f0fdf4':'#fff',cursor:'pointer',fontSize:13,fontWeight:pF.admit_type===t.k?700:500,color:pF.admit_type===t.k?'#16a34a':'#64748b'}}>{t.icon} {t.l}</button>
            ))}
          </div>
        </div>
        {pF.admit_type==='insurance'&&<div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:12,padding:'12px',marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:'#1d4ed8',marginBottom:10}}>🏥 Insurance details</div>
          <FInp label="Insurance company / TPA" type="text" value={pF.insurance_type} onChange={e=>setPF({...pF,insurance_type:e.target.value})} placeholder="e.g. Star Health, CGHS, ESI, Medi-Assist"/>
          <FInp label="Policy / Pre-auth number" type="text" value={pF.insurance_policy_no} onChange={e=>setPF({...pF,insurance_policy_no:e.target.value})} placeholder="Policy or authorization number"/>
          <FInp label="Pre-approved amount (Rs)" type="number" value={pF.insurance_expected} onChange={e=>setPF({...pF,insurance_expected:e.target.value})} placeholder="Amount approved by insurer"/>
          {pF.insurance_expected>0&&<div style={{background:'#dbeafe',borderRadius:8,padding:'8px',fontSize:12,color:'#1e40af',marginTop:4}}>Initial approval: {fmt(parseFloat(pF.insurance_expected))} — more approvals can be added later</div>}
        </div>}
        <PBtn onClick={async()=>{if(!pF.name.trim()){alert('Name required');return};const rn=pF.linkedRegNo||(await genRegNo());const ok=await actions.admitPatient({id:uid(),name:pF.name,phone:pF.phone||'',admission_date:pF.adm,discharge_date:null,diagnosis:pF.dx,room:pF.room,ref_doctor:pF.ref.trim(),is_package:pF.patient_type==='Package',patient_type:pF.patient_type,custom_commission:pF.custom_commission!==''?parseFloat(pF.custom_commission):null,payments:[],reg_no:rn,patient_area:pF.patient_area?.trim()||'',insurance_type:pF.admit_type==='insurance'?pF.insurance_type:'',insurance_policy_no:pF.admit_type==='insurance'?pF.insurance_policy_no:'',insurance_expected:pF.admit_type==='insurance'&&pF.insurance_expected?parseFloat(pF.insurance_expected):0,insurance_status:pF.admit_type==='insurance'?'pending':''});if(ok!==false){setIpv('list');setPF({name:'',adm:todayStr(),dx:'',room:'',ref:'',is_package:false,phone:'',patient_type:'Regular',custom_commission:'',linkedRegNo:'',patient_area:'',admit_type:'cash',insurance_type:'',insurance_policy_no:'',insurance_expected:''})}}}>Admit patient</PBtn>
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
        <div style={{display:'flex',gap:6,marginBottom:10,alignItems:'center'}}>
          <select value={ipSort} onChange={e=>setIpSort(e.target.value)} style={{flex:'1 1 auto',padding:'8px 10px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:12,background:'#fff',fontWeight:600,color:'#0f172a'}}>
            <option value="newest">📅 Newest First</option>
            <option value="oldest">📆 Oldest First</option>
            <option value="name">🔤 Name (A-Z)</option>
            <option value="credit">💰 Highest Credit First</option>
          </select>
          <select value={ipRefFilter} onChange={e=>setIpRefFilter(e.target.value)} style={{flex:'1 1 auto',padding:'8px 10px',border:'1.5px solid #e2e8f0',borderRadius:10,fontSize:12,background:'#fff',fontWeight:600,color:'#0f172a'}}>
            <option value="">👨‍⚕️ All Doctors</option>
            <option value="__self__">Self (no referral)</option>
            {ipRefDocs.map(r=><option key={r} value={r}>Dr. {r}</option>)}
          </select>
          {(ipRefFilter||ipSort!=='newest')&&<button onClick={()=>{setIpRefFilter('');setIpSort('newest')}} style={{padding:'8px 10px',background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca',borderRadius:10,fontSize:11,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap'}}>✕</button>}
        </div>
        <div style={{position:'relative',marginBottom:12}}>
          <input style={{...S.inp,paddingLeft:36}} placeholder="Search by name, reg no, phone..." value={ipSearch} onChange={e=>setIpSearch(e.target.value)} autoCorrect="off" autoCapitalize="none"/>
          <span style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)',fontSize:16,color:'#aaa'}}></span>
          {ipSearch&&<button onClick={()=>setIpSearch('')} style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',fontSize:16,color:'#aaa',cursor:'pointer'}}></button>}
        </div>
        {(()=>{
          let pool=ipSearch.trim()?allIP:ipView==='active'?active:ipView==='discharged'?disc.slice().reverse():allIP
          if(ipSearch.trim()){pool=pool.filter(p=>p.name.toLowerCase().includes(ipSearch.toLowerCase())||p.reg_no?.toLowerCase().includes(ipSearch.toLowerCase())||p.phone?.includes(ipSearch))}
          // Apply ref doctor filter
          if(ipRefFilter==='__self__'){pool=pool.filter(p=>!p.ref_doctor||!p.ref_doctor.trim())}
          else if(ipRefFilter){pool=pool.filter(p=>p.ref_doctor===ipRefFilter)}
          // Apply sort
          pool=[...pool].sort((a,b)=>{
            const ad=a.admission_date||'',bd=b.admission_date||''
            if(ipSort==='oldest')return ad.localeCompare(bd)
            if(ipSort==='name')return (a.name||'').localeCompare(b.name||'')
            if(ipSort==='credit'){const ac=qb(a.id).credit,bc=qb(b.id).credit;return bc-ac}
            return bd.localeCompare(ad) // newest default
          })
          const filtered=pool
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
const OPTab=({db,actions,opSearch,setOpSearch,opPrevTab,setOpPrevTab,setTab,canSeeReports,hospital,gotoIP=null})=>{
  const [selPat,setSelPat]=useState(null)
  const [payDoc,setPayDoc]=useState(null)
  const [editEntry,setEditEntry]=useState(null)
  const [collectEntry,setCollectEntry]=useState(null)
  const [showRefModal,setShowRefModal]=useState(false)
  const [bulkRefDoc,setBulkRefDoc]=useState(null)
  const [addInc,setAddInc]=useState(null)
  const [pdfFrom,setPdfFrom]=useState(todayStr().slice(0,8)+'01')
  const [pdfTo,setPdfTo]=useState(todayStr())
  const [search,setSearch]=useState(opSearch||'')
  // Track if we came from daily report (local copy survives re-renders)
  const [fromReport,setFromReport]=useState(!!opPrevTab)
  const [view,setView]=useState('patients')
  const [filterDate,setFilterDate]=useState(todayStr().slice(0,7))
  const [filterRef,setFilterRef]=useState('')
  const [filterCon,setFilterCon]=useState('')
  const opIncome=db.income.filter(e=>!['ip','ip_r','ip_l','ip_p'].includes(e.type)&&e.patient_name)
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
  if(collectEntry)return(<CollectCreditForm entry={collectEntry} actions={actions} db={db} onCancel={()=>setCollectEntry(null)}/>)
  if(editEntry)return(<EditEntryForm entry={editEntry} db={db} canSeeReports={canSeeReports} onSave={async row=>{const ok=await actions.editIncome(row);if(ok!==false)setEditEntry(null)}} onCancel={()=>setEditEntry(null)}/>)
  if(selPat){
    const pat=byPat[selPat?.trim().toLowerCase()]||byPat[selPat];if(!pat)return<button onClick={()=>setSelPat(null)} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer'}}>Back</button>
    const ents=pat.entries
    const totalInc=ents.reduce((a,e)=>a+e.amount,0);const totalComm=ents.reduce((a,e)=>a+getComm(e),0);const totalCredit=credTotal(ents);const totalCash=cashTotal(ents)
    const byType={};ents.forEach(e=>{if(!byType[e.type])byType[e.type]={inc:0,comm:0};byType[e.type].inc+=e.amount;byType[e.type].comm+=getComm(e)})
    const refDocs={};ents.forEach(e=>{const doc=e.ref_doctor;if(!doc||!doc.trim())return;if(!refDocs[doc])refDocs[doc]={name:doc,income:0,commission:0};refDocs[doc].income+=e.amount;refDocs[doc].commission+=getComm(e)})
    const refs=Object.values(refDocs)
    const consMap={};ents.forEach(e=>{const cn=e.consultant_name;const cf=e.consultant_fee||0;if(!cn||!cn.trim()||cf<=0)return;if(!consMap[cn])consMap[cn]={name:cn,income:0,fee:0,consultFee:0,procComm:0};consMap[cn].income+=e.amount;consMap[cn].fee+=cf;if(e.type==='op_p')consMap[cn].procComm+=cf;else consMap[cn].consultFee+=cf})
    const consList=Object.values(consMap)
    const consPaid=db.expenses.filter(e=>e.category==='consultant_fee')
    const procPaid=db.expenses.filter(e=>e.category==='consultant_proc_comm')
    return(
      <div>
        {fromReport&&<button onClick={()=>{setFromReport(false);setOpPrevTab&&setOpPrevTab(null);setTab&&setTab('rep');setSelPat(null)}} style={{color:'#16a34a',fontSize:13,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:8,cursor:'pointer',marginBottom:8,display:'block',padding:'6px 14px',fontWeight:600}}>Back to Daily Report</button>}
        <button onClick={()=>{setFromReport(false);if(setOpPrevTab)setOpPrevTab(null);setSelPat(null);setPayDoc(null)}} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer',marginBottom:12,display:'block'}}>All OP patients</button>
        <Card>
          <div style={{fontSize:17,fontWeight:700,display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}>{pat.name}{[...new Set(ents.flatMap(e=>(e.conditions||'').split(',').map(x=>x.trim()).filter(Boolean)))].map(cd=><span key={cd} style={{fontSize:10,padding:'2px 9px',borderRadius:20,background:'#fdf4ff',color:'#7c3aed',fontWeight:700}}>{cd}</span>)}</div>
          {pat.phone&&<div style={{fontSize:12,color:'#aaa',marginTop:2}}>Ph: {pat.phone}</div>}
          {pat.reg_no&&<div style={{fontSize:12,color:'#1d4ed8',fontWeight:700,marginTop:2}}>Reg: {pat.reg_no}</div>}
          <div style={{fontSize:12,color:'#aaa',marginTop:4}}>{ents.length} visit{ents.length!==1?'s':''}</div>
          {canSeeReports&&<>
            <div style={{marginTop:14}}/><SecL>➕ Add income for this patient</SecL>
        <Card style={{marginBottom:14,border:'1px solid #bbf7d0'}}>
          {!addInc?<div style={{display:'flex',flexWrap:'wrap',gap:8}}>
            {[{k:'op',l:'OP Consultation'},{k:'op_p',l:'OP Procedure'},{k:'op_r',l:'OP Pharmacy'},{k:'op_l',l:'OP Lab'},{k:'opd',l:'OPD Services'},{k:'op_dm',l:'OP Disch. Medicine'}].map(t=>(
              <button key={t.k} onClick={()=>setAddInc({type:t.k,amount:'',payment:'cash',ref_doctor:'',consultant_name:'',date:todayStr(),op_type:'New OP'})} style={{padding:'9px 14px',background:'#f0fdf4',border:'1.5px solid #bbf7d0',borderRadius:10,fontSize:13,fontWeight:700,color:'#15803d',cursor:'pointer'}}>+ {t.l}</button>
            ))}
          </div>:(()=>{
            const TL={op:'OP Consultation',op_p:'OP Procedure',op_r:'OP Pharmacy',op_l:'OP Lab',opd:'OPD Services',op_dm:'OP Discharge Medicine'}[addInc.type]
            const selRef=db.ref_doctors.find(d=>d.name===addInc.ref_doctor)
            const pk={op:'op_pct',opd:'op_pct',op_p:'op_p_pct',op_r:'op_r_pct',op_l:'op_l_pct',op_dm:'op_r_pct'}[addInc.type]||'op_pct'
            const commPct=selRef?(selRef[pk]||0):0
            const commPrev=addInc.payment!=='credit'&&addInc.payment!=='discount'&&addInc.payment!=='written_off'?Math.round((parseFloat(addInc.amount||0))*commPct/100):0
            const selCon=db.consultants.find(cn=>cn.name===addInc.consultant_name)
            const consPctV=selCon?(addInc.type==='op_p'?(selCon.op_p_pct||0):(selCon.fee_share_pct||0)):0
            const consFeePrev=selCon?Math.round(parseFloat(addInc.amount||0)*consPctV/100):0
            return(<div>
              <div style={{fontSize:14,fontWeight:800,color:'#15803d',marginBottom:12}}>{TL} — {pat.name}</div>
              <FInp label="Amount (Rs)" type="number" value={addInc.amount} onChange={e=>setAddInc({...addInc,amount:e.target.value})}/>
              <FInp label="Date" type="date" value={addInc.date} onChange={e=>setAddInc({...addInc,date:e.target.value})}/>
              {addInc.type==='op'&&<FSel label="OP type" value={addInc.op_type} onChange={e=>setAddInc({...addInc,op_type:e.target.value})}>{OP_TYPES.map(t=><option key={t} value={t}>{t}</option>)}</FSel>}
              <FSel label="Payment" value={addInc.payment} onChange={e=>setAddInc({...addInc,payment:e.target.value})}>
                {['cash','upi','card','bank','credit','discount'].map(p=><option key={p} value={p}>{p[0].toUpperCase()+p.slice(1)}</option>)}
              </FSel>
              <FSel label="Referring doctor (optional)" value={addInc.ref_doctor} onChange={e=>setAddInc({...addInc,ref_doctor:e.target.value})}>
                <option value="">- None -</option>{db.ref_doctors.map(d=><option key={d.id} value={d.name}>{d.name}</option>)}
              </FSel>
              {commPrev>0&&<div style={{fontSize:12,color:'#c2410c',fontWeight:600,marginBottom:8,marginTop:-4}}>Commission to Dr. {addInc.ref_doctor}: {fmt(commPrev)} ({commPct}%)</div>}
              {(addInc.type==='op'||addInc.type==='op_p')&&<FSel label="Consultant (optional)" value={addInc.consultant_name} onChange={e=>setAddInc({...addInc,consultant_name:e.target.value})}>
                <option value="">- None -</option>{db.consultants.map(cn=><option key={cn.id} value={cn.name}>Dr. {cn.name}</option>)}
              </FSel>}
              {consFeePrev>0&&<div style={{fontSize:12,color:'#7e22ce',fontWeight:600,marginBottom:8,marginTop:-4}}>Consultant fee: {fmt(consFeePrev)} ({consPctV}%)</div>}
              <div style={{display:'flex',gap:8,marginTop:8}}>
                <button onClick={()=>setAddInc(null)} style={{flex:1,padding:'11px',background:'#f3f4f6',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer'}}>Cancel</button>
                <button onClick={async()=>{
                  const amt=parseFloat(addInc.amount);if(!amt||amt<=0){alert('Enter amount');return}
                  const row={id:uid(),date:addInc.date,type:addInc.type,amount:amt,patient_id:pat.entries[0]?.patient_id||null,patient_name:pat.name,payment:addInc.payment,ref_doctor:addInc.ref_doctor||'',reg_no:pat.reg_no||'',patient_phone:pat.phone||'',op_type:addInc.type==='op'?addInc.op_type:'',consultant_name:((addInc.type==='op'||addInc.type==='op_p')?addInc.consultant_name:'')||'',consultant_fee:consFeePrev||0,notes:''}
                  const ok=await actions.addIncome(row)
                  if(ok!==false)setAddInc(null)
                }} style={{flex:2,padding:'11px',background:'#16a34a',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer'}}>Add {TL}</button>
              </div>
            </div>)
          })()}
        </Card>
            <div style={{display:'flex',gap:8,marginTop:14,flexWrap:'wrap'}}>
              <button onClick={()=>setBulkRefDoc({reg_no:pat.reg_no||pat.name,name:pat.name,currentRef:ents.find(e=>e.ref_doctor)?.ref_doctor||''})} style={{padding:'9px 14px',background:'#fff7ed',border:'1.5px solid #f59e0b',borderRadius:8,fontSize:12,color:'#c2410c',cursor:'pointer',fontWeight:700}}>👨‍⚕️ Set Ref Doctor for all visits</button>
            </div>
            <div style={{background:'#f8fafc',border:'1.5px solid #e2e8f0',borderRadius:10,padding:'10px 12px',marginTop:10}}>
              <div style={{fontSize:10,fontWeight:800,color:'#475569',textTransform:'uppercase',letterSpacing:'.5px',marginBottom:8}}>📄 Generate Referral PDF — Select date range</div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
                <div><label style={{fontSize:10,color:'#64748b',fontWeight:700,display:'block',marginBottom:2}}>From</label>
                  <input type="date" value={pdfFrom} onChange={e=>setPdfFrom(e.target.value)} style={{width:'100%',padding:'7px 10px',border:'1.5px solid #cbd5e1',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                </div>
                <div><label style={{fontSize:10,color:'#64748b',fontWeight:700,display:'block',marginBottom:2}}>To</label>
                  <input type="date" value={pdfTo} onChange={e=>setPdfTo(e.target.value)} style={{width:'100%',padding:'7px 10px',border:'1.5px solid #cbd5e1',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none'}}/>
                </div>
              </div>
              {(()=>{
                const filtered=ents.filter(e=>getComm(e)>0&&e.date>=pdfFrom&&e.date<=pdfTo)
                const totalComm=filtered.reduce((a,e)=>a+getComm(e),0)
                return(<>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 10px',background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,marginBottom:8,fontSize:12}}>
                    <span style={{color:'#64748b',fontWeight:600}}>Matching entries: <strong style={{color:'#1a1a2e'}}>{filtered.length}</strong></span>
                    <span style={{color:'#15803d',fontWeight:800}}>Referral: Rs {totalComm.toLocaleString('en-IN')}</span>
                  </div>
                  <button onClick={()=>{if(filtered.length===0){alert('No referral entries in this date range');return}setShowRefModal(true)}} disabled={filtered.length===0} style={{width:'100%',padding:'10px',background:filtered.length===0?'#e5e7eb':'linear-gradient(135deg,#1a1a2e,#16213e)',color:filtered.length===0?'#94a3b8':'#c9a84c',border:'none',borderRadius:10,fontSize:13,fontWeight:800,cursor:filtered.length===0?'not-allowed':'pointer'}}>📄 Generate PDF ({filtered.length} entries)</button>
                </>)
              })()}
            </div>
          </>}
          {showRefModal&&<ReferralReportModal entries={ents.filter(e=>getComm(e)>0&&e.date>=pdfFrom&&e.date<=pdfTo)} docName={(ents.find(e=>e.ref_doctor)?.ref_doctor)||''} patientName={pat.name} hospital={hospital} onClose={()=>setShowRefModal(false)}/>}
          {bulkRefDoc&&(()=>{
            const [sel,setSel]=[bulkRefDoc.currentRef,v=>setBulkRefDoc({...bulkRefDoc,currentRef:v})]
            return(<div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.6)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
              <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:480,padding:'20px 18px'}}>
                <div style={{fontSize:17,fontWeight:800,color:'#1a1a2e',marginBottom:4}}>Set Ref Doctor</div>
                <div style={{fontSize:12,color:'#64748b',marginBottom:14}}>Patient: <strong>{bulkRefDoc.name}</strong>{bulkRefDoc.reg_no?' · Reg '+bulkRefDoc.reg_no:''}<br/>This will update ALL visits/entries for this patient with the selected ref doctor.</div>
                <FSel label="Referring Doctor" value={sel} onChange={e=>setSel(e.target.value)}>
                  <option value="">- No referral / Self -</option>
                  {db.ref_doctors.map(d=><option key={d.id} value={d.name}>Dr. {d.name}{d.area?' ('+d.area+')':''}</option>)}
                </FSel>
                <div style={{display:'flex',gap:8,marginTop:14}}>
                  <button onClick={()=>setBulkRefDoc(null)} style={{flex:1,padding:'10px',background:'#f3f4f6',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Cancel</button>
                  <button onClick={async()=>{
                    const newRef=sel.trim()
                    const matchByReg=!!pat.reg_no
                    const targetEnts=db.income.filter(e=>{
                      if(['ip','ip_r','ip_l','ip_p'].includes(e.type))return false
                      if(matchByReg)return e.reg_no===pat.reg_no
                      return (e.patient_name||'').trim().toLowerCase()===(pat.name||'').trim().toLowerCase()
                    })
                    if(targetEnts.length===0){alert('No entries to update');setBulkRefDoc(null);return}
                    if(!window.confirm('Update '+targetEnts.length+' entries with Dr. '+(newRef||'(no referral)')+'?'))return
                    const doc=db.ref_doctors.find(d=>d.name===newRef)
                    let updated=0
                    for(const e of targetEnts){
                      const pctKey={op:'op_pct',opd:'op_pct',op_p:'op_p_pct',op_r:'op_r_pct',op_l:'op_l_pct',op_dm:'op_r_pct'}[e.type]
                      const newCC=doc&&pctKey&&doc[pctKey]!=null?doc[pctKey]:null
                      const ok=await actions.editIncome({...e,ref_doctor:newRef,custom_commission:newCC})
                      if(ok!==false)updated++
                    }
                    alert('✅ Updated '+updated+' entries with Dr. '+(newRef||'(no referral)'))
                    setBulkRefDoc(null)
                  }} style={{flex:2,padding:'10px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Apply to All Entries</button>
                </div>
              </div>
            </div>)
          })()}
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
        {refs.length>0&&(<><SecL>Referral commission</SecL>{refs.map(doc=>{const paid=allPaid.filter(e=>e.description===doc.name).reduce((a,e)=>a+e.amount,0);const waived=db.expenses.filter(e=>isRetainedCat(e.category)&&e.description===doc.name).reduce((a,e)=>a+e.amount,0);const balance=doc.commission-paid-waived;const isOpen=payDoc===doc.name;return(<Card key={doc.name} style={{border:balance>0?'1px solid #fed7aa':'1px solid #f0f0f0'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}><div><div style={{fontSize:15,fontWeight:700}}>Dr. {doc.name}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>Income: {fmt(doc.income)}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:11,color:'#d97706',fontWeight:600}}>Commission</div><div style={{fontSize:20,fontWeight:700,color:'#c2410c'}}>{fmt(doc.commission)}</div></div></div><div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,padding:'8px 0',borderTop:'1px solid #f5f5f5',borderBottom:'1px solid #f5f5f5',marginBottom:10}}><div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Earned</div><div style={{fontSize:13,fontWeight:700,color:'#c2410c'}}>{fmt(doc.commission)}</div></div><div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Paid</div><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(paid)}</div></div><div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Balance</div><div style={{fontSize:13,fontWeight:700,color:balance>0?'#ef4444':'#16a34a'}}>{fmt(balance)}</div></div></div>{waived>0&&<div style={{fontSize:10.5,color:'#92400e',background:'#fffbeb',borderRadius:6,padding:'4px 8px',marginBottom:8,fontWeight:600}}>Settled/retained (not paid): {fmt(waived)}</div>}{balance>0&&(payDoc===doc.name?<CommPayForm docName={doc.name} balance={balance} onCancel={()=>setPayDoc(null)} onSave={async(amt,date,pay)=>{await settleRefPayment(db,actions,doc.name,amt,date,pay,0);setPayDoc(null)}}/>
        :payDoc==='DED:'+doc.name?<DeductCommForm db={db} docName={doc.name} balance={balance} onCancel={()=>setPayDoc(null)} onSave={async(g1,g2,d1,d2,date,pay)=>{if(g1+g2>0)await actions.addExpense({id:uid(),date,category:'ref_paid',amount:Math.round(g1+g2),description:doc.name,payment:pay,is_monthly:false});await deductCommSplit(actions,doc.name,date,d1,d2);setPayDoc(null)}}/>
        :<div style={{display:'flex',gap:8}}>
          <button onClick={()=>setPayDoc(doc.name)} style={{flex:2,padding:'10px',background:'#111',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Record commission payment</button>
          <button onClick={()=>setPayDoc('DED:'+doc.name)} style={{flex:1,padding:'10px',background:'#fffbeb',color:'#b45309',border:'1.5px solid #fcd34d',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer'}}>− Deduct</button>
        </div>)}{balance<=0&&<div style={{textAlign:'center',fontSize:12,color:'#16a34a',fontWeight:600}}>Fully paid</div>}</Card>)})}</>)}
        {consList.length>0&&canSeeReports&&(<><SecL>Consultants</SecL>{consList.map(cn=>{
        const cfPaid=consPaid.filter(e=>(e.description||'').toLowerCase().includes(cn.name.toLowerCase())).reduce((a,e)=>a+e.amount,0)
        const pcPaid=procPaid.filter(e=>(e.description||'').toLowerCase().includes(cn.name.toLowerCase())).reduce((a,e)=>a+e.amount,0)
        const cfBal=cn.consultFee-cfPaid,pcBal=cn.procComm-pcPaid
        const SubRow=({label,earned,paid,bal,cat,payKey,color})=>{const isOpen=payDoc===payKey;return(<div style={{padding:'10px 0',borderTop:'1px solid #f5f5f5'}}>
          <div style={{fontSize:11,fontWeight:800,color,textTransform:'uppercase',letterSpacing:'.3px',marginBottom:6}}>{label}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:8}}>
            <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Earned</div><div style={{fontSize:13,fontWeight:700,color}}>{fmt(earned)}</div></div>
            <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Paid</div><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(paid)}</div></div>
            <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Balance</div><div style={{fontSize:13,fontWeight:700,color:bal>0?'#ef4444':'#16a34a'}}>{fmt(bal)}</div></div>
          </div>
          {bal>0&&(!isOpen?<button onClick={()=>setPayDoc(payKey)} style={{width:'100%',padding:'9px',background:color,color:'#fff',border:'none',borderRadius:10,fontSize:12,fontWeight:600,cursor:'pointer'}}>+ Record payment</button>:<CommPayForm docName={cn.name} balance={bal} onCancel={()=>setPayDoc(null)} onSave={async(amt,date,pay)=>{await actions.addExpense({id:uid(),date,category:cat,amount:amt,description:'Dr. '+cn.name,payment:pay,is_monthly:false});setPayDoc(null)}}/>)}
          {bal<=0&&<div style={{textAlign:'center',fontSize:11,color:'#16a34a',fontWeight:600}}>Fully paid</div>}
        </div>)}
        return(<Card key={cn.name} style={{border:(cfBal>0||pcBal>0)?'1px solid #d8b4fe':'1px solid #f0f0f0'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:4}}>
            <div><div style={{fontSize:15,fontWeight:700}}>Dr. {cn.name}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>Income: {fmt(cn.income)}</div></div>
            <div style={{textAlign:'right'}}><div style={{fontSize:11,color:'#7e22ce',fontWeight:600}}>Total owed</div><div style={{fontSize:20,fontWeight:700,color:'#7e22ce'}}>{fmt(cn.fee)}</div></div>
          </div>
          {cn.consultFee>0&&<SubRow label="Consultation fee" earned={cn.consultFee} paid={cfPaid} bal={cfBal} cat="consultant_fee" payKey={'CONSF:'+cn.name} color="#7e22ce"/>}
          {cn.procComm>0&&<SubRow label="OP Procedure commission" earned={cn.procComm} paid={pcPaid} bal={pcBal} cat="consultant_proc_comm" payKey={'CONSP:'+cn.name} color="#0f766e"/>}
        </Card>)})}</>)}
        <SecL>All visits (OP + IP)</SecL>
        {(()=>{
          const patName=(selPat||'').trim().toLowerCase()
          // Find all IP admissions for this patient by name match
          const ipAdmissions=db.ip_patients.filter(p=>p.name.trim().toLowerCase()===patName)
          // Get all income entries for IP admissions
          const ipIncome=db.income.filter(e=>['ip','ip_r','ip_l','ip_p'].includes(e.type)&&ipAdmissions.some(p=>p.id===e.patient_id))
          // Combine all entries
          const allEnts=[...ents,...ipIncome].slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))
          const ipTotal=ipIncome.reduce((a,e)=>a+e.amount,0)
          const grandTotal=ents.reduce((a,e)=>a+e.amount,0)+ipTotal
          return(<>
            {ipAdmissions.length>0&&<div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:10,padding:'8px 12px',marginBottom:8,fontSize:12,color:'#1d4ed8'}}>
              {ipAdmissions.length} IP admission{ipAdmissions.length>1?'s':''} found — showing complete history. Total: {fmt(grandTotal)}
            </div>}
            {ipAdmissions.map(p=>(<div key={p.id} onClick={()=>gotoIP&&gotoIP(p.id)} style={{background:'#fefce8',border:'1px solid #fde68a',borderRadius:10,padding:'8px 12px',marginBottom:6,fontSize:12,cursor:gotoIP?'pointer':'default',display:'flex',alignItems:'center',justifyContent:'space-between',gap:8}}>
              <div><span style={{fontWeight:700,color:'#92400e'}}>🏥 IP Admission: </span>{fmtD(p.admission_date)}{p.discharge_date?' → '+fmtD(p.discharge_date):<span style={{color:'#16a34a',fontWeight:700}}> (Active)</span>}
              {p.diagnosis&&<span style={{color:'#555'}}> — {p.diagnosis}</span>}</div>
              <div style={{display:'flex',alignItems:'center',gap:8,whiteSpace:'nowrap'}}><span style={{fontWeight:700,color:'#1d4ed8'}}>{fmt(db.income.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+e.amount,0))}</span>{gotoIP&&<span style={{padding:'4px 10px',background:'#1d4ed8',color:'#fff',borderRadius:8,fontSize:11,fontWeight:700}}>Open →</span>}</div>
            </div>))}
            {(()=>{
              const renderEnt=(e)=>{const cr=isCredit(e);const comm=getComm(e);const isIP=['ip','ip_r','ip_l','ip_p'].includes(e.type);return(<div key={e.id} style={{padding:'9px 0',borderBottom:'1px solid #f5f5f5'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{display:'flex',alignItems:'center',gap:6,flexWrap:'wrap'}}><TypeTag t={e.type}/>{e.op_type&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#f0f0f0',color:'#555',fontWeight:600}}>{e.op_type}</span>}<span style={{fontSize:12,color:'#555'}}>{fmtD(e.date)}{e.created_at&&<span style={{fontSize:10.5,color:'#94a3b8',fontWeight:600,marginLeft:4}}>🕐 {fmtT(e.created_at)}</span>}</span>{cr&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#fed7aa',color:'#92400e',fontWeight:700}}>CREDIT</span>}{isIP&&<span style={{fontSize:10,padding:'1px 6px',borderRadius:10,background:'#dbeafe',color:'#1d4ed8',fontWeight:700}}>IP</span>}</div>{canSeeReports&&e.ref_doctor&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>Ref: {e.ref_doctor}{comm>0?' — Comm: '+fmt(comm):''}</div>}{e.entered_by&&<div style={{fontSize:10,color:'#94a3b8',marginTop:2,fontStyle:'italic',fontWeight:500}}>entered by {e.entered_by}</div>}
                {e.notes&&<div style={{fontSize:11,color:'#aaa',marginTop:1}}>{cleanNotes(e.notes)}</div>}
                {e.conditions&&e.conditions.split(',').filter(Boolean).length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:3}}>
                  {e.conditions.split(',').filter(Boolean).map(cd=><span key={cd} style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fdf4ff',color:'#7c3aed',fontWeight:700}}>{cd.trim()}</span>)}
                </div>}</div><div style={{display:'flex',alignItems:'center',gap:6,marginLeft:8}}>{cr&&!isIP&&<><button onClick={()=>setCollectEntry(e)} style={{padding:'4px 10px',background:'#16a34a',border:'none',borderRadius:8,fontSize:11,color:'#fff',cursor:'pointer',fontWeight:700}}>Collect</button>{canSeeReports&&<button onClick={async()=>{if(!window.confirm('Write off Rs '+e.amount+' credit?\n\nThis is treated as an uncollectible loss. The entry stays on record but stops counting as outstanding credit.'))return;const note='\u26A0\uFE0F Written off on '+fmtD(todayStr())+(e.notes?' \u00B7 '+e.notes:'');await actions.editIncome({...e,payment:'written_off',notes:note})}} style={{padding:'4px 10px',background:'#fff',border:'1.5px solid #dc2626',borderRadius:8,fontSize:11,color:'#dc2626',cursor:'pointer',fontWeight:700,marginLeft:4}}>Write off</button>}</>}{!isIP&&<button onClick={()=>setEditEntry(e)} style={{padding:'5px 12px',background:'#f0f9ff',border:'1.5px solid #3b82f6',borderRadius:8,fontSize:12,color:'#1d4ed8',cursor:'pointer',fontWeight:600}}>Edit</button>}<span style={{fontSize:13,fontWeight:600,color:cr?'#c2410c':'#16a34a'}}>{fmt(e.amount)}</span></div></div></div>)}
              const ORDER=['op','opd','op_p','op_dm','op_r','op_l','vc','ip','ip_p','ip_r','ip_l']
              const groups=ORDER.map(tk=>({tk,label:(ITYPES.find(t=>t.key===tk)||{}).full||tk,list:allEnts.filter(e=>e.type===tk)})).filter(g=>g.list.length>0)
              const other=allEnts.filter(e=>!ORDER.includes(e.type))
              return(<>
                {groups.map(g=>{const tot=g.list.reduce((a,e)=>a+e.amount,0);return(
                  <div key={g.tk} style={{marginBottom:12}}>
                    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 2px',marginBottom:4}}>
                      <div style={{display:'flex',alignItems:'center',gap:7}}><TypeTag t={g.tk}/><span style={{fontSize:12.5,fontWeight:800,color:'#334155'}}>{g.label}</span><span style={{fontSize:11,color:'#94a3b8',fontWeight:600}}>({g.list.length})</span></div>
                      <span style={{fontSize:13,fontWeight:800,color:'#16a34a'}}>{fmt(tot)}</span>
                    </div>
                    <Card>{g.list.map(e=>renderEnt(e))}</Card>
                  </div>)})}
                {other.length>0&&<div style={{marginBottom:12}}><div style={{fontSize:12.5,fontWeight:800,color:'#334155',padding:'6px 2px',marginBottom:4}}>Other</div><Card>{other.map(e=>renderEnt(e))}</Card></div>}
              </>)
            })()}
          </>)
        })()}
    </div>
    )
  }
  // All referral doctors and consultants who appear in OP income
  const opRefDocs=[...new Set(opIncome.filter(e=>e.ref_doctor).map(e=>e.ref_doctor))].sort()
  const opConsultants=[...new Set(opIncome.filter(e=>e.consultant_name).map(e=>e.consultant_name))].sort()
  const PatCard=({pat})=>{const pconds=[...new Set(pat.entries.flatMap(e=>(e.conditions||'').split(',').map(x=>x.trim()).filter(Boolean)))];return(<Card style={{cursor:'pointer',marginBottom:10}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}} onClick={()=>setSelPat((pat.name||'').trim().toLowerCase())}><div><div style={{fontSize:14,fontWeight:700,color:'#111'}}>{pat.name}</div>{pconds.length>0&&<div style={{display:'flex',gap:4,flexWrap:'wrap',marginTop:3}}>{pconds.map(cd=><span key={cd} style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fdf4ff',color:'#7c3aed',fontWeight:700}}>{cd}</span>)}</div>}{pat.phone&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>Ph: {pat.phone}</div>}{pat.reg_no&&<div style={{fontSize:11,color:'#1d4ed8',fontWeight:600}}>Reg: {pat.reg_no}</div>}<div style={{fontSize:11,color:'#aaa',marginTop:2}}>{pat.entries.length} visit{pat.entries.length!==1?'s':''} - Last: {fmtD(pat.lastDate)}</div>{pat.totalComm>0&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>Ref comm: {fmt(pat.totalComm)}</div>}{pat.totalCredit>0&&<div style={{fontSize:11,color:'#c2410c',marginTop:2}}>Credit: {fmt(pat.totalCredit)}</div>}</div><div style={{textAlign:'right'}}><div style={{fontSize:15,fontWeight:700}}>{fmt(pat.total)}</div><div style={{fontSize:12,color:'#16a34a',fontWeight:600}}>Real: {fmt(pat.total-pat.totalComm)}</div><span style={{fontSize:16,color:'#aaa'}}></span></div></div></Card>)}
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
  const [selMonth,setSelMonth]=useState(todayStr().slice(0,7))
  const [editExp,setEditExp]=useState(null)
  const monthExp=db.expenses.filter(e=>e.category!=='ref_paid'&&!isRetainedCat(e.category)&&e.date?.startsWith(selMonth)).sort((a,b)=>(b.date||'').localeCompare(a.date||''))
  const monthTot=monthExp.reduce((a,e)=>a+e.amount,0)
  const monthByCat={};monthExp.forEach(e=>{if(!monthByCat[e.category])monthByCat[e.category]={total:0,entries:[]};monthByCat[e.category].total+=e.amount;monthByCat[e.category].entries.push(e)})
  const monthCatSorted=Object.entries(monthByCat).sort((a,b)=>b[1].total-a[1].total)
  const [expandCat,setExpandCat]=useState(null)
  const go=async()=>{const amt=parseFloat(exF.amt);if(!amt||amt<=0){alert('Enter amount');return};const ok=await actions.addExpense({id:uid(),date:exD,category:exF.cat,amount:amt,description:exF.desc,payment:exF.pay,is_monthly:exF.mon});if(ok!==false)setExF({...exF,amt:'',desc:''})}
  const saveEdit=async()=>{const amt=parseFloat(editExp.amount);if(!amt||amt<=0){alert('Enter amount');return};await actions.updateExpense(editExp.id,{date:editExp.date,category:editExp.category,amount:amt,description:editExp.description});setEditExp(null)}
  return(
    <div>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <input style={{...S.inp,flex:1}} type="date" value={exD} onChange={e=>setExD(e.target.value)}/>
        <GBtn onClick={()=>setExD(todayStr())}>Today</GBtn>
      </div>
      <Card>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <div>
            <FSel label="Category" value={exF.cat} onChange={async e=>{
              const v=e.target.value
              if(v==='__add__'){
                const name=prompt('New category name (e.g. "Pharmacy stock"):')
                if(!name||!name.trim())return
                const seg=prompt('Segment? Type "lab" for lab P&L, anything else for clinical P&L:','clinical')
                const isLab=seg&&seg.toLowerCase().trim()==='lab'
                const key=name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||('custom_'+Date.now())
                const ok=await actions.addCustomCategory({key,label:name.trim(),segment:isLab?'lab':'clinical'})
                if(ok!==false)setExF({...exF,cat:key})
              }else{setExF({...exF,cat:v})}
            }}>
              {getCats(db).filter(c=>c.key!=='ref_paid').map(c=><option key={c.key} value={c.key}>{c.segment==='lab'?'🧪 ':''}{c.label}{c.custom?' (custom)':''}</option>)}
              <option disabled>──────────</option>
              <option value="__add__">+ Add new category…</option>
            </FSel>
          </div>
          <FInp label="Amount (Rs)" type="number" inputMode="numeric" placeholder="0" value={exF.amt} onChange={e=>setExF({...exF,amt:e.target.value})}/>
        </div>
        {(exF.cat==='consultant_fee'||exF.cat==='consultant_proc_comm')&&<FSel label="Consultant (name goes into description)" value={exF.desc} onChange={e=>setExF({...exF,desc:e.target.value})}>
          <option value="">- Select consultant -</option>
          {db.consultants.map(cn=><option key={cn.id} value={'Dr. '+cn.name}>Dr. {cn.name}</option>)}
        </FSel>}
        <FInp label={(exF.cat==='consultant_fee'||exF.cat==='consultant_proc_comm')?'Description (consultant name + details)':'Description'} type="text" placeholder={(exF.cat==='consultant_fee'||exF.cat==='consultant_proc_comm')?'Dr. name — visit details':'Details'} value={exF.desc} onChange={e=>setExF({...exF,desc:e.target.value})}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,alignItems:'center'}}>
          <FSel label="Payment" value={exF.pay} onChange={e=>setExF({...exF,pay:e.target.value})}>
            {PMODES.map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}
          </FSel>
          <div style={{paddingTop:16}}><label style={{display:'flex',alignItems:'center',gap:8,fontSize:14,cursor:'pointer'}}><input type="checkbox" checked={exF.mon} onChange={e=>setExF({...exF,mon:e.target.checked})} style={{width:18,height:18}}/>Monthly</label></div>
        </div>
        <PBtn onClick={go}>Save expense</PBtn>
      </Card>
      <SecL>Expenses - {fmtD(exD)} - {fmt(etot)}</SecL>
      {exp.length===0?<div style={{textAlign:'center',padding:'24px 0',color:'#ccc',fontSize:13}}>No expenses</div>:<Card>{exp.map(e=>{const c=ECATS.find(c=>c.key===e.category);return<Row key={e.id} left={<span>{c?.label||e.category}{e.is_monthly&&<Pill label="monthly" bg="#dbeafe" tx="#1d4ed8"/>}</span>} sub={(e.description||'-')+' - '+e.payment} right={<><span style={{color:'#ef4444',fontWeight:600,fontSize:13}}>{fmt(e.amount)}</span><DBtn confirmText={'Delete this expense?\n\nCategory: '+(ECATS.find(c=>c.key===e.category)?.label||e.category)+'\nAmount: Rs '+e.amount+'\nDescription: '+(e.description||'-')+'\n\nThis cannot be undone.'} onClick={()=>actions.delExpense(e.id)}>X</DBtn></>}/>})}</Card>}
      
      {/* MONTHLY EXPENSES DETAIL */}
      <div style={{marginTop:24,paddingTop:16,borderTop:'2px solid #f1f5f9'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
          <div style={{fontSize:15,fontWeight:800,color:'#1a1a2e'}}>📅 Monthly Expenses</div>
          <input type="month" value={selMonth} onChange={e=>setSelMonth(e.target.value)} style={{padding:'7px 10px',border:'1.5px solid #cbd5e1',borderRadius:8,fontSize:13,outline:'none'}}/>
        </div>
        <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:12,padding:'14px 16px',marginBottom:12}}>
          <div style={{fontSize:11,color:'#dc2626',fontWeight:700,textTransform:'uppercase'}}>Total for {selMonth}</div>
          <div style={{fontSize:26,fontWeight:800,color:'#dc2626'}}>{fmt(monthTot)}</div>
          <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{monthExp.length} entries · {monthCatSorted.length} categories</div>
        </div>
        {monthCatSorted.length===0?<div style={{textAlign:'center',padding:'24px 0',color:'#ccc',fontSize:13}}>No expenses this month</div>:
        <Card>
          {monthCatSorted.map(([cat,data])=>{
            const cInfo=ECATS.find(x=>x.key===cat);const pct=monthTot>0?Math.round(data.total/monthTot*100):0
            const isExp=expandCat===cat
            return(<div key={cat} style={{padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}>
              <div onClick={()=>setExpandCat(isExp?null:cat)} style={{cursor:'pointer'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
                  <span style={{fontSize:13,fontWeight:600}}>{isExp?'▼':'▶'} {cInfo?.label||cat}{cInfo?.segment==='lab'?' 🧪':''} <span style={{fontSize:10,color:'#94a3b8'}}>({data.entries.length})</span></span>
                  <span style={{fontSize:13,fontWeight:700,color:'#ef4444'}}>{fmt(data.total)}</span>
                </div>
                <div style={{display:'flex',alignItems:'center',gap:8}}><div style={{flex:1,height:6,background:'#f0f0f0',borderRadius:3}}><div style={{width:pct+'%',height:6,background:'#ef4444',borderRadius:3,opacity:0.7}}/></div><span style={{fontSize:10,color:'#aaa',minWidth:28}}>{pct}%</span></div>
              </div>
              {isExp&&<div style={{marginTop:8,paddingLeft:12,borderLeft:'2px solid #fecaca'}}>
                {data.entries.sort((a,b)=>(b.date||'').localeCompare(a.date||'')).map(e=>(<div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px dotted #f1f5f9'}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:'#1a1a2e'}}>{e.description||'(no description)'}</div>
                    <div style={{fontSize:10,color:'#94a3b8'}}>{fmtD(e.date)}{e.payment?' · '+e.payment:''}{e.is_monthly?' · monthly':''}</div>
                  </div>
                  <div style={{display:'flex',alignItems:'center',gap:6}}>
                    <span style={{fontSize:13,fontWeight:700,color:'#ef4444'}}>{fmt(e.amount)}</span>
                    <button onClick={()=>setEditExp({...e})} style={{padding:'3px 8px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,fontSize:10,color:'#1d4ed8',cursor:'pointer',fontWeight:600}}>Edit</button>
                    <button onClick={()=>{if(window.confirm('Delete this expense?'))actions.delExpense(e.id)}} style={{padding:'3px 8px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,fontSize:10,color:'#dc2626',cursor:'pointer',fontWeight:600}}>✕</button>
                  </div>
                </div>))}
              </div>}
            </div>)
          })}
          <div style={{display:'flex',justifyContent:'space-between',paddingTop:10,marginTop:4,borderTop:'2px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total</span><span style={{color:'#ef4444'}}>{fmt(monthTot)}</span></div>
        </Card>}
      </div>
      
      {/* EDIT EXPENSE MODAL */}
      {editExp&&<div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.6)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
        <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:460,padding:'20px 18px',maxHeight:'90vh',overflowY:'auto'}}>
          <div style={{fontSize:16,fontWeight:800,marginBottom:14}}>Edit Expense</div>
          <FInp label="Date" type="date" value={editExp.date} onChange={e=>setEditExp({...editExp,date:e.target.value})}/>
          <FSel label="Category" value={editExp.category} onChange={e=>setEditExp({...editExp,category:e.target.value})}>
            {getCats(db).filter(x=>x.segment!=='skip').map(x=><option key={x.key} value={x.key}>{x.segment==='lab'?'🧪 ':''}{x.label}</option>)}
          </FSel>
          <FInp label="Description" value={editExp.description||''} onChange={e=>setEditExp({...editExp,description:e.target.value})}/>
          <FInp label="Amount (Rs)" type="number" value={editExp.amount} onChange={e=>setEditExp({...editExp,amount:e.target.value})}/>
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <button onClick={()=>setEditExp(null)} style={{flex:1,padding:'11px',background:'#f3f4f6',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Cancel</button>
            <button onClick={saveEdit} style={{flex:2,padding:'11px',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Save Changes</button>
          </div>
        </div>
      </div>}
    </div>
  )
}

/*  REFERRALS REPORT  */
const ReferralsReport=({db,income,allPaid,rm,setRm,ry,setRy,yrs,actions,hospital})=>{
  const [per,setPer]=useState('month')
  const [payDoc,setPayDoc]=useState(null)
  const [subTab,setSubTab]=useState('commission')
  const [dlM,setDlM]=useState(todayStr().slice(0,7))
  const [selDoc,setSelDoc]=useState('')
  const [editPayId,setEditPayId]=useState(null)
  const [editPayForm,setEditPayForm]=useState({amount:'',date:'',payment:'cash'})
  const [gFrom,setGFrom]=useState(todayStr().slice(0,8)+'01')
  const [gTo,setGTo]=useState(todayStr())
  const [gDoc,setGDoc]=useState('')
  const [gPat,setGPat]=useState('')
  const [gShowModal,setGShowModal]=useState(false)
  const fi=per==='month'?income.filter(e=>e.date?.startsWith(rm)):income.filter(e=>e.date?.startsWith(ry))
  const docs=buildRef(fi)
  const tc=docs.reduce((a,r)=>a+r.total_commission,0)
  const totalPaid=allPaid.reduce((a,e)=>a+e.amount,0)
  // All-time data for income & timeline tabs
  const allDocs=buildRef(income)
  const allRefDocs=[...new Set(income.filter(e=>e.ref_doctor).map(e=>e.ref_doctor))].sort()
  return(<>
    <div style={{display:'flex',gap:6,marginBottom:12,overflowX:'auto',paddingBottom:2}}>
      {[{k:'due',l:'⏳ Due Ledger'},{k:'commission',l:'Commission'},{k:'income',l:'Income by Doctor'},{k:'timeline',l:'Doctor Timeline'},{k:'generate',l:'📄 Generate PDF'}].map(v=>(<button key={v.k} onClick={()=>setSubTab(v.k)} style={{flexShrink:0,padding:'7px 14px',borderRadius:20,border:subTab===v.k?'none':'1.5px solid #e2e8f0',background:subTab===v.k?'linear-gradient(135deg,#0891b2,#06b6d4)':'#fff',color:subTab===v.k?'#fff':'#64748b',fontSize:12,fontWeight:700,cursor:'pointer',boxShadow:subTab===v.k?'0 4px 12px rgba(8,145,178,0.3)':'none',transition:'all .15s'}}>{v.l}</button>))}
    </div>
    {subTab==='due'&&(()=>{
      const dlMonth=dlM
      const docsAll=buildRef(income)
      const rows=docsAll.map(doc=>{
        const paid=allPaid.filter(e=>e.description===doc.name).reduce((a,e)=>a+e.amount,0)
        const waived=(db.expenses||[]).filter(e=>isRetainedCat(e.category)&&e.description===doc.name).reduce((a,e)=>a+e.amount,0)
        const due=doc.total_commission-paid-waived
        const monthEarned=income.filter(e=>e.ref_doctor===doc.name&&e.date?.startsWith(dlMonth)).reduce((a,e)=>a+getComm(e),0)
        return{...doc,paid,waived,due,monthEarned}
      })
      const dueRows=rows.filter(r=>r.due>0.5).sort((a,b)=>b.due-a.due)
      const paidRows=rows.filter(r=>r.due<=0.5)
      const consRows=(db.consultants||[]).map(cn=>{
        const fEnts=income.filter(e=>e.consultant_name===cn.name&&(e.consultant_fee||0)>0)
        const consultFee=fEnts.filter(e=>e.type!=='op_p').reduce((a,e)=>a+(e.consultant_fee||0),0)
        const procComm=fEnts.filter(e=>e.type==='op_p').reduce((a,e)=>a+(e.consultant_fee||0),0)
        const cfPaid=(db.expenses||[]).filter(e=>e.category==='consultant_fee'&&(e.description||'').toLowerCase().includes(cn.name.toLowerCase())).reduce((a,e)=>a+e.amount,0)
        const pcPaid=(db.expenses||[]).filter(e=>e.category==='consultant_proc_comm'&&(e.description||'').toLowerCase().includes(cn.name.toLowerCase())).reduce((a,e)=>a+e.amount,0)
        const monthEarned=fEnts.filter(e=>e.date?.startsWith(dlMonth)).reduce((a,e)=>a+(e.consultant_fee||0),0)
        return{name:cn.name,cfDue:consultFee-cfPaid,pcDue:procComm-pcPaid,earned:consultFee+procComm,paid:cfPaid+pcPaid,monthEarned}
      }).filter(r=>r.earned>0)
      const consDue=consRows.filter(r=>r.cfDue>0.5||r.pcDue>0.5)
      const totalDue=dueRows.reduce((a,r)=>a+r.due,0)+consDue.reduce((a,r)=>a+Math.max(0,r.cfDue)+Math.max(0,r.pcDue),0)
      return(<>
        <div style={{background:totalDue>0?'linear-gradient(135deg,#c2410c,#ea580c)':'linear-gradient(135deg,#16a34a,#15803d)',color:'#fff',padding:'14px 18px',borderRadius:12,marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><div style={{fontSize:11,fontWeight:700,opacity:.9,textTransform:'uppercase',letterSpacing:'.5px'}}>Total commission due</div><div style={{fontSize:11,opacity:.85,marginTop:2}}>{dueRows.length} doctors · {consDue.length} consultants pending</div></div>
          <div style={{fontSize:26,fontWeight:900}}>{fmt(totalDue)}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:12}}>
          <span style={{fontSize:12,color:'#64748b',fontWeight:600}}>Earned in month:</span>
          <input type="month" value={dlMonth} onChange={e=>setDlM(e.target.value)} style={{padding:'7px 10px',border:'1.5px solid #cbd5e1',borderRadius:8,fontSize:13,outline:'none'}}/>
        </div>
        <SecL>Referral doctors — due ({dueRows.length})</SecL>
        {dueRows.length===0&&<div style={{textAlign:'center',padding:'16px 0',color:'#16a34a',fontSize:13,fontWeight:600}}>✓ All doctors fully paid</div>}
        {dueRows.map(r=>{const isOpen=payDoc==='DUE:'+r.name;return(<Card key={r.name} style={{border:'1px solid #fed7aa'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div><div style={{fontSize:14,fontWeight:700}}>Dr. {r.name}</div><div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>Earned {fmt(r.total_commission)} · Paid {fmt(r.paid)}{r.waived>0?' · Retained '+fmt(r.waived):''} · {dlMonth}: {fmt(r.monthEarned)}</div></div>
            <div style={{textAlign:'right'}}><div style={{fontSize:10,color:'#c2410c',fontWeight:700,textTransform:'uppercase'}}>Due</div><div style={{fontSize:18,fontWeight:800,color:'#c2410c'}}>{fmt(r.due)}</div></div>
          </div>
          {payDoc==='DUE:'+r.name?<CommPayForm docName={r.name} balance={r.due} onCancel={()=>setPayDoc(null)} onSave={async(amt,date,pay)=>{await settleRefPayment(db,actions,r.name,amt,date,pay,0);setPayDoc(null)}}/>
           :payDoc==='DED:'+r.name?<DeductCommForm db={db} docName={r.name} balance={r.due} onCancel={()=>setPayDoc(null)} onSave={async(g1,g2,d1,d2,date,pay)=>{if(g1+g2>0)await actions.addExpense({id:uid(),date,category:'ref_paid',amount:Math.round(g1+g2),description:r.name,payment:pay,is_monthly:false});await deductCommSplit(actions,r.name,date,d1,d2);setPayDoc(null)}}/>
           :<div style={{display:'flex',gap:8}}>
              <button onClick={()=>setPayDoc('DUE:'+r.name)} style={{flex:2,padding:'9px',background:'#111',color:'#fff',border:'none',borderRadius:10,fontSize:12,fontWeight:600,cursor:'pointer'}}>+ Record payment</button>
              <button onClick={()=>setPayDoc('DED:'+r.name)} style={{flex:1,padding:'9px',background:'#fffbeb',color:'#b45309',border:'1.5px solid #fcd34d',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer'}}>− Deduct</button>
            </div>}
        </Card>)})}
        {consRows.length>0&&<><SecL>Consultants — due ({consDue.length})</SecL>
        {consDue.length===0&&<div style={{textAlign:'center',padding:'16px 0',color:'#16a34a',fontSize:13,fontWeight:600}}>✓ All consultants fully paid</div>}
        {consDue.map(r=>(<Card key={r.name} style={{border:'1px solid #d8b4fe'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
            <div><div style={{fontSize:14,fontWeight:700}}>Dr. {r.name}</div><div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>Earned {fmt(r.earned)} · Paid {fmt(r.paid)} · {dlMonth}: {fmt(r.monthEarned)}</div></div>
            <div style={{textAlign:'right'}}><div style={{fontSize:10,color:'#7e22ce',fontWeight:700,textTransform:'uppercase'}}>Due</div><div style={{fontSize:18,fontWeight:800,color:'#7e22ce'}}>{fmt(Math.max(0,r.cfDue)+Math.max(0,r.pcDue))}</div></div>
          </div>
          {r.cfDue>0.5&&(payDoc==='DUEC:'+r.name?<CommPayForm docName={r.name} balance={r.cfDue} onCancel={()=>setPayDoc(null)} onSave={async(amt,date,pay)=>{await actions.addExpense({id:uid(),date,category:'consultant_fee',amount:amt,description:'Dr. '+r.name,payment:pay,is_monthly:false});setPayDoc(null)}}/>:<button onClick={()=>setPayDoc('DUEC:'+r.name)} style={{width:'100%',padding:'8px',background:'#7e22ce',color:'#fff',border:'none',borderRadius:10,fontSize:12,fontWeight:600,cursor:'pointer',marginBottom:6}}>+ Pay consultation fee ({fmt(r.cfDue)})</button>)}
          {r.pcDue>0.5&&(payDoc==='DUEP:'+r.name?<CommPayForm docName={r.name} balance={r.pcDue} onCancel={()=>setPayDoc(null)} onSave={async(amt,date,pay)=>{await actions.addExpense({id:uid(),date,category:'consultant_proc_comm',amount:amt,description:'Dr. '+r.name,payment:pay,is_monthly:false});setPayDoc(null)}}/>:<button onClick={()=>setPayDoc('DUEP:'+r.name)} style={{width:'100%',padding:'8px',background:'#0f766e',color:'#fff',border:'none',borderRadius:10,fontSize:12,fontWeight:600,cursor:'pointer'}}>+ Pay procedure commission ({fmt(r.pcDue)})</button>)}
        </Card>))}</>}
        {paidRows.length>0&&<><SecL>Fully paid ({paidRows.length})</SecL>
        <Card>{paidRows.map(r=>(<div key={r.name} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f8fafc',fontSize:12}}><span style={{color:'#475569'}}>Dr. {r.name}</span><span style={{color:'#16a34a',fontWeight:600}}>✓ {fmt(r.paid)} paid</span></div>))}</Card></>}
      </>)
    })()}
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
      {docs.map(doc=>{const paid=allPaid.filter(e=>e.description===doc.name).reduce((a,e)=>a+e.amount,0);const waivedC=(db.expenses||[]).filter(e=>isRetainedCat(e.category)&&e.description===doc.name).reduce((a,e)=>a+e.amount,0);const balance=doc.total_commission-paid-waivedC;const isOpen=payDoc===doc.name;return(
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
          {balance>0&&(<div style={{marginTop:10}}>{!isOpen?<button onClick={()=>setPayDoc(doc.name)} style={{width:'100%',padding:'10px',background:'#111',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:600,cursor:'pointer'}}>+ Record commission payment</button>:<CommPayForm docName={doc.name} balance={balance} onCancel={()=>setPayDoc(null)} onSave={async(amt,date,pay)=>{await settleRefPayment(db,actions,doc.name,amt,date,pay,0);setPayDoc(null)}}/>}</div>)}
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
const ExpensesReport=({db,actions})=>{
  const [per,setPer]=useState('month')
  const [rm2,setRm2]=useState(todayStr().slice(0,7))
  const [ry2,setRy2]=useState(todayStr().slice(0,4))
  const [from,setFrom]=useState(todayStr().slice(0,7)+'-01')
  const [to,setTo]=useState(todayStr())
  const [expandCat,setExpandCat]=useState(null)
  const [showAdd,setShowAdd]=useState(false)
  const [editExp,setEditExp]=useState(null)
  const [addF,setAddF]=useState({date:todayStr(),cat:'supplies',amt:'',desc:'',pay:'cash'})
  const yrs=[...new Set(db.expenses.map(e=>e.date?.slice(0,4)))].filter(Boolean).sort().reverse()
  if(!yrs.includes(ry2))yrs.unshift(ry2)
  const allExp=db.expenses.filter(e=>e.category!=='ref_paid'&&!isRetainedCat(e.category))
  const expList=(per==='month'?allExp.filter(e=>e.date?.startsWith(rm2)):per==='year'?allExp.filter(e=>e.date?.startsWith(ry2)):allExp.filter(e=>e.date>=from&&e.date<=to))
  const total=expList.reduce((a,e)=>a+e.amount,0)
  const byCat={};expList.forEach(e=>{if(!byCat[e.category])byCat[e.category]=0;byCat[e.category]+=e.amount})
  const sorted=Object.entries(byCat).sort((a,b)=>b[1]-a[1])
  
  // Month-over-month comparison (only in month view)
  const prevMonth=(()=>{const d=new Date(rm2+'-01');d.setMonth(d.getMonth()-1);return d.toISOString().slice(0,7)})()
  const prevExpList=allExp.filter(e=>e.date?.startsWith(prevMonth))
  const prevTotal=prevExpList.reduce((a,e)=>a+e.amount,0)
  const momChange=prevTotal>0?((total-prevTotal)/prevTotal*100):0
  
  // Category trend over last 6 months
  const last6=(()=>{const arr=[];const base=new Date(rm2+'-01');for(let i=5;i>=0;i--){const d=new Date(base);d.setMonth(d.getMonth()-i);arr.push(d.toISOString().slice(0,7))}return arr})()
  const trendData=last6.map(m=>{const mExp=allExp.filter(e=>e.date?.startsWith(m));return{month:m,total:mExp.reduce((a,e)=>a+e.amount,0)}})
  const maxTrend=Math.max(1,...trendData.map(t=>t.total))
  
  const saveAdd=async()=>{
    const amt=parseFloat(addF.amt);if(!amt||amt<=0){alert('Enter amount');return}
    await actions.addExpense({id:uid(),date:addF.date,category:addF.cat,amount:amt,description:addF.desc,payment:addF.pay,is_monthly:false})
    setAddF({date:todayStr(),cat:'supplies',amt:'',desc:'',pay:'cash'});setShowAdd(false)
  }
  const saveEdit=async()=>{
    const amt=parseFloat(editExp.amount);if(!amt||amt<=0){alert('Enter amount');return}
    await actions.updateExpense(editExp.id,{date:editExp.date,category:editExp.category,amount:amt,description:editExp.description})
    setEditExp(null)
  }
  const delExp=async(id)=>{if(window.confirm('Delete this expense?'))await actions.delExpense(id)}
  
  return(<>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}>
      <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
        {[{k:'month',l:'Month'},{k:'year',l:'Year'},{k:'custom',l:'Custom'}].map(v=>(<button key={v.k} onClick={()=>setPer(v.k)} style={{padding:'6px 14px',borderRadius:20,border:per===v.k?'none':'1px solid #e5e7eb',background:per===v.k?'#111':'none',color:per===v.k?'#fff':'#888',fontSize:12,fontWeight:600,cursor:'pointer'}}>{v.l}</button>))}
      </div>
      <button onClick={()=>setShowAdd(true)} style={{padding:'7px 14px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Add Expense</button>
    </div>
    {per==='month'&&<input style={{...S.inp,marginBottom:12}} type="month" value={rm2} onChange={e=>setRm2(e.target.value)}/>}
    {per==='year'&&<select style={{...S.sel,marginBottom:12}} value={ry2} onChange={e=>setRy2(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>}
    {per==='custom'&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:12}}><FInp label="From" type="date" value={from} onChange={e=>setFrom(e.target.value)}/><FInp label="To" type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>}
    
    <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:14,padding:'16px',marginBottom:14}}>
      <div style={{fontSize:11,color:'#dc2626',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Total expenses</div>
      <div style={{fontSize:32,fontWeight:800,color:'#dc2626'}}>{fmt(total)}</div>
      <div style={{fontSize:11,color:'#aaa',marginTop:4}}>{expList.length} entries</div>
      {per==='month'&&prevTotal>0&&<div style={{marginTop:8,paddingTop:8,borderTop:'1px dashed #fecaca',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:12,color:'#92400e'}}>vs last month ({fmt(prevTotal)})</span>
        <span style={{fontSize:13,fontWeight:800,color:momChange>0?'#dc2626':'#16a34a'}}>{momChange>0?'▲':'▼'} {Math.abs(momChange).toFixed(1)}%</span>
      </div>}
    </div>
    
    {/* 6-MONTH TREND */}
    {per==='month'&&<><SecL>📈 6-month trend</SecL>
    <Card style={{marginBottom:14}}>
      <div style={{display:'flex',alignItems:'flex-end',gap:6,height:120,marginBottom:8}}>
        {trendData.map((t,i)=>{const h=t.total/maxTrend*100;const isCur=t.month===rm2;return(
          <div key={t.month} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
            <div style={{fontSize:9,color:'#64748b',fontWeight:700}}>{t.total>=1000?(t.total/1000).toFixed(0)+'k':t.total}</div>
            <div style={{width:'100%',height:h+'%',minHeight:2,background:isCur?'#dc2626':'#fca5a5',borderRadius:'4px 4px 0 0'}}/>
            <div style={{fontSize:9,color:isCur?'#dc2626':'#94a3b8',fontWeight:isCur?800:500}}>{t.month.slice(5)}</div>
          </div>
        )})}
      </div>
    </Card></>}
    
    <SecL>By category (tap to expand)</SecL>
    <Card>
      {sorted.length===0&&<div style={{textAlign:'center',padding:'16px 0',color:'#ccc',fontSize:13}}>No expenses</div>}
      {sorted.map(([cat,amt])=>{
        const cInfo=ECATS.find(x=>x.key===cat);const pct=total>0?Math.round(amt/total*100):0
        const catEntries=expList.filter(e=>e.category===cat).sort((a,b)=>(b.date||'').localeCompare(a.date||''))
        const isExp=expandCat===cat
        return(<div key={cat} style={{padding:'10px 0',borderBottom:'1px solid #f5f5f5'}}>
          <div onClick={()=>setExpandCat(isExp?null:cat)} style={{cursor:'pointer'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <span style={{fontSize:13,fontWeight:600}}>{isExp?'▼':'▶'} {cInfo?.label||cat}{cInfo?.segment==='lab'?' 🧪':''}</span>
              <span style={{fontSize:13,fontWeight:700,color:'#ef4444'}}>{fmt(amt)}</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}><div style={{flex:1,height:6,background:'#f0f0f0',borderRadius:3}}><div style={{width:pct+'%',height:6,background:'#ef4444',borderRadius:3,opacity:0.7}}/></div><span style={{fontSize:10,color:'#aaa',minWidth:28}}>{pct}%</span></div>
          </div>
          {isExp&&<div style={{marginTop:8,paddingLeft:12,borderLeft:'2px solid #fecaca'}}>
            {catEntries.map(e=>(<div key={e.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'6px 0',borderBottom:'1px dotted #f1f5f9'}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:12,fontWeight:600,color:'#1a1a2e'}}>{e.description||'(no description)'}</div>
                <div style={{fontSize:10,color:'#94a3b8'}}>{fmtD(e.date)}{e.payment?' · '+e.payment:''}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:6}}>
                <span style={{fontSize:13,fontWeight:700,color:'#ef4444'}}>{fmt(e.amount)}</span>
                <button onClick={()=>setEditExp({...e})} style={{padding:'3px 8px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:6,fontSize:10,color:'#1d4ed8',cursor:'pointer',fontWeight:600}}>Edit</button>
                <button onClick={()=>delExp(e.id)} style={{padding:'3px 8px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,fontSize:10,color:'#dc2626',cursor:'pointer',fontWeight:600}}>✕</button>
              </div>
            </div>))}
          </div>}
        </div>)
      })}
      {total>0&&<div style={{display:'flex',justifyContent:'space-between',paddingTop:10,marginTop:4,borderTop:'2px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total</span><span style={{color:'#ef4444'}}>{fmt(total)}</span></div>}
    </Card>
    
    {/* ADD EXPENSE MODAL */}
    {showAdd&&<div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.6)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
      <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:460,padding:'20px 18px',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{fontSize:16,fontWeight:800,marginBottom:14}}>+ Add Expense</div>
        <FInp label="Date" type="date" value={addF.date} onChange={e=>setAddF({...addF,date:e.target.value})}/>
        <FSel label="Category" value={addF.cat} onChange={async e=>{
          const v=e.target.value
          if(v==='__add__'){
            const name=prompt('New category name (e.g. "Pharmacy stock"):')
            if(!name||!name.trim())return
            const seg=prompt('Segment? Type "lab" for lab P&L, anything else for clinical P&L:','clinical')
            const isLab=seg&&seg.toLowerCase().trim()==='lab'
            const key=name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')||('custom_'+Date.now())
            const ok=await actions.addCustomCategory({key,label:name.trim(),segment:isLab?'lab':'clinical'})
            if(ok!==false)setAddF({...addF,cat:key})
          }else{setAddF({...addF,cat:v})}
        }}>
          {getCats(db).filter(x=>x.key!=='ref_paid').map(x=><option key={x.key} value={x.key}>{x.segment==='lab'?'🧪 ':''}{x.label}{x.custom?' (custom)':''}</option>)}
          <option disabled>──────────</option>
          <option value="__add__">+ Add new category…</option>
        </FSel>
        {(addF.cat==='consultant_fee'||addF.cat==='consultant_proc_comm')&&<FSel label="Consultant (name goes into description)" value={addF.desc} onChange={e=>setAddF({...addF,desc:e.target.value})}>
          <option value="">- Select consultant -</option>
          {db.consultants.map(cn=><option key={cn.id} value={'Dr. '+cn.name}>Dr. {cn.name}</option>)}
        </FSel>}
        <FInp label="Description (e.g. employee name for salary)" value={addF.desc} onChange={e=>setAddF({...addF,desc:e.target.value})}/>
        <FInp label="Amount (Rs)" type="number" value={addF.amt} onChange={e=>setAddF({...addF,amt:e.target.value})}/>
        <div style={{display:'flex',gap:8,marginTop:14}}>
          <button onClick={()=>setShowAdd(false)} style={{flex:1,padding:'11px',background:'#f3f4f6',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Cancel</button>
          <button onClick={saveAdd} style={{flex:2,padding:'11px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Add Expense</button>
        </div>
      </div>
    </div>}
    
    {/* EDIT EXPENSE MODAL */}
    {editExp&&<div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.6)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
      <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:460,padding:'20px 18px',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{fontSize:16,fontWeight:800,marginBottom:14}}>Edit Expense</div>
        <FInp label="Date" type="date" value={editExp.date} onChange={e=>setEditExp({...editExp,date:e.target.value})}/>
        <FSel label="Category" value={editExp.category} onChange={e=>setEditExp({...editExp,category:e.target.value})}>
          {getCats(db).filter(x=>x.segment!=='skip').map(x=><option key={x.key} value={x.key}>{x.segment==='lab'?'🧪 ':''}{x.label}</option>)}
        </FSel>
        <FInp label="Description" value={editExp.description||''} onChange={e=>setEditExp({...editExp,description:e.target.value})}/>
        <FInp label="Amount (Rs)" type="number" value={editExp.amount} onChange={e=>setEditExp({...editExp,amount:e.target.value})}/>
        <div style={{display:'flex',gap:8,marginTop:14}}>
          <button onClick={()=>setEditExp(null)} style={{flex:1,padding:'11px',background:'#f3f4f6',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Cancel</button>
          <button onClick={saveEdit} style={{flex:2,padding:'11px',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Save Changes</button>
        </div>
      </div>
    </div>}
  </>)
}

/*  PATIENT LIST REPORT  */
const PatientListReport=({db,gotoTimeline,canSeeReports})=>{
  const [per,setPer]=useState('month')
  const [rm2,setRm2]=useState(todayStr().slice(0,7))
  const [ry2,setRy2]=useState(todayStr().slice(0,4))
  const [from,setFrom]=useState(todayStr().slice(0,7)+'-01')
  const [to,setTo]=useState(todayStr())
  const [showType,setShowType]=useState('all')
  const [opView,setOpView]=useState('all')
  const [opRefFilter,setOpRefFilter]=useState('')
  const [opConFilter,setOpConFilter]=useState('')
  const [ipView,setIpView]=useState('active')
  const [ipSearch,setIpSearch]=useState('')
  const [ipRefFilter2,setIpRefFilter2]=useState('')
  const yrs=[...new Set(db.ip_patients.map(e=>e.admission_date?.slice(0,4)))].filter(Boolean).sort().reverse()
  if(!yrs.includes(ry2))yrs.unshift(ry2)
  const ipPats=db.ip_patients.filter(p=>{const adm=p.admission_date||'';const dis=p.discharge_date||'9999-12-31';if(per==='month')return adm.startsWith(rm2)||(adm<=rm2+'-31'&&dis>=rm2+'-01');if(per==='year')return adm.startsWith(ry2)||(adm<=ry2+'-12-31'&&dis>=ry2+'-01-01');return adm<=to&&(dis>=from||!p.discharge_date)})
  const periodInc=per==='month'?db.income.filter(e=>e.date?.startsWith(rm2)):per==='year'?db.income.filter(e=>e.date?.startsWith(ry2)):db.income.filter(e=>e.date>=from&&e.date<=to)
  const opEnts=periodInc.filter(e=>!['ip','ip_r','ip_l','ip_p'].includes(e.type)&&e.patient_name&&!db.ip_patients.some(p=>p.id===e.patient_id))
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
        <div style={{display:'flex',gap:6,marginBottom:10,overflowX:'auto'}}>{[{k:'all',l:'All'},{k:'active',l:'Active'},{k:'discharged',l:'Discharged'},...(canSeeReports?[{k:'ref',l:'By Ref Doctor'}]:[])].map(v=>(<button key={v.k} onClick={()=>setIpView(v.k)} style={{flexShrink:0,padding:'6px 12px',borderRadius:20,border:ipView===v.k?'none':'1px solid #e5e7eb',background:ipView===v.k?'#16a34a':'none',color:ipView===v.k?'#fff':'#888',fontSize:11,fontWeight:600,cursor:'pointer'}}>{v.l}</button>))}</div>
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
        return(<><SecL>IP patients ({pool.length})</SecL>{pool.map(p=>{const ents=db.income.filter(e=>e.patient_id===p.id||(e.patient_name&&e.patient_name.trim().toLowerCase()===(p.name||'').trim().toLowerCase())).map(e=>{
          if(e.ref_doctor&&e.ref_doctor.trim())return e
          if(!p.ref_doctor)return e
          const doc=db.ref_doctors.find(d=>d.name===p.ref_doctor)
          const pctKey={ip:'ip_pct',ip_r:'ip_r_pct',ip_l:'ip_l_pct',ip_p:'ip_pct'}[e.type]
          let cc=e.custom_commission
          if(cc==null){if(doc&&pctKey&&doc[pctKey]!=null)cc=doc[pctKey];else if(p.custom_commission!=null&&p.custom_commission!=='')cc=parseFloat(p.custom_commission)}
          return{...e,ref_doctor:p.ref_doctor,custom_commission:cc}
        });const total=ents.reduce((a,e)=>a+e.amount,0);const cash=cashTotal(ents);const credit=credTotal(ents);const pkgPd=(p.payments||[]).reduce((a,e)=>a+e.amount,0);const comm=ents.reduce((a,e)=>a+getComm(e),0)+(p.payments||[]).reduce((a,py)=>a+(py.commission||0),0);return(<Card key={p.id} style={{marginBottom:10}}>
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
    if(['ip','ip_r','ip_l','ip_p'].includes(e.type))return false
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
  const allVCFees=expList.filter(e=>e.category==='consultant_fee'||e.category==='consultant_proc_comm').reduce((a,e)=>a+e.amount,0)
  const allDeductions=allComm+allVCFees
  const allReal=allInc-allDeductions
  const allExp=expList.reduce((a,e)=>a+(e.amount||0),0)

  const riRatio=(dn,s)=>{const cl=(db.income||[]).filter(e=>e.ref_doctor===dn&&incomeSegment(e.type)==='clinical').reduce((a,e)=>a+getComm(e),0);const lb=(db.income||[]).filter(e=>e.ref_doctor===dn&&incomeSegment(e.type)==='lab').reduce((a,e)=>a+getComm(e),0);const t=cl+lb;return t>0?(s==='lab'?lb/t:cl/t):(s==='lab'?0:1)}
  const clinInc=incList.filter(e=>!['op_l','ip_l'].includes(e.type)&&!isCredit(e))
  const clinGross=clinInc.reduce((a,e)=>a+(e.amount||0),0)
  const clinComm=expList.filter(e=>e.category==='ref_paid').reduce((a,e)=>a+e.amount*riRatio((e.description||'').trim(),'clinical'),0)
  const clinCons=expList.filter(e=>e.category==='consultant_fee'||e.category==='consultant_proc_comm').reduce((a,e)=>a+e.amount,0)
  const segClinExp=expList.filter(e=>e.category!=='consultant_fee'&&e.category!=='consultant_proc_comm'&&!isRetainedCat(e.category)&&expenseSegment(e.category)!=='lab')
  const clinExpTotal=segClinExp.reduce((a,e)=>a+(e.amount||0),0)
  const riRetC=expList.filter(e=>e.category==='comm_retained_clinical').reduce((a,e)=>a+(e.amount||0),0)
  const riRetL=expList.filter(e=>e.category==='comm_retained_lab').reduce((a,e)=>a+(e.amount||0),0)
  const clinActual=clinGross-clinComm-clinCons-clinExpTotal
  const clinExpCats={}
  segClinExp.forEach(e=>{
    const k=e.category||'other'
    clinExpCats[k]=(clinExpCats[k]||0)+(e.amount||0)
  })

  const labInc=incList.filter(e=>['op_l','ip_l'].includes(e.type)&&!isCredit(e))
  const labGross=labInc.reduce((a,e)=>a+(e.amount||0),0)
  const labComm=expList.filter(e=>e.category==='ref_paid').reduce((a,e)=>a+e.amount*riRatio((e.description||'').trim(),'lab'),0)
  const labToLab=expList.filter(e=>expenseSegment(e.category)==='lab').reduce((a,e)=>a+(e.amount||0),0)
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
          {ITYPES.map(t=>{const ents=incList.filter(e=>e.type===t.key&&!isCredit(e));const ti=ents.reduce((a,e)=>a+(e.amount||0),0);const td=0;if(!ti)return null;return(<div key={t.key} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'9px 0',borderBottom:'1px solid #f5f5f5',alignItems:'center'}}><span style={{display:'flex',alignItems:'center',gap:6,fontSize:13}}><TypeTag t={t.key}/>{t.full}</span><span style={{fontSize:13,textAlign:'right',minWidth:64}}>{fmt(ti)}</span><span style={{fontSize:13,textAlign:'right',color:'#ef4444',minWidth:64}}>{td>0?'-'+fmt(td):'-'}</span><span style={{fontSize:13,textAlign:'right',color:'#16a34a',fontWeight:700,minWidth:64}}>{fmt(ti-td)}</span></div>)})}
          <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'10px 0 0',marginTop:6,borderTop:'2px solid #111'}}><span style={{fontSize:14,fontWeight:800}}>Total</span><span style={{fontSize:14,fontWeight:800,textAlign:'right',minWidth:64}}>{fmt(allInc)}</span><span style={{fontSize:14,fontWeight:800,textAlign:'right',color:'#ef4444',minWidth:64}}>{allDeductions>0?'-'+fmt(allDeductions):'-'}</span><span style={{fontSize:14,fontWeight:800,textAlign:'right',color:'#16a34a',minWidth:64}}>{fmt(allReal)}</span></div>
          {/* Payment mode breakdown */}
          <div style={{marginTop:12,paddingTop:10,borderTop:'1px dashed #e5e7eb'}}>
            <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',marginBottom:8}}>Payment mode breakdown</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
              {[{k:'cash',l:'Cash',bg:'#f0fdf4',c:'#16a34a'},{k:'upi',l:'UPI / Scan',bg:'#eff6ff',c:'#2563eb'},{k:'card',l:'Card',bg:'#fdf4ff',c:'#7c3aed'},{k:'bank',l:'Bank',bg:'#fff7ed',c:'#d97706'},{k:'credit',l:'Credit (Due)',bg:'#fef2f2',c:'#dc2626'}].map(m=>{
                const amt=incList.filter(e=>e.payment===m.k).reduce((a,e)=>a+(e.amount||0),0)
                if(!amt)return null
                return(<div key={m.k} style={{background:m.bg,borderRadius:10,padding:'8px 10px'}}>
                  <div style={{fontSize:10,color:m.c,fontWeight:700,marginBottom:3}}>{m.l}</div>
                  <div style={{fontSize:14,fontWeight:800,color:m.c}}>{fmt(amt)}</div>
                </div>)
              })}
            </div>
          </div>
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
              <div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#374151'}}>Ref commissions + Consultant fees</span><span style={{fontWeight:700,color:'#d97706'}}>- {fmt(allDeductions)}</span></div>
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
            {clinCons>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:12}}><span style={{color:'#475569'}}>Consultant fees</span><span style={{fontWeight:700,color:'#7e22ce'}}>- {fmt(clinCons)}</span></div>}
            
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
/*  LOST DOCTORS REPORT  */
const LostDoctorsReport=({db})=>{
  const inc=db.income||[]
  const today=todayStr()
  const thisMonth=today.slice(0,7)
  
  // Get month strings for past 6 months
  const getMonth=(monthsBack)=>{
    const d=new Date()
    d.setMonth(d.getMonth()-monthsBack)
    return d.toISOString().slice(0,7)
  }
  
  // Doctors who sent patients this month
  const activeThisMonth=new Set(inc.filter(e=>e.date?.startsWith(thisMonth)&&e.ref_doctor?.trim()).map(e=>e.ref_doctor.trim()))
  
  // For each past month, find doctors who sent patients then but NOT this month
  const periods=[1,2,3,4,5,6].map(n=>{
    const mon=getMonth(n)
    const [yr,mo]=mon.split('-')
    const label=MOFULL[parseInt(mo)-1]+' '+yr
    const docsThisMonth=new Set(inc.filter(e=>e.date?.startsWith(mon)&&e.ref_doctor?.trim()).map(e=>e.ref_doctor.trim()))
    const lostDocs=[...docsThisMonth].filter(d=>!activeThisMonth.has(d))
    // Get their patient count and income from that month
    const details=lostDocs.map(doc=>{
      const docInc=inc.filter(e=>e.date?.startsWith(mon)&&e.ref_doctor===doc)
      const pts=new Set(docInc.map(e=>e.patient_name||e.patient_id)).size
      const total=docInc.reduce((a,e)=>a+e.amount,0)
      const lastSeen=inc.filter(e=>e.ref_doctor===doc).map(e=>e.date).sort().reverse()[0]||mon
      return{doc,pts,total,lastSeen}
    }).sort((a,b)=>b.total-a.total)
    return{mon,label,n,lostDocs:details}
  }).filter(p=>p.lostDocs.length>0)

  return(<>
    <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:14,padding:'14px 16px',marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:'#991b1b',marginBottom:4}}>Lost referral doctors</div>
      <div style={{fontSize:12,color:'#b91c1c'}}>Doctors who sent patients in past months but have NOT sent anyone this month. Call them today.</div>
    </div>
    {periods.length===0&&<div style={{textAlign:'center',padding:'40px 0',color:'#ccc',fontSize:13}}>No lost doctors found — all referrals are active!</div>}
    {periods.map(p=>(<div key={p.mon} style={{marginBottom:20}}>
      <SecL>{p.n} month{p.n>1?'s':''} ago — {p.label} ({p.lostDocs.length} doctor{p.lostDocs.length>1?'s':''})</SecL>
      <Card>
        {p.lostDocs.map((d,i)=>(<div key={d.doc} style={{padding:'10px 0',borderBottom:'1px solid #f5f5f5',display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>Dr. {d.doc}</div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{d.pts} patient{d.pts>1?'s':''} that month — Income: {fmt(d.total)}</div>
            <div style={{fontSize:11,color:'#d97706',marginTop:1}}>Last seen: {fmtD(d.lastSeen)}</div>
          </div>
          <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,background:'#fef2f2',color:'#dc2626',fontWeight:700,whiteSpace:'nowrap'}}>{p.n}mo ago</span>
        </div>))}
      </Card>
    </div>))}
  </>)
}

/*  SUPPLIES REPORT  */
const SuppliesReport=({db,actions})=>{
  const [newItem,setNewItem]=useState('')
  const [newQty,setNewQty]=useState('')
  const [newUnit,setNewUnit]=useState('units')
  const [adding,setAdding]=useState(false)
  
  // Use expenses with category 'supplies' as supply tracking
  const supplies=db.expenses.filter(e=>e.category==='supplies').slice().sort((a,b)=>(b.date||'').localeCompare(a.date||''))
  const thisMonth=todayStr().slice(0,7)
  const monthSupplies=supplies.filter(e=>e.date?.startsWith(thisMonth))
  const totalSpent=monthSupplies.reduce((a,e)=>a+e.amount,0)

  return(<>
    <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:14,padding:'14px 16px',marginBottom:16}}>
      <div style={{fontSize:13,fontWeight:700,color:'#15803d'}}>Medical supplies this month</div>
      <div style={{fontSize:22,fontWeight:800,color:'#16a34a',marginTop:4}}>{fmt(totalSpent)}</div>
      <div style={{fontSize:11,color:'#86efac',marginTop:2}}>{monthSupplies.length} entries</div>
    </div>
    {adding?(<div style={{background:'#fff',border:'1px solid #e5e7eb',borderRadius:14,padding:'16px',marginBottom:16}}>
      <div style={{fontSize:14,fontWeight:700,marginBottom:12}}>Add supply entry</div>
      <FInp label="Item name" value={newItem} onChange={e=>setNewItem(e.target.value)} placeholder="e.g. Gloves, Syringes, Bandages"/>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <FInp label="Amount (Rs)" type="number" value={newQty} onChange={e=>setNewQty(e.target.value)} placeholder="500"/>
        <FSel label="Unit" value={newUnit} onChange={e=>setNewUnit(e.target.value)}>
          <option>units</option><option>boxes</option><option>packets</option><option>bottles</option><option>strips</option>
        </FSel>
      </div>
      <div style={{display:'flex',gap:8,marginTop:8}}>
        <PBtn onClick={async()=>{if(!newItem||!newQty){alert('Enter item and amount');return}await actions.addExpense({id:uid(),date:todayStr(),category:'supplies',amount:parseFloat(newQty),description:newItem+' ('+newUnit+')',payment:'cash',is_monthly:false});setNewItem('');setNewQty('');setAdding(false)}}>Save</PBtn>
        <button onClick={()=>setAdding(false)} style={{flex:1,padding:'12px',background:'none',border:'1px solid #e5e7eb',borderRadius:12,fontSize:14,cursor:'pointer'}}>Cancel</button>
      </div>
    </div>):(<GBtn onClick={()=>setAdding(true)} style={{width:'100%',marginBottom:16}}>+ Add supply purchase</GBtn>)}
    <SecL>All supply entries</SecL>
    {supplies.length===0?<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:13}}>No supplies recorded yet</div>:
    <Card>
      {supplies.map((e,i)=>(<div key={e.id||i} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',padding:'9px 0',borderBottom:'1px solid #f5f5f5'}}>
        <div>
          <div style={{fontSize:13,fontWeight:600,color:'#0f172a'}}>{e.description||'Supply'}</div>
          <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{fmtD(e.date)}</div>
        </div>
        <div style={{fontSize:14,fontWeight:700,color:'#dc2626'}}>{fmt(e.amount)}</div>
      </div>))}
    </Card>}
  </>)
}

/*  INCOME CHART REPORT  */
const IncomeChartReport=({db})=>{
  const [period,setPeriod]=useState('month')
  const [mon,setMon]=useState(todayStr().slice(0,7))
  const [yr,setYr]=useState(todayStr().slice(0,4))
  const yrs=[...new Set((db.income||[]).map(e=>e.date?.slice(0,4)).filter(Boolean))].sort((a,b)=>b.localeCompare(a))
  
  const inc=db.income||[]
  const exps=(db.expenses||[]).filter(e=>e.category!=='ref_paid')
  
  let chartData=[]
  if(period==='month'){
    const days=[...new Set(inc.filter(e=>e.date?.startsWith(mon)).map(e=>e.date))].sort()
    chartData=days.map(d=>{
      const dI=inc.filter(e=>e.date===d)
      const dE=exps.filter(e=>e.date===d)
      const gross=dI.reduce((a,e)=>a+e.amount,0)
      const comm=dI.reduce((a,e)=>a+getComm(e),0)
      const exp=dE.reduce((a,e)=>a+e.amount,0)
      return{label:d.slice(8),gross,real:gross-comm,actual:gross-comm-exp}
    })
  } else {
    const mons=[...new Set(inc.filter(e=>e.date?.startsWith(yr)).map(e=>e.date?.slice(0,7)))].sort()
    chartData=mons.map(m=>{
      const mI=inc.filter(e=>e.date?.startsWith(m))
      const mE=exps.filter(e=>e.date?.startsWith(m))
      const gross=mI.reduce((a,e)=>a+e.amount,0)
      const comm=mI.reduce((a,e)=>a+getComm(e),0)
      const exp=mE.reduce((a,e)=>a+e.amount,0)
      const [,mo]=m.split('-')
      return{label:MOS[parseInt(mo)-1],gross,real:gross-comm,actual:gross-comm-exp}
    })
  }
  
  const maxVal=Math.max(...chartData.map(d=>d.gross),1)
  
  return(<>
    <div style={{display:'flex',gap:6,marginBottom:12}}>
      {[{k:'month',l:'Monthly'},{k:'year',l:'Yearly'}].map(t=>(<button key={t.k} onClick={()=>setPeriod(t.k)} style={{padding:'6px 16px',borderRadius:20,border:period===t.k?'none':'1px solid #e5e7eb',background:period===t.k?'#16a34a':'none',color:period===t.k?'#fff':'#888',fontSize:12,fontWeight:700,cursor:'pointer'}}>{t.l}</button>))}
    </div>
    {period==='month'&&<input style={{...S.inp,marginBottom:12}} type="month" value={mon} onChange={e=>setMon(e.target.value)}/>}
    {period==='year'&&<select style={{...S.sel,marginBottom:12}} value={yr} onChange={e=>setYr(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>}
    
    {/* Legend */}
    <div style={{display:'flex',gap:16,marginBottom:16,flexWrap:'wrap'}}>
      {[{c:'#16a34a',l:'Gross collected'},{c:'#2563eb',l:'Real income'},{c:'#7c3aed',l:'Actual income'}].map(m=>(<div key={m.l} style={{display:'flex',alignItems:'center',gap:6,fontSize:12}}><div style={{width:12,height:12,borderRadius:3,background:m.c}}/>{m.l}</div>))}
    </div>
    
    {chartData.length===0?<div style={{textAlign:'center',padding:'40px 0',color:'#ccc'}}>No data for this period</div>:
    <div style={{overflowX:'auto'}}>
      <div style={{minWidth:Math.max(chartData.length*60,300),paddingBottom:8}}>
        {/* Chart bars */}
        <div style={{display:'flex',alignItems:'flex-end',gap:4,height:200,marginBottom:8,borderBottom:'2px solid #f0f0f0',paddingTop:8}}>
          {chartData.map((d,i)=>(
            <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:2,height:'100%',justifyContent:'flex-end',minWidth:40}}>
              <div style={{width:'100%',display:'flex',gap:2,alignItems:'flex-end',height:'100%',justifyContent:'flex-end'}}>
                <div style={{flex:1,background:'#16a34a',borderRadius:'3px 3px 0 0',height:Math.round((d.gross/maxVal)*180)+'px',minHeight:d.gross>0?2:0}}/>
                <div style={{flex:1,background:'#2563eb',borderRadius:'3px 3px 0 0',height:Math.round((d.real/maxVal)*180)+'px',minHeight:d.real>0?2:0}}/>
                <div style={{flex:1,background:'#7c3aed',borderRadius:'3px 3px 0 0',height:Math.round((Math.max(d.actual,0)/maxVal)*180)+'px',minHeight:Math.max(d.actual,0)>0?2:0}}/>
              </div>
            </div>
          ))}
        </div>
        {/* X-axis labels */}
        <div style={{display:'flex',gap:4}}>
          {chartData.map((d,i)=>(<div key={i} style={{flex:1,textAlign:'center',fontSize:10,color:'#94a3b8',minWidth:40}}>{d.label}</div>))}
        </div>
      </div>
    </div>}
    
    {/* Summary table */}
    {chartData.length>0&&<>
      <SecL>Summary</SecL>
      <Card>
        <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,paddingBottom:8,borderBottom:'1px solid #f0f0f0',marginBottom:4}}>
          <div style={{fontSize:10,color:'#aaa',fontWeight:700}}></div>
          <div style={{fontSize:10,color:'#16a34a',fontWeight:700,textAlign:'right',minWidth:72}}>Gross</div>
          <div style={{fontSize:10,color:'#2563eb',fontWeight:700,textAlign:'right',minWidth:72}}>Real</div>
          <div style={{fontSize:10,color:'#7c3aed',fontWeight:700,textAlign:'right',minWidth:72}}>Actual</div>
        </div>
        {chartData.map((d,i)=>(<div key={i} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'6px 0',borderBottom:'1px solid #f5f5f5'}}>
          <span style={{fontSize:12,fontWeight:600}}>{d.label}</span>
          <span style={{fontSize:12,textAlign:'right',minWidth:72,color:'#16a34a'}}>{fmt(d.gross)}</span>
          <span style={{fontSize:12,textAlign:'right',minWidth:72,color:'#2563eb'}}>{fmt(d.real)}</span>
          <span style={{fontSize:12,textAlign:'right',minWidth:72,color:d.actual>=0?'#7c3aed':'#dc2626',fontWeight:d.actual<0?700:400}}>{fmt(d.actual)}</span>
        </div>))}
        <div style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',gap:4,padding:'8px 0 0',borderTop:'2px solid #111',marginTop:4}}>
          <span style={{fontSize:13,fontWeight:800}}>Total</span>
          <span style={{fontSize:13,fontWeight:800,textAlign:'right',minWidth:72,color:'#16a34a'}}>{fmt(chartData.reduce((a,d)=>a+d.gross,0))}</span>
          <span style={{fontSize:13,fontWeight:800,textAlign:'right',minWidth:72,color:'#2563eb'}}>{fmt(chartData.reduce((a,d)=>a+d.real,0))}</span>
          <span style={{fontSize:13,fontWeight:800,textAlign:'right',minWidth:72,color:'#7c3aed'}}>{fmt(chartData.reduce((a,d)=>a+d.actual,0))}</span>
        </div>
      </Card>
    </>}
  </>)
}

/*  INSURANCE UPDATE PANEL  */
const InsuranceUpdatePanel=({p,db,actions,setDb})=>{
  const [open,setOpen]=useState(false)
  const [status,setStatus]=useState(p.insurance_status||'pending')
  const [newApproved,setNewApproved]=useState('')
  const [insPayAmt,setInsPayAmt]=useState('')
  const [insPayDate,setInsPayDate]=useState(todayStr())
  const [insPayNote,setInsPayNote]=useState('')
  const [busy,setBusy]=useState(false)

  if(!p.insurance_type)return null

  const totalBill=db.income.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+(e.amount||0),0)
  const totalApproved=p.insurance_expected||0
  const insRec=(p.payments||[]).filter(py=>py.mode==='insurance').reduce((a,py)=>a+(py.amount||0),0)
  const insPend=Math.max(totalApproved-insRec,0)
  const copay=Math.max(totalBill-totalApproved,0)
  const cashRec=(p.payments||[]).filter(py=>py.mode!=='insurance').reduce((a,py)=>a+(py.amount||0),0)
  const copayPend=Math.max(copay-cashRec,0)

  const save=async()=>{
    setBusy(true)
    const newExp=newApproved?parseFloat(newApproved):totalApproved
    // Update insurance status and approved amount
    const {error}=await supabase.from('ip_patients').update({
      insurance_status:status,
      insurance_expected:newExp
    }).eq('id',p.id)
    if(error){alert('Update failed: '+error.message);setBusy(false);return}

    // Record insurance payment if amount entered
    let newPayments=[...(p.payments||[])]
    if(insPayAmt&&parseFloat(insPayAmt)>0){
      newPayments=[...newPayments,{
        id:uid(),
        date:insPayDate,
        amount:parseFloat(insPayAmt),
        mode:'insurance',
        note:insPayNote||'Insurance payment'
      }]
      await supabase.from('ip_patients').update({payments:newPayments}).eq('id',p.id)
    }

    setDb(d=>({...d,ip_patients:d.ip_patients.map(pt=>pt.id===p.id?{...pt,
      insurance_status:status,
      insurance_expected:newExp,
      payments:newPayments
    }:pt)}))
    setOpen(false)
    setNewApproved('')
    setInsPayAmt('')
    setInsPayNote('')
    setBusy(false)
  }

  return(<div style={{marginBottom:8}}>
    {!open?(<button onClick={()=>setOpen(true)} style={{width:'100%',padding:'8px',background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:10,fontSize:12,fontWeight:700,color:'#1d4ed8',cursor:'pointer'}}>Update Insurance Status / Add Payment</button>)
    :(<div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:12,padding:'14px',marginBottom:8}}>
        <div style={{fontSize:13,fontWeight:700,color:'#0f172a',marginBottom:12}}>Update Insurance</div>

        {/* Current summary */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:12,background:'#fff',borderRadius:8,padding:'8px'}}>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:9,color:'#94a3b8',fontWeight:700}}>TOTAL BILL</div>
            <div style={{fontSize:14,fontWeight:800,color:'#0f172a'}}>{fmt(totalBill)}</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:9,color:'#2563eb',fontWeight:700}}>APPROVED</div>
            <div style={{fontSize:14,fontWeight:800,color:'#2563eb'}}>{fmt(totalApproved)}</div>
          </div>
          <div style={{textAlign:'center'}}>
            <div style={{fontSize:9,color:'#7c3aed',fontWeight:700}}>CO-PAY</div>
            <div style={{fontSize:14,fontWeight:800,color:'#7c3aed'}}>{fmt(copay)}</div>
          </div>
        </div>

        {/* Status update */}
        <FSel label="Approval status" value={status} onChange={e=>setStatus(e.target.value)}>
          <option value="pending">Pending approval</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </FSel>

        {/* Update approved amount */}
        <FInp label={'Update approved amount (current: '+fmt(totalApproved)+')'} type="number" value={newApproved} onChange={e=>setNewApproved(e.target.value)} placeholder={'Current: '+fmt(totalApproved)+' — enter new if changed'}/>
        {newApproved&&parseFloat(newApproved)>0&&<div style={{background:'#eff6ff',borderRadius:8,padding:'8px',fontSize:12,color:'#1e40af',marginBottom:8}}>
          New approved: {fmt(parseFloat(newApproved))} — New co-pay: {fmt(Math.max(totalBill-parseFloat(newApproved),0))}
        </div>}

        {/* Record insurance payment received */}
        <div style={{borderTop:'1px solid #e5e7eb',paddingTop:10,marginTop:4}}>
          <div style={{fontSize:12,fontWeight:700,color:'#0f172a',marginBottom:8}}>Record insurance payment received</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <FInp label="Amount (Rs)" type="number" value={insPayAmt} onChange={e=>setInsPayAmt(e.target.value)} placeholder="Amount received"/>
            <FInp label="Date" type="date" value={insPayDate} onChange={e=>setInsPayDate(e.target.value)}/>
          </div>
          <FInp label="Note (optional)" type="text" value={insPayNote} onChange={e=>setInsPayNote(e.target.value)} placeholder="e.g. First installment, Pre-auth 1"/>
          {insPayAmt&&insPend>0&&<div style={{fontSize:11,color:'#d97706',marginBottom:8}}>
            After this payment — insurance pending: {fmt(Math.max(insPend-parseFloat(insPayAmt||0),0))}
          </div>}
        </div>

        <div style={{display:'flex',gap:8,marginTop:8}}>
          <PBtn onClick={save} disabled={busy} style={{flex:2}}>{busy?'Saving...':'Save'}</PBtn>
          <button onClick={()=>setOpen(false)} style={{flex:1,padding:'12px',background:'none',border:'1px solid #e5e7eb',borderRadius:12,fontSize:14,cursor:'pointer',color:'#aaa'}}>Cancel</button>
        </div>
      </div>)}
  </div>)
}

/*  INSURANCE TAB COMPONENT  */
const InsuranceTab=({p,db,setDb})=>{
  const [status,setStatus]=useState(p.insurance_status||'pending')
  const [newApproved,setNewApproved]=useState(String(p.insurance_expected||0))
  const [insPayAmt,setInsPayAmt]=useState('')
  const [insPayDate,setInsPayDate]=useState(todayStr())
  const [insPayNote,setInsPayNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [saved,setSaved]=useState(false)

  const totalBill=db.income.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+(e.amount||0),0)
  const approved=parseFloat(newApproved)||0
  const insPayments=(p.payments||[]).filter(py=>py.mode==='insurance')
  const insRec=insPayments.reduce((a,py)=>a+(py.amount||0),0)
  const insPend=Math.max(approved-insRec,0)
  const copay=Math.max(totalBill-approved,0)
  const cashRec=(p.payments||[]).filter(py=>py.mode!=='insurance').reduce((a,py)=>a+(py.amount||0),0)
  const copayPend=Math.max(copay-cashRec,0)

  const saveStatus=async()=>{
    setBusy(true)
    const {error}=await supabase.from('ip_patients').update({
      insurance_status:status,
      insurance_expected:approved
    }).eq('id',p.id)
    if(error){alert('Update failed: '+error.message);setBusy(false);return}
    setDb(d=>({...d,ip_patients:d.ip_patients.map(pt=>pt.id===p.id?{...pt,insurance_status:status,insurance_expected:approved}:pt)}))
    setSaved(true);setTimeout(()=>setSaved(false),2000)
    setBusy(false)
  }

  const addPayment=async()=>{
    if(!insPayAmt||parseFloat(insPayAmt)<=0){alert('Enter amount');return}
    setBusy(true)
    const amt=parseFloat(insPayAmt)
    const newPmt={id:uid(),date:insPayDate,amount:amt,mode:'insurance',note:insPayNote||'Insurance payment received'}
    const newPayments=[...(p.payments||[]),newPmt]
    const {error}=await supabase.from('ip_patients').update({payments:newPayments}).eq('id',p.id)
    if(error){alert('Failed: '+error.message);setBusy(false);return}
    setDb(d=>({...d,
      ip_patients:d.ip_patients.map(pt=>pt.id===p.id?{...pt,payments:newPayments}:pt)
    }))
    setInsPayAmt('');setInsPayNote('');setBusy(false)
  }

  return(<>
    {/* Status summary */}
    <div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:14,padding:'14px',marginBottom:12}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div>
          <div style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>{p.insurance_type}</div>
          {p.insurance_policy_no&&<div style={{fontSize:11,color:'#94a3b8'}}>Policy: {p.insurance_policy_no}</div>}
        </div>
        <span style={{fontSize:12,padding:'4px 12px',borderRadius:20,fontWeight:700,
          background:status==='approved'?'#f0fdf4':status==='rejected'?'#fef2f2':'#fffbeb',
          color:status==='approved'?'#16a34a':status==='rejected'?'#dc2626':'#d97706'
        }}>{status==='approved'?'Approved':status==='rejected'?'Rejected':'Pending'}</span>
      </div>
      {/* Bill breakdown */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:10}}>
        <div style={{textAlign:'center',background:'#f8fafc',borderRadius:8,padding:'8px'}}>
          <div style={{fontSize:9,color:'#94a3b8',fontWeight:700,marginBottom:3}}>TOTAL BILL</div>
          <div style={{fontSize:16,fontWeight:800,color:'#0f172a'}}>{fmt(totalBill)}</div>
        </div>
        <div style={{textAlign:'center',background:'#eff6ff',borderRadius:8,padding:'8px'}}>
          <div style={{fontSize:9,color:'#2563eb',fontWeight:700,marginBottom:3}}>INS APPROVED</div>
          <div style={{fontSize:16,fontWeight:800,color:'#2563eb'}}>{fmt(approved)}</div>
        </div>
        <div style={{textAlign:'center',background:'#fdf4ff',borderRadius:8,padding:'8px'}}>
          <div style={{fontSize:9,color:'#7c3aed',fontWeight:700,marginBottom:3}}>PATIENT CO-PAY</div>
          <div style={{fontSize:16,fontWeight:800,color:'#7c3aed'}}>{fmt(copay)}</div>
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:4,fontSize:12}}>
        <div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#94a3b8'}}>Insurance received so far</span><span style={{fontWeight:700,color:'#16a34a'}}>{fmt(insRec)}</span></div>
        {insPend>0&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#d97706',fontWeight:600}}>Insurance still pending</span><span style={{fontWeight:700,color:'#d97706'}}>{fmt(insPend)}</span></div>}
        {copayPend>0&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#dc2626',fontWeight:600}}>Co-pay pending from patient</span><span style={{fontWeight:700,color:'#dc2626'}}>{fmt(copayPend)}</span></div>}
        {insPend===0&&copayPend===0&&totalBill>0&&<div style={{textAlign:'center',color:'#16a34a',fontWeight:700}}>✅ Fully settled</div>}
      </div>
    </div>

    {/* Update approval */}
    <div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:14,padding:'14px',marginBottom:12}}>
      <div style={{fontSize:13,fontWeight:700,color:'#0f172a',marginBottom:10}}>Update approval</div>
      <FSel label="Status" value={status} onChange={e=>setStatus(e.target.value)}>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
      </FSel>
      <FInp label="Total approved amount (Rs)" type="number" value={newApproved} onChange={e=>setNewApproved(e.target.value)} placeholder="e.g. 25000"/>
      {parseFloat(newApproved)>0&&<div style={{background:'#eff6ff',borderRadius:8,padding:'8px',fontSize:12,color:'#1e40af',marginBottom:8}}>
        If approved {fmt(parseFloat(newApproved))} — patient co-pay: {fmt(Math.max(totalBill-parseFloat(newApproved),0))}
      </div>}
      <GBtn onClick={saveStatus} disabled={busy}>{busy?'Saving...':saved?'Saved ✓':'Save status & amount'}</GBtn>
    </div>

    {/* Insurance payments received */}
    <div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:14,padding:'14px',marginBottom:12}}>
      <div style={{fontSize:13,fontWeight:700,color:'#0f172a',marginBottom:10}}>Record insurance payment received</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <FInp label="Amount (Rs)" type="number" value={insPayAmt} onChange={e=>setInsPayAmt(e.target.value)} placeholder="Amount received"/>
        <FInp label="Date" type="date" value={insPayDate} onChange={e=>setInsPayDate(e.target.value)}/>
      </div>
      <FInp label="Note" type="text" value={insPayNote} onChange={e=>setInsPayNote(e.target.value)} placeholder="e.g. Pre-auth 1, Final settlement"/>
      <GBtn onClick={addPayment} disabled={busy}>{busy?'Saving...':'Record insurance payment'}</GBtn>
    </div>

    {/* Payment history */}
    {insPayments.length>0&&<div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:14,padding:'14px'}}>
      <div style={{fontSize:13,fontWeight:700,color:'#0f172a',marginBottom:10}}>Insurance payments history</div>
      {insPayments.map((py,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #f5f5f5'}}>
        <div><div style={{fontSize:13,fontWeight:600}}>{py.note||'Insurance payment'}</div>
          <div style={{fontSize:11,color:'#94a3b8'}}>{fmtD(py.date)}</div>
        </div>
        <div style={{fontSize:14,fontWeight:700,color:'#16a34a'}}>{fmt(py.amount)}</div>
      </div>))}
      <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #e5e7eb'}}>
        <span style={{fontSize:13,fontWeight:700}}>Total received</span>
        <span style={{fontSize:14,fontWeight:800,color:'#16a34a'}}>{fmt(insRec)}</span>
      </div>
    </div>}
  </>)
}

/*  INSURANCE REPORT  */
const InsuranceReport=({db,actions})=>{
  const [filter,setFilter]=useState('all')
  
  // Get all IP patients with insurance
  const insPatients=db.ip_patients.filter(p=>p.insurance_type&&p.insurance_type.trim())
  
  // Calculate totals per patient
  const insData=insPatients.map(p=>{
    const insPayments=(p.payments||[]).filter(py=>py.mode==='insurance')
    const cashPayments=(p.payments||[]).filter(py=>py.mode!=='insurance')
    const insReceived=insPayments.reduce((a,py)=>a+(py.amount||0),0)
    const cashReceived=cashPayments.reduce((a,py)=>a+(py.amount||0),0)
    const totalIncome=db.income.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+(e.amount||0),0)
    const totalPaid=insReceived+cashReceived
    const expectedFromIns=p.insurance_expected||0
    const insPending=Math.max(expectedFromIns-insReceived,0)
    const patientCopay=Math.max(totalIncome-expectedFromIns,0)
    const copayPending=Math.max(patientCopay-cashReceived,0)
    const status=p.insurance_status||'pending'
    return{p,insReceived,cashReceived,totalIncome,totalPaid,expectedFromIns,insPending,patientCopay,copayPending,status,insPayments}
  })
  
  const filtered=filter==='all'?insData:insData.filter(d=>d.status===filter)
  
  // Summary stats
  const totalExpected=insData.reduce((a,d)=>a+d.expectedFromIns,0)
  const totalInsReceived=insData.reduce((a,d)=>a+d.insReceived,0)
  const totalInsPending=insData.reduce((a,d)=>a+d.insPending,0)
  const totalCopayPending=insData.reduce((a,d)=>a+d.copayPending,0)
  const pendingApprovals=insData.filter(d=>d.status==='pending').length
  const rejected=insData.filter(d=>d.status==='rejected').length

  return(<>
    {/* Summary cards */}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
      {[
        {l:'Total expected from insurance',v:fmt(totalExpected),c:'#2563eb',bg:'#eff6ff'},
        {l:'Received from insurance',v:fmt(totalInsReceived),c:'#16a34a',bg:'#f0fdf4'},
        {l:'Pending from insurance',v:fmt(totalInsPending),c:'#d97706',bg:'#fffbeb'},
        {l:'Co-pay pending from patients',v:fmt(totalCopayPending),c:'#dc2626',bg:'#fef2f2'},
      ].map((m,i)=>(<div key={i} style={{background:m.bg,borderRadius:12,padding:'12px'}}>
        <div style={{fontSize:10,color:m.c,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>{m.l}</div>
        <div style={{fontSize:20,fontWeight:800,color:m.c}}>{m.v}</div>
      </div>))}
    </div>
    
    {/* Alert row */}
    {(pendingApprovals>0||rejected>0)&&<div style={{display:'flex',gap:8,marginBottom:16}}>
      {pendingApprovals>0&&<div style={{flex:1,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:'8px 12px',fontSize:12}}>
        <span style={{fontWeight:700,color:'#d97706'}}>⏳ {pendingApprovals} pending approval{pendingApprovals>1?'s':''}</span>
        <div style={{color:'#92400e',marginTop:2}}>Follow up with TPA/insurer</div>
      </div>}
      {rejected>0&&<div style={{flex:1,background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'8px 12px',fontSize:12}}>
        <span style={{fontWeight:700,color:'#dc2626'}}>❌ {rejected} rejected claim{rejected>1?'s':''}</span>
        <div style={{color:'#991b1b',marginTop:2}}>Review and resubmit</div>
      </div>}
    </div>}
    
    {/* Filter */}
    <div style={{display:'flex',gap:6,marginBottom:14,flexWrap:'wrap'}}>
      {[{k:'all',l:'All'},{k:'pending',l:'Pending'},{k:'approved',l:'Approved'},{k:'rejected',l:'Rejected'}].map(f=>(
        <button key={f.k} onClick={()=>setFilter(f.k)} style={{padding:'5px 14px',borderRadius:20,border:'none',
          background:filter===f.k?'#16a34a':'#f1f5f9',color:filter===f.k?'#fff':'#64748b',fontSize:12,fontWeight:600,cursor:'pointer'}}>{f.l}</button>
      ))}
    </div>
    
    {/* Patient list */}
    {filtered.length===0&&<div style={{textAlign:'center',padding:'40px 0',color:'#ccc',fontSize:13}}>No insurance patients found</div>}
    {filtered.map(({p,insReceived,totalIncome,expectedFromIns,insPending,patientCopay,copayPending,status})=>(
      <div key={p.id} style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:14,padding:'14px',marginBottom:12,boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>{p.name}</div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{p.insurance_type}{p.insurance_policy_no?' — '+p.insurance_policy_no:''}</div>
            <div style={{fontSize:11,color:'#94a3b8'}}>Admitted: {fmtD(p.admission_date)}{p.discharge_date?' | Discharged: '+fmtD(p.discharge_date):' | Active'}</div>
          </div>
          <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:700,flexShrink:0,
            background:status==='approved'?'#f0fdf4':status==='rejected'?'#fef2f2':'#fffbeb',
            color:status==='approved'?'#16a34a':status==='rejected'?'#dc2626':'#d97706'
          }}>{status==='approved'?'Approved':status==='rejected'?'Rejected':'Pending'}</span>
        </div>
        
        {/* Bill breakdown */}
        <div style={{background:'#f8fafc',borderRadius:10,padding:'10px 12px',fontSize:12}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:8}}>
            <div><div style={{color:'#94a3b8',marginBottom:2}}>Total bill</div><div style={{fontWeight:700,color:'#0f172a',fontSize:14}}>{fmt(totalIncome)}</div></div>
            <div><div style={{color:'#94a3b8',marginBottom:2}}>Insurance pays</div><div style={{fontWeight:700,color:'#2563eb',fontSize:14}}>{fmt(expectedFromIns)}</div></div>
            <div><div style={{color:'#94a3b8',marginBottom:2}}>Patient co-pay</div><div style={{fontWeight:700,color:'#7c3aed',fontSize:14}}>{fmt(patientCopay)}</div></div>
          </div>
          <div style={{borderTop:'1px solid #e2e8f0',paddingTop:8,display:'flex',flexDirection:'column',gap:4}}>
            <div style={{display:'flex',justifyContent:'space-between'}}>
              <span style={{color:'#94a3b8'}}>Insurance received</span>
              <span style={{fontWeight:600,color:'#16a34a'}}>{fmt(insReceived)}</span>
            </div>
            {insPending>0&&<div style={{display:'flex',justifyContent:'space-between'}}>
              <span style={{color:'#d97706',fontWeight:600}}>Insurance pending</span>
              <span style={{fontWeight:700,color:'#d97706'}}>{fmt(insPending)}</span>
            </div>}
            {copayPending>0&&<div style={{display:'flex',justifyContent:'space-between'}}>
              <span style={{color:'#dc2626',fontWeight:600}}>Co-pay pending from patient</span>
              <span style={{fontWeight:700,color:'#dc2626'}}>{fmt(copayPending)}</span>
            </div>}
            {insPending===0&&copayPending===0&&<div style={{textAlign:'center',color:'#16a34a',fontWeight:700,fontSize:13}}>✓ Fully settled</div>}
          </div>
        </div>
      </div>
    ))}
  </>)
}

/*  INSURANCE MAIN TAB  */
const InsuranceMainTab=({db,setDb,gotoIP,hospital})=>{
  const [filter,setFilter]=useState('active')
  const [selPat,setSelPat]=useState(null)
  const [status,setStatus]=useState('')
  const [newApproved,setNewApproved]=useState('')
  const [insPayAmt,setInsPayAmt]=useState('')
  const [insPayDate,setInsPayDate]=useState(todayStr())
  const [insPayNote,setInsPayNote]=useState('')
  const [busy,setBusy]=useState(false)
  const [saved,setSaved]=useState(false)

  // All IP patients with insurance
  const allInsPats=db.ip_patients.filter(p=>p.insurance_type&&p.insurance_type.trim())
  const filtered=filter==='active'?allInsPats.filter(p=>!p.discharge_date):
    filter==='discharged'?allInsPats.filter(p=>p.discharge_date):allInsPats

  // Summary stats
  const totalExpected=allInsPats.reduce((a,p)=>a+(p.insurance_expected||0),0)
  const totalInsRec=allInsPats.reduce((a,p)=>a+(p.payments||[]).filter(py=>py.mode==='insurance').reduce((s,py)=>s+(py.amount||0),0),0)
  const totalInsPend=Math.max(totalExpected-totalInsRec,0)
  const pendingApprovals=allInsPats.filter(p=>p.insurance_status==='pending'||!p.insurance_status).length

  const openPat=(p)=>{
    setSelPat(p)
    setStatus(p.insurance_status||'pending')
    setNewApproved(String(p.insurance_expected||0))
    setInsPayAmt('')
    setInsPayNote('')
    setInsPayDate(todayStr())
  }

  const saveStatus=async()=>{
    if(!selPat)return
    setBusy(true)
    const approved=parseFloat(newApproved)||0
    const {error}=await supabase.from('ip_patients').update({
      insurance_status:status,
      insurance_expected:approved
    }).eq('id',selPat.id)
    if(error){alert('Update failed: '+error.message);setBusy(false);return}
    setDb(d=>({...d,ip_patients:d.ip_patients.map(p=>p.id===selPat.id?{...p,insurance_status:status,insurance_expected:approved}:p)}))
    setSelPat(p=>({...p,insurance_status:status,insurance_expected:approved}))
    setSaved(true);setTimeout(()=>setSaved(false),2000)
    setBusy(false)
  }

  const addPayment=async()=>{
    if(!selPat||!insPayAmt||parseFloat(insPayAmt)<=0){alert('Enter amount');return}
    setBusy(true)
    const amt=parseFloat(insPayAmt)
    const newPmt={id:uid(),date:insPayDate,amount:amt,mode:'insurance',note:insPayNote||'Insurance payment received'}
    const newPayments=[...(selPat.payments||[]),newPmt]
    const {error}=await supabase.from('ip_patients').update({payments:newPayments}).eq('id',selPat.id)
    if(error){alert('Failed: '+error.message);setBusy(false);return}
    setDb(d=>({...d,
      ip_patients:d.ip_patients.map(p=>p.id===selPat.id?{...p,payments:newPayments}:p)
    }))
    setSelPat(p=>({...p,payments:newPayments}))
    setInsPayAmt('');setInsPayNote('')
    setBusy(false)
  }

  // Patient detail panel
  if(selPat){
    const p=db.ip_patients.find(x=>x.id===selPat.id)||selPat
    const totalBill=db.income.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+(e.amount||0),0)
    const bills=db.income.filter(e=>e.patient_id===p.id)
    const approved=parseFloat(newApproved)||p.insurance_expected||0
    const insPayments=(p.payments||[]).filter(py=>py.mode==='insurance')
    const insRec=insPayments.reduce((a,py)=>a+(py.amount||0),0)
    const insPend=Math.max(approved-insRec,0)
    const copay=Math.max(totalBill-approved,0)
    const cashRec=(p.payments||[]).filter(py=>py.mode!=='insurance').reduce((a,py)=>a+(py.amount||0),0)
    const copayPend=Math.max(copay-cashRec,0)

    return(<div style={{background:'#f8fafc',minHeight:'100vh'}}>
      <div style={{background:'#0f172a',padding:'14px 16px',display:'flex',alignItems:'center',gap:10,position:'sticky',top:0,zIndex:10}}>
        <button onClick={()=>setSelPat(null)} style={{color:'#94a3b8',background:'none',border:'1px solid #374151',borderRadius:8,padding:'5px 10px',fontSize:12,cursor:'pointer'}}>← Back</button>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:'#fff'}}>{p.name}</div>
          <div style={{fontSize:11,color:'#64748b'}}>{p.insurance_type}{p.insurance_policy_no?' — '+p.insurance_policy_no:''}</div>
        </div>
        <button onClick={()=>gotoIP&&gotoIP(p.id)} style={{fontSize:11,color:'#60a5fa',background:'none',border:'1px solid #374151',borderRadius:8,padding:'5px 10px',cursor:'pointer'}}>View IP →</button>
      </div>
      <div style={{padding:'16px'}}>

        {/* Bill summary */}
        <div style={{background:'linear-gradient(135deg,#1e3a5f,#1d4ed8)',borderRadius:16,padding:'16px',marginBottom:16}}>
          <div style={{fontSize:11,color:'rgba(255,255,255,0.5)',marginBottom:10}}>Admitted: {fmtD(p.admission_date)}{p.discharge_date?' | Discharged: '+fmtD(p.discharge_date):' | Active'}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
            <div style={{textAlign:'center',background:'rgba(255,255,255,0.1)',borderRadius:10,padding:'10px 6px'}}>
              <div style={{fontSize:9,color:'rgba(255,255,255,0.5)',fontWeight:700,marginBottom:4}}>TOTAL BILL</div>
              <div style={{fontSize:16,fontWeight:800,color:'#fff'}}>{fmt(totalBill)}</div>
            </div>
            <div style={{textAlign:'center',background:'rgba(255,255,255,0.1)',borderRadius:10,padding:'10px 6px'}}>
              <div style={{fontSize:9,color:'rgba(255,255,255,0.5)',fontWeight:700,marginBottom:4}}>INS APPROVED</div>
              <div style={{fontSize:16,fontWeight:800,color:'#60a5fa'}}>{fmt(approved)}</div>
            </div>
            <div style={{textAlign:'center',background:'rgba(255,255,255,0.1)',borderRadius:10,padding:'10px 6px'}}>
              <div style={{fontSize:9,color:'rgba(255,255,255,0.5)',fontWeight:700,marginBottom:4}}>CO-PAY</div>
              <div style={{fontSize:16,fontWeight:800,color:'#a78bfa'}}>{fmt(copay)}</div>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:4,fontSize:12}}>
            <div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'rgba(255,255,255,0.5)'}}>Insurance received</span><span style={{color:'#4ade80',fontWeight:700}}>{fmt(insRec)}</span></div>
            {insPend>0&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#fbbf24',fontWeight:600}}>Insurance pending</span><span style={{color:'#fbbf24',fontWeight:700}}>{fmt(insPend)}</span></div>}
            {copayPend>0&&<div style={{display:'flex',justifyContent:'space-between'}}><span style={{color:'#f87171',fontWeight:600}}>Co-pay pending</span><span style={{color:'#f87171',fontWeight:700}}>{fmt(copayPend)}</span></div>}
            {insPend===0&&copayPend===0&&totalBill>0&&<div style={{textAlign:'center',color:'#4ade80',fontWeight:700}}>✅ Fully settled</div>}
          </div>
        </div>

        {/* Bills breakdown */}
        {bills.length>0&&<div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:14,padding:'14px',marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:'#0f172a',marginBottom:10}}>Bills added</div>
          {bills.map((e,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'7px 0',borderBottom:'1px solid #f5f5f5'}}>
            <div><div style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={e.type}/><span style={{fontSize:12,color:'#555'}}>{fmtD(e.date)}</span></div>
              {e.notes&&<div style={{fontSize:10,color:'#aaa',marginTop:1}}>{e.notes}</div>}
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:13,fontWeight:700,color:'#0f172a'}}>{fmt(e.amount)}</div>
              <div style={{fontSize:10,color:e.payment==='insurance'?'#2563eb':e.payment==='credit'?'#dc2626':'#94a3b8'}}>{e.payment}</div>
            </div>
          </div>))}
          <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'2px solid #111',fontWeight:800,fontSize:13}}>
            <span>Total billed</span><span style={{color:'#0f172a'}}>{fmt(totalBill)}</span>
          </div>
        </div>}

        {/* Update approval */}
        <div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:14,padding:'14px',marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:'#0f172a',marginBottom:12}}>Update insurance approval</div>
          <FSel label="Status" value={status} onChange={e=>setStatus(e.target.value)}>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </FSel>
          <FInp label="Total approved amount (Rs)" type="number" value={newApproved} onChange={e=>setNewApproved(e.target.value)} placeholder="e.g. 25000"/>
          {parseFloat(newApproved)>0&&<div style={{background:'#eff6ff',borderRadius:8,padding:'8px 10px',fontSize:12,color:'#1e40af',marginBottom:8}}>
            Approved: {fmt(parseFloat(newApproved))} — Patient co-pay: {fmt(Math.max(totalBill-parseFloat(newApproved),0))}
          </div>}
          <GBtn onClick={saveStatus} disabled={busy}>{busy?'Saving...':saved?'✓ Saved':'Save approval'}</GBtn>
        </div>

        {/* Record insurance payment */}
        <div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:14,padding:'14px',marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,color:'#0f172a',marginBottom:12}}>Record insurance payment received</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <FInp label="Amount (Rs)" type="number" value={insPayAmt} onChange={e=>setInsPayAmt(e.target.value)} placeholder="0"/>
            <FInp label="Date" type="date" value={insPayDate} onChange={e=>setInsPayDate(e.target.value)}/>
          </div>
          <FInp label="Note" type="text" value={insPayNote} onChange={e=>setInsPayNote(e.target.value)} placeholder="e.g. Pre-auth 1, Final settlement"/>
          {insPayAmt&&insPend>0&&<div style={{fontSize:11,color:'#d97706',marginBottom:8}}>After this: insurance pending = {fmt(Math.max(insPend-parseFloat(insPayAmt||0),0))}</div>}
          <GBtn onClick={addPayment} disabled={busy}>{busy?'Saving...':'Record payment'}</GBtn>
        </div>

        {/* Payment history */}
        {insPayments.length>0&&<div style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:14,padding:'14px'}}>
          <div style={{fontSize:13,fontWeight:700,color:'#0f172a',marginBottom:10}}>Insurance payment history</div>
          {insPayments.map((py,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #f5f5f5'}}>
            <div><div style={{fontSize:13,fontWeight:600}}>{py.note||'Insurance payment'}</div>
              <div style={{fontSize:11,color:'#94a3b8'}}>{fmtD(py.date)}</div>
            </div>
            <div style={{fontSize:14,fontWeight:700,color:'#16a34a'}}>{fmt(py.amount)}</div>
          </div>))}
          <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #e5e7eb',fontWeight:700,fontSize:13}}>
            <span>Total received</span><span style={{color:'#16a34a'}}>{fmt(insRec)}</span>
          </div>
        </div>}
      </div>
    </div>)
  }

  // Patient list view
  return(<>
    {/* Summary */}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:16}}>
      {[
        {l:'Total insurance expected',v:fmt(totalExpected),c:'#2563eb',bg:'#eff6ff'},
        {l:'Insurance received',v:fmt(totalInsRec),c:'#16a34a',bg:'#f0fdf4'},
        {l:'Insurance pending',v:fmt(totalInsPend),c:'#d97706',bg:'#fffbeb'},
        {l:'Pending approvals',v:pendingApprovals+' patients',c:'#dc2626',bg:'#fef2f2'},
      ].map((m,i)=>(<div key={i} style={{background:m.bg,borderRadius:12,padding:'12px'}}>
        <div style={{fontSize:10,color:m.c,fontWeight:700,textTransform:'uppercase',marginBottom:4}}>{m.l}</div>
        <div style={{fontSize:18,fontWeight:800,color:m.c}}>{m.v}</div>
      </div>))}
    </div>

    {/* Filter */}
    <div style={{display:'flex',gap:6,marginBottom:14}}>
      {[{k:'active',l:'Active'},{k:'discharged',l:'Discharged'},{k:'all',l:'All'}].map(f=>(
        <button key={f.k} onClick={()=>setFilter(f.k)} style={{padding:'6px 16px',borderRadius:20,border:'none',
          background:filter===f.k?'#1d4ed8':'#f1f5f9',color:filter===f.k?'#fff':'#64748b',fontSize:12,fontWeight:700,cursor:'pointer'}}>{f.l}</button>
      ))}
    </div>

    {filtered.length===0&&<div style={{textAlign:'center',padding:'40px 0',color:'#ccc',fontSize:13}}>No insurance patients found. Admit a patient under Insurance to get started.</div>}
    {filtered.map(p=>{
      const totalBill=db.income.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+(e.amount||0),0)
      const insRec=(p.payments||[]).filter(py=>py.mode==='insurance').reduce((a,py)=>a+(py.amount||0),0)
      const insPend=Math.max((p.insurance_expected||0)-insRec,0)
      const copay=Math.max(totalBill-(p.insurance_expected||0),0)
      const cashRec=(p.payments||[]).filter(py=>py.mode!=='insurance').reduce((a,py)=>a+(py.amount||0),0)
      const copayPend=Math.max(copay-cashRec,0)
      const st=p.insurance_status||'pending'
      return(<div key={p.id} onClick={()=>openPat(p)} style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:14,padding:'14px',marginBottom:10,cursor:'pointer',boxShadow:'0 1px 4px rgba(0,0,0,0.04)'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:'#0f172a'}}>{p.name}</div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{p.insurance_type}</div>
            {p.insurance_policy_no&&<div style={{fontSize:11,color:'#94a3b8'}}>{p.insurance_policy_no}</div>}
            <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{fmtD(p.admission_date)}{p.discharge_date?' → '+fmtD(p.discharge_date):<span style={{color:'#16a34a',fontWeight:600}}> Active</span>}</div>
          </div>
          <span style={{fontSize:11,padding:'3px 10px',borderRadius:20,fontWeight:700,flexShrink:0,
            background:st==='approved'?'#f0fdf4':st==='rejected'?'#fef2f2':'#fffbeb',
            color:st==='approved'?'#16a34a':st==='rejected'?'#dc2626':'#d97706'
          }}>{st==='approved'?'Approved':st==='rejected'?'Rejected':'Pending'}</span>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6}}>
          <div style={{textAlign:'center',background:'#f8fafc',borderRadius:8,padding:'6px'}}>
            <div style={{fontSize:9,color:'#94a3b8',fontWeight:700}}>BILL</div>
            <div style={{fontSize:13,fontWeight:800,color:'#0f172a'}}>{fmt(totalBill)}</div>
          </div>
          <div style={{textAlign:'center',background:'#eff6ff',borderRadius:8,padding:'6px'}}>
            <div style={{fontSize:9,color:'#2563eb',fontWeight:700}}>APPROVED</div>
            <div style={{fontSize:13,fontWeight:800,color:'#2563eb'}}>{fmt(p.insurance_expected||0)}</div>
          </div>
          <div style={{textAlign:'center',background:copayPend>0||insPend>0?'#fef2f2':'#f0fdf4',borderRadius:8,padding:'6px'}}>
            <div style={{fontSize:9,color:copayPend>0||insPend>0?'#dc2626':'#16a34a',fontWeight:700}}>{copayPend>0||insPend>0?'PENDING':'SETTLED'}</div>
            <div style={{fontSize:13,fontWeight:800,color:copayPend>0||insPend>0?'#dc2626':'#16a34a'}}>{copayPend>0||insPend>0?fmt(insPend+copayPend):'✓'}</div>
          </div>
        </div>
      </div>)
    })}
  </>)
}

/*  IP BILLING MODULE  */
const toWords=n=>{
  const a=['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen']
  const b=['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety']
  if(!n||n===0)return'Zero'
  const t=Math.floor(n)
  if(t>=10000000)return toWords(Math.floor(t/10000000))+' Crore '+(t%10000000?toWords(t%10000000):'')
  if(t>=100000)return toWords(Math.floor(t/100000))+' Lakh '+(t%100000?toWords(t%100000):'')
  if(t>=1000)return toWords(Math.floor(t/1000))+' Thousand '+(t%1000?toWords(t%1000):'')
  if(t>=100)return toWords(Math.floor(t/100))+' Hundred '+(t%100?toWords(t%100):'')
  if(t>=20)return b[Math.floor(t/10)]+(t%10?' '+a[t%10]:'')
  return a[t]
}

const AutoInput=({value,onChange,placeholder,suggestions,style})=>{
  const [show,setShow]=useState(false)
  const filtered=value.length>=3?suggestions.filter(s=>s.toLowerCase().includes(value.toLowerCase())).slice(0,6):[]
  return(<div style={{position:'relative'}}>
    <input value={value} onChange={e=>{onChange(e.target.value);setShow(true)}} onBlur={()=>setTimeout(()=>setShow(false),200)} placeholder={placeholder} style={{width:'100%',padding:'8px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:13,outline:'none',...(style||{})}}/>
    {show&&filtered.length>0&&<div style={{position:'absolute',top:'100%',left:0,right:0,background:'#fff',border:'1px solid #e2e8f0',borderRadius:8,zIndex:99,boxShadow:'0 4px 12px rgba(0,0,0,0.1)'}}>
      {filtered.map((s,i)=>(<div key={i} onMouseDown={()=>{onChange(s);setShow(false)}} style={{padding:'8px 12px',cursor:'pointer',fontSize:13,borderBottom:'1px solid #f5f5f5'}}>{s}</div>))}
    </div>}
  </div>)
}

const IPBillingModule=({p,db,onClose,hospital})=>{
  const [view,setView]=useState('bill')
  const [printMode,setPrintMode]=useState(false)
  const [savedItems,setSavedItems]=useState({medicine:[],lab:[],service:[]})
  const [receipts,setReceipts]=useState([])
  const [loadingReceipts,setLoadingReceipts]=useState(true)
  const [savingReceipt,setSavingReceipt]=useState(false)
  const [newReceipt,setNewReceipt]=useState({amount:'',mode:'cash',date:todayStr(),notes:''})
  const [dischargeText,setDischargeText]=useState('')
  const [advance,setAdvance]=useState('')
  const [discount,setDiscount]=useState('')
  const [printReceipt,setPrintReceipt]=useState(null)
  const hospId=hospital?.id||p.hospital_id
  const hospName=hospital?.name||'Hospital'

  // Main bill sections matching the format
  const [consultations,setConsultations]=useState([{doctor:'Dr. '+p.ref_doctor||'',qty:'',rate:''}])
  const [roomCharges,setRoomCharges]=useState([
    {name:'Room / Bed charges',qty:'',rate:''},
    {name:'Observation and Nursing charges',qty:'',rate:''},
    {name:'Monitor charges',qty:'',rate:''},
    {name:'Consumables',qty:'',rate:''},
  ])
  const [otherCharges,setOtherCharges]=useState([{name:'',qty:'',rate:''}])

  // Pharmacy - date-wise entries
  const [pharmaDays,setPharmaDays]=useState([{billNo:'',date:todayStr(),items:[{name:'',qty:'',amount:''}]}])

  // Lab tests
  const [labTests,setLabTests]=useState([{name:'',qty:'1',rate:'',amount:''}])

  const [billId,setBillId]=useState(null)
  const [billSaving,setBillSaving]=useState(false)
  const [billSaved,setBillSaved]=useState(false)
  const [editMode,setEditMode]=useState(false)

  // Load saved bill and autocomplete items
  useEffect(()=>{
    if(!hospId)return
    // Load saved items for autocomplete
    supabase.from('saved_items').select('*').eq('hospital_id',hospId).then(({data})=>{
      if(data)setSavedItems({
        medicine:data.filter(x=>x.category==='medicine').map(x=>x.name),
        lab:data.filter(x=>x.category==='lab').map(x=>x.name),
        service:data.filter(x=>x.category==='service').map(x=>x.name)
      })
    })
    // Load receipts
    supabase.from('ip_receipts').select('*').eq('patient_id',p.id).order('created_at',{ascending:false}).then(({data})=>{
      setReceipts(data||[]);setLoadingReceipts(false)
    })
    // Load existing bill for this patient
    supabase.from('ip_bills').select('*').eq('patient_id',p.id).order('created_at',{ascending:false}).limit(1).then(({data})=>{
      if(data&&data.length>0){
        const bill=data[0]
        setBillId(bill.id)
        const items=bill.items||{}
        if(items.consultations)setConsultations(items.consultations)
        if(items.roomCharges)setRoomCharges(items.roomCharges)
        if(items.otherCharges)setOtherCharges(items.otherCharges)
        if(items.pharmaDays)setPharmaDays(items.pharmaDays)
        if(items.labTests)setLabTests(items.labTests)
        if(items.advance)setAdvance(items.advance)
        if(items.discount)setDiscount(items.discount)
        setBillSaved(true)
      }
    })
  },[hospId])

  const saveBill=async()=>{
    setBillSaving(true)
    const items={consultations,roomCharges,otherCharges,pharmaDays,labTests,advance,discount}
    const billData={hospital_id:hospId,patient_id:p.id,bill_date:todayStr(),total:grandTotal,items,status:'draft'}
    if(billId){
      await supabase.from('ip_bills').update(billData).eq('id',billId)
    } else {
      const {data}=await supabase.from('ip_bills').insert(billData).select().single()
      if(data)setBillId(data.id)
    }
    setBillSaved(true)
    setEditMode(false)
    setBillSaving(false)
  }

  const saveItem=async(cat,name)=>{
    if(!name||name.length<2)return
    if(savedItems[cat]?.includes(name))return
    await supabase.from('saved_items').upsert({hospital_id:hospId,category:cat,name},{onConflict:'hospital_id,category,name'})
    setSavedItems(prev=>({...prev,[cat]:[...(prev[cat]||[]),name]}))
  }

  const addReceipt=async()=>{
    if(!newReceipt.amount||parseFloat(newReceipt.amount)<=0){alert('Enter amount');return}
    setSavingReceipt(true)
    const rNo='RCP-'+Date.now().toString().slice(-6)
    const rec={hospital_id:hospId,patient_id:p.id,receipt_no:rNo,receipt_date:newReceipt.date,amount:parseFloat(newReceipt.amount),mode:newReceipt.mode,notes:newReceipt.notes}
    const {data,error}=await supabase.from('ip_receipts').insert(rec).select().single()
    if(error){alert('Failed: '+error.message);setSavingReceipt(false);return}
    setReceipts(prev=>[data,...prev])
    setNewReceipt({amount:'',mode:'cash',date:todayStr(),notes:''})
    setSavingReceipt(false)
  }

  // Totals
  const pharmaTotal=pharmaDays.reduce((a,day)=>a+day.items.reduce((b,i)=>b+(parseFloat(i.amount)||0),0),0)
  const labTotal=labTests.reduce((a,i)=>a+(parseFloat(i.qty)||1)*(parseFloat(i.rate)||parseFloat(i.amount)||0),0)
  const consultTotal=consultations.reduce((a,i)=>a+(parseFloat(i.qty)||0)*(parseFloat(i.rate)||0),0)
  const roomTotal=roomCharges.reduce((a,i)=>a+(parseFloat(i.qty)||0)*(parseFloat(i.rate)||0),0)
  const otherTotal=otherCharges.reduce((a,i)=>a+(parseFloat(i.qty)||1)*(parseFloat(i.rate)||0),0)
  const grandTotal=pharmaTotal+labTotal+consultTotal+roomTotal+otherTotal
  const advAmt=parseFloat(advance)||0
  const discAmt=parseFloat(discount)||0
  const finalAmt=grandTotal-advAmt-discAmt
  const insApproved=p.insurance_expected||0

  const td=(txt,opts={})=>(<td style={{border:'1px solid #ccc',padding:'4px 7px',fontSize:12,...(opts.style||{})}}>{txt}</td>)
  const th=(txt,opts={})=>(<th style={{border:'1px solid #ccc',padding:'5px 7px',fontSize:12,background:'#f5f5f5',textAlign:opts.right?'right':'left',...(opts.style||{})}}>{txt}</th>)

  // ── PRINT VIEW ──
  const PatientRow=()=>(<table style={{width:'100%',borderCollapse:'collapse',marginBottom:8,fontSize:12}}>
    <thead><tr><th style={{border:'1px solid #ccc',padding:'4px 7px',textAlign:'left'}}>Name</th><th style={{border:'1px solid #ccc',padding:'4px 7px',textAlign:'left'}}>ID</th><th style={{border:'1px solid #ccc',padding:'4px 7px',textAlign:'left'}}>Age</th><th style={{border:'1px solid #ccc',padding:'4px 7px',textAlign:'left'}}>Gender</th><th style={{border:'1px solid #ccc',padding:'4px 7px',textAlign:'left'}}>Mobile</th></tr></thead>
    <tbody><tr>
      {td(p.name.toUpperCase())}
      {td(p.reg_no||'—')}
      {td(p.age||'—')}
      {td(p.gender||'—')}
      {td(p.phone||'—')}
    </tr></tbody>
  </table>)

  const pageStyle=`
    @page {
      size: A4 portrait;
      margin: 10mm 10mm 10mm 10mm;
    }
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .no-print { display: none !important; }
      .app-header { display: none !important; }
      .app-wrapper { max-width: 100% !important; }
      html, body { width: 100%; margin: 0 !important; padding: 0 !important; background: #fff !important; }
      .print-container { padding-top: 0 !important; }
      .page {
        width: 100%;
        padding: 6mm 6mm;
        margin: 0;
        page-break-after: always;
        border: none !important;
        box-shadow: none !important;
        min-height: auto;
      }
      table { page-break-inside: auto; }
      tr { page-break-inside: avoid; page-break-after: auto; }
    }
    .page {
      width: 176mm;
      min-height: 257mm;
      padding: 6mm 8mm;
      box-sizing: border-box;
      font-family: Arial, sans-serif;
      font-size: 10pt;
      color: #000;
      margin: 0 auto 20px auto;
      background: #fff;
      border: 1px solid #ddd;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }
    table { border-collapse: collapse; width: 100%; margin-bottom: 6px; }
    td, th { border: 0.5px solid #888; padding: 3px 5px; font-size: 9pt; line-height: 1.3; }
    th { background: #f0f0f0; font-weight: 700; text-align: left; }
    .section-head td { font-weight: 700; background: #e0e0e0; font-size: 9pt; letter-spacing: 0.5px; }
    .total-row td { font-weight: 700; background: #f5f5f5; }
    .grand-total td { font-weight: 700; font-size: 11pt; border: 1.5px solid #000; }
  `

  const BillPrint=()=>(<>
    {/* PAGE 1 - MAIN BILL */}
    <div className="page">
      {/* Title - no letterhead, just title */}
      <div style={{textAlign:'center',fontSize:'16pt',fontWeight:700,marginBottom:8,borderBottom:'2px solid #000',paddingBottom:6}}>IP Bill Cum Receipt</div>
      <div style={{display:'flex',justifyContent:'space-between',marginBottom:6,fontSize:'10pt'}}>
        <div>
          <div><b>Consultant:</b> {consultations[0]?.doctor||p.ref_doctor||'—'}</div>
          <div><b>D.O.A:</b> {fmtD(p.admission_date)}{p.admission_time?' '+p.admission_time:''}</div>
          {p.discharge_date&&<div><b>D.O.D:</b> {fmtD(p.discharge_date)}{p.discharge_time?' '+p.discharge_time:''}</div>}
        </div>
        <div style={{textAlign:'right'}}>
          <div><b>Bill No:</b> {p.reg_no||'—'}/{todayStr().replace(/-/g,'').slice(2)}</div>
          <div><b>Date:</b> {fmtD(todayStr())}</div>
          {p.insurance_type&&<div><b>Insurance:</b> {p.insurance_type}</div>}
        </div>
      </div>
      {/* Patient table */}
      <table style={{marginBottom:8}}>
        <thead><tr><th>Name</th><th>ID / Reg No</th><th>Phone</th><th>Room</th><th>Payment</th></tr></thead>
        <tbody><tr><td><b>{p.name}</b></td><td>{p.reg_no||'—'}</td><td>{p.phone||'—'}</td><td>{p.room||'—'}</td><td>{p.insurance_type?'Insurance':'Cash'}</td></tr></tbody>
      </table>
      {p.diagnosis&&<div style={{marginBottom:6,fontSize:'10pt'}}><b>Diagnosis:</b> {p.diagnosis}</div>}
      
      {/* Main bill table */}
      <table style={{marginBottom:8}}>
        <thead><tr><th style={{width:'55%'}}>Particulars</th><th style={{textAlign:'right',width:'10%'}}>Qty</th><th style={{textAlign:'right',width:'17%'}}>Rate</th><th style={{textAlign:'right',width:'18%'}}>Amount</th></tr></thead>
        <tbody>
          {/* Medicines */}
          {pharmaTotal>0&&<>
            <tr className="section-head"><td colSpan={4}>MEDICINES</td></tr>
            {pharmaDays.filter(d=>d.items.some(i=>i.name)).map((day,di)=>{
              const dayTotal=day.items.reduce((a,i)=>a+(parseFloat(i.amount)||0),0)
              return(<tr key={di}><td style={{paddingLeft:16}}>{day.billNo||('Day '+(di+1))} — {fmtD(day.date)}</td><td></td><td></td><td style={{textAlign:'right'}}>{fmt(dayTotal)}</td></tr>)
            })}
            <tr className="total-row"><td colSpan={3} style={{textAlign:'right'}}>Medicines Total</td><td style={{textAlign:'right'}}>{fmt(pharmaTotal)}</td></tr>
          </>}
          {/* Investigation */}
          {labTotal>0&&<>
            <tr className="section-head"><td colSpan={4}>INVESTIGATION CHARGES</td></tr>
            {labTests.filter(i=>i.name).map((i,idx)=>{const amt=(parseFloat(i.qty)||1)*(parseFloat(i.rate)||0);return(<tr key={idx}><td style={{paddingLeft:16}}>{i.name}</td><td style={{textAlign:'right'}}>{i.qty||1}</td><td style={{textAlign:'right'}}>{fmt(parseFloat(i.rate)||0)}</td><td style={{textAlign:'right'}}>{fmt(amt)}</td></tr>)})}
            <tr className="total-row"><td colSpan={3} style={{textAlign:'right'}}>Investigation Total</td><td style={{textAlign:'right'}}>{fmt(labTotal)}</td></tr>
          </>}
          {/* Consultation */}
          {consultTotal>0&&<>
            <tr className="section-head"><td colSpan={4}>CONSULTATION</td></tr>
            {consultations.filter(i=>i.doctor&&parseFloat(i.qty)&&parseFloat(i.rate)).map((i,idx)=><tr key={idx}><td style={{paddingLeft:16}}>Consultation ({i.doctor})</td><td style={{textAlign:'right'}}>{i.qty}</td><td style={{textAlign:'right'}}>{fmt(parseFloat(i.rate))}</td><td style={{textAlign:'right'}}>{fmt(parseFloat(i.qty)*parseFloat(i.rate))}</td></tr>)}
          </>}
          {/* Room charges */}
          {roomTotal>0&&<>
            {roomCharges.filter(i=>i.name&&parseFloat(i.qty)&&parseFloat(i.rate)).map((i,idx)=><tr key={idx}><td style={{fontWeight:600}}>{i.name}</td><td style={{textAlign:'right'}}>{i.qty}</td><td style={{textAlign:'right'}}>{fmt(parseFloat(i.rate))}</td><td style={{textAlign:'right'}}>{fmt(parseFloat(i.qty)*parseFloat(i.rate))}</td></tr>)}
          </>}
          {/* Others */}
          {otherTotal>0&&<>
            <tr className="section-head"><td colSpan={4}>OTHERS</td></tr>
            {otherCharges.filter(i=>i.name&&parseFloat(i.rate)).map((i,idx)=><tr key={idx}><td style={{paddingLeft:16}}>{i.name}</td><td style={{textAlign:'right'}}>{i.qty||1}</td><td style={{textAlign:'right'}}>{fmt(parseFloat(i.rate))}</td><td style={{textAlign:'right'}}>{fmt((parseFloat(i.qty)||1)*parseFloat(i.rate))}</td></tr>)}
          </>}
          {/* Grand total */}
          <tr className="grand-total"><td colSpan={3} style={{textAlign:'right',fontSize:'12pt'}}>Grand Total</td><td style={{textAlign:'right',fontSize:'12pt'}}>{fmt(grandTotal)}</td></tr>
          {/* Insurance */}
          {insApproved>0&&<>
            <tr><td colSpan={3} style={{textAlign:'right',color:'#1d4ed8'}}>Insurance Approved ({p.insurance_type})</td><td style={{textAlign:'right',color:'#1d4ed8'}}>- {fmt(insApproved)}</td></tr>
            <tr className="total-row"><td colSpan={3} style={{textAlign:'right'}}>Patient Co-pay</td><td style={{textAlign:'right'}}>{fmt(Math.max(grandTotal-insApproved,0))}</td></tr>
          </>}
          {/* Advance/discount */}
          {advAmt>0&&<tr><td colSpan={3} style={{textAlign:'right'}}>Advance Paid</td><td style={{textAlign:'right'}}>- {fmt(advAmt)}</td></tr>}
          {discAmt>0&&<tr><td colSpan={3} style={{textAlign:'right'}}>Discount</td><td style={{textAlign:'right'}}>- {fmt(discAmt)}</td></tr>}
          {(advAmt+discAmt)>0&&<tr className="grand-total"><td colSpan={3} style={{textAlign:'right'}}>Final Settlement</td><td style={{textAlign:'right'}}>{fmt(finalAmt)}</td></tr>}
        </tbody>
      </table>
      
      <div style={{fontSize:'9pt',marginBottom:12}}><b>Amount in words:</b> RUPEES {toWords(Math.floor(grandTotal)).toUpperCase()} ONLY</div>
      
      <div style={{display:'flex',justifyContent:'space-around',marginTop:20}}>
        <div style={{textAlign:'center',width:'35%'}}><div style={{borderTop:'1px solid #000',paddingTop:6,fontSize:'10pt'}}>Authorised Signatory</div></div>
        <div style={{textAlign:'center',width:'35%'}}><div style={{borderTop:'1px solid #000',paddingTop:6,fontSize:'10pt'}}>Cashier</div></div>
      </div>
    </div>

    {/* PAGE 2 - MEDICINES DATE-WISE */}
    {pharmaTotal>0&&<div className="page">
      <div style={{textAlign:'center',fontSize:'18pt',fontWeight:700,marginBottom:10,letterSpacing:3}}>MEDICINES</div>
      <table style={{marginBottom:6}}>
        <thead><tr><th>Name</th><th>Reg No</th><th>Phone</th><th>D.O.A</th><th>D.O.D</th></tr></thead>
        <tbody><tr><td><b>{p.name.toUpperCase()}</b></td><td>{p.reg_no||'—'}</td><td>{p.phone||'—'}</td><td>{fmtD(p.admission_date)}{p.admission_time?' '+p.admission_time:''}</td><td>{p.discharge_date?fmtD(p.discharge_date)+(p.discharge_time?' '+p.discharge_time:''):'Active'}</td></tr></tbody>
      </table>
      <table>
        <thead><tr><th style={{width:'10%'}}>Bill No</th><th style={{width:'10%'}}>Date</th><th style={{width:'40%'}}>Product</th><th style={{width:'12%'}}>Batch</th><th style={{width:'10%'}}>Expiry</th><th style={{textAlign:'right',width:'8%'}}>Qty</th><th style={{textAlign:'right',width:'10%'}}>Amount</th></tr></thead>
        <tbody>
          {pharmaDays.map((day,di)=>day.items.filter(i=>i.name).map((item,ii)=>(
            <tr key={di+'-'+ii}>
              <td style={{fontWeight:ii===0?700:400,color:ii===0?'#000':'#999'}}>{ii===0?(day.billNo||'Day '+(di+1)):''}</td>
              <td style={{fontWeight:ii===0?700:400,color:ii===0?'#000':'#999'}}>{ii===0?fmtD(day.date):''}</td>
              <td>{item.name}</td>
              <td>{item.batch||''}</td>
              <td>{item.expiry||''}</td>
              <td style={{textAlign:'right'}}>{item.qty||1}</td>
              <td style={{textAlign:'right'}}>{fmt(parseFloat(item.amount)||0)}</td>
            </tr>
          )))}
          <tr className="total-row"><td colSpan={6} style={{textAlign:'right',fontWeight:700}}>Total</td><td style={{textAlign:'right',fontWeight:700}}>{fmt(pharmaTotal)}</td></tr>
        </tbody>
      </table>
      <div style={{textAlign:'right',marginTop:20}}><div style={{display:'inline-block',borderTop:'1px solid #000',paddingTop:6,width:'35%',textAlign:'center',fontSize:'10pt'}}>Authorised Signature</div></div>
    </div>}

    {/* PAGE 3 - INVESTIGATION DATE-WISE */}
    {labTotal>0&&<div className="page">
      <div style={{textAlign:'center',fontSize:'16pt',fontWeight:700,marginBottom:10,letterSpacing:2}}>INVESTIGATION CHARGES</div>
      <table style={{marginBottom:6}}>
        <thead><tr><th>Name</th><th>Reg No</th><th>Phone</th><th>D.O.A</th><th>D.O.D</th></tr></thead>
        <tbody><tr><td><b>{p.name.toUpperCase()}</b></td><td>{p.reg_no||'—'}</td><td>{p.phone||'—'}</td><td>{fmtD(p.admission_date)}</td><td>{p.discharge_date?fmtD(p.discharge_date):'Active'}</td></tr></tbody>
      </table>
      <table>
        <thead><tr><th>Investigation</th><th style={{textAlign:'right',width:'10%'}}>Qty</th><th style={{textAlign:'right',width:'15%'}}>Rate</th><th style={{textAlign:'right',width:'15%'}}>Amount</th></tr></thead>
        <tbody>
          {labTests.filter(i=>i.name).map((i,idx)=>{const amt=(parseFloat(i.qty)||1)*(parseFloat(i.rate)||0);return(<tr key={idx}>
            <td>{i.name}</td>
            <td style={{textAlign:'right'}}>{i.qty||1}</td>
            <td style={{textAlign:'right'}}>{fmt(parseFloat(i.rate)||0)}</td>
            <td style={{textAlign:'right'}}>{fmt(amt)}</td>
          </tr>)})}
          <tr className="total-row"><td colSpan={3} style={{textAlign:'right',fontWeight:700}}>Total</td><td style={{textAlign:'right',fontWeight:700}}>{fmt(labTotal)}</td></tr>
        </tbody>
      </table>
      <div style={{textAlign:'right',marginTop:20}}><div style={{display:'inline-block',borderTop:'1px solid #000',paddingTop:6,width:'35%',textAlign:'center',fontSize:'10pt'}}>Authorised Signature</div></div>
    </div>}
  </>)

  if(printMode)return(<div style={{background:'#f0f0f0',minHeight:'100vh'}}>
    <style>{pageStyle}</style>
    <div className="no-print" style={{position:'fixed',top:0,left:0,right:0,zIndex:100,background:'#1e293b',padding:'10px 16px',display:'flex',gap:8,alignItems:'center'}}>
      <button onClick={()=>window.print()} style={{padding:'8px 24px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontWeight:700,cursor:'pointer',fontSize:14}}>🖨 Print / Save PDF</button>
      <button onClick={()=>{setPrintMode(false);setPrintReceipt(null)}} style={{padding:'8px 16px',background:'none',border:'1px solid #475569',borderRadius:8,cursor:'pointer',fontSize:14,color:'#fff'}}>← Back</button>
      <span style={{color:'#94a3b8',fontSize:12}}>A4 size — prints on letterhead</span>
    </div>
    <div className="print-container" style={{paddingTop:56}}>
      {view==='bill'&&<BillPrint/>}
      {view==='discharge'&&<DischargePrint/>}
      {view==='receipts'&&printReceipt&&<ReceiptPrint r={printReceipt}/>}
    </div>
  </div>)

  // ── EDIT VIEW ──  // ── EDIT VIEW ──
  const inpStyle={width:'100%',padding:'7px 8px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:12,outline:'none'}

  return(<div style={{background:'#f8fafc',minHeight:'100vh'}}>
    <div style={{background:'#0f172a',padding:'14px 16px',display:'flex',alignItems:'center',gap:10,position:'sticky',top:0,zIndex:10}}>
      <button onClick={onClose} style={{color:'#94a3b8',background:'none',border:'1px solid #374151',borderRadius:8,padding:'5px 10px',fontSize:12,cursor:'pointer'}}>← Back</button>
      <div style={{flex:1}}>
        <div style={{fontSize:14,fontWeight:700,color:'#fff'}}>{p.name} — Billing</div>
        {billSaved&&<div style={{fontSize:11,color:'#4ade80'}}>✓ Bill saved</div>}
      </div>
      {billSaved&&<button onClick={()=>setEditMode(true)} style={{color:'#fbbf24',background:'none',border:'1px solid #374151',borderRadius:8,padding:'5px 10px',fontSize:12,cursor:'pointer'}}>✏️ Edit</button>}
    </div>
    <div style={{padding:'16px'}}>
      <div style={{display:'flex',gap:4,marginBottom:16,overflowX:'auto'}}>
        {[{k:'bill',l:'📋 IP Bill'},{k:'receipts',l:'🧾 Receipts'},{k:'discharge',l:'📄 Discharge'}].map(t=>(
          <button key={t.k} onClick={()=>setView(t.k)} style={{flexShrink:0,padding:'8px 14px',borderRadius:12,border:'none',background:view===t.k?'#0f172a':'#f1f5f9',color:view===t.k?'#fff':'#64748b',fontSize:12,fontWeight:700,cursor:'pointer'}}>{t.l}</button>
        ))}
      </div>

      {/* ── IP BILL EDITOR ── */}
      {view==='bill'&&<>
        {/* Consultation */}
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:'14px',marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Consultation</div>
          {consultations.map((item,i)=>(<div key={i} style={{marginBottom:8}}>
            <input value={item.doctor} onChange={e=>{const n=[...consultations];n[i]={...n[i],doctor:e.target.value};setConsultations(n)}} placeholder="Doctor name" style={{...inpStyle,marginBottom:6}}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:6}}>
              <div><div style={{fontSize:10,color:'#94a3b8',fontWeight:700,marginBottom:2}}>No. of visits</div><input inputMode="decimal" value={item.qty} onChange={e=>{const n=[...consultations];n[i]={...n[i],qty:e.target.value};setConsultations(n)}} placeholder="0" style={inpStyle}/></div>
              <div><div style={{fontSize:10,color:'#94a3b8',fontWeight:700,marginBottom:2}}>Rate per visit</div><input inputMode="decimal" value={item.rate} onChange={e=>{const n=[...consultations];n[i]={...n[i],rate:e.target.value};setConsultations(n)}} placeholder="0" style={inpStyle}/></div>
              <button onClick={()=>setConsultations(consultations.filter((_,j)=>j!==i))} style={{color:'#dc2626',background:'none',border:'none',cursor:'pointer',fontSize:18,alignSelf:'flex-end',paddingBottom:4}}>×</button>
            </div>
            {item.qty&&item.rate&&<div style={{textAlign:'right',fontSize:12,color:'#16a34a',fontWeight:700,marginTop:4}}>{fmt(parseFloat(item.qty)*parseFloat(item.rate))}</div>}
          </div>))}
          <button onClick={()=>setConsultations([...consultations,{doctor:'',qty:'',rate:''}])} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer'}}>+ Add doctor</button>
        </div>

        {/* Room/Nursing/Monitor */}
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:'14px',marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Room / Nursing / Monitor charges</div>
          {roomCharges.map((item,i)=>(<div key={i} style={{marginBottom:8}}>
            <input value={item.name} onChange={e=>{const n=[...roomCharges];n[i]={...n[i],name:e.target.value};setRoomCharges(n)}} placeholder="Charge name" style={{...inpStyle,marginBottom:6}}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:6}}>
              <div><div style={{fontSize:10,color:'#94a3b8',fontWeight:700,marginBottom:2}}>Qty / Days</div><input inputMode="decimal" value={item.qty} onChange={e=>{const n=[...roomCharges];n[i]={...n[i],qty:e.target.value};setRoomCharges(n)}} placeholder="0" style={inpStyle}/></div>
              <div><div style={{fontSize:10,color:'#94a3b8',fontWeight:700,marginBottom:2}}>Rate</div><input inputMode="decimal" value={item.rate} onChange={e=>{const n=[...roomCharges];n[i]={...n[i],rate:e.target.value};setRoomCharges(n)}} placeholder="0" style={inpStyle}/></div>
              {i>=4?<button onClick={()=>setRoomCharges(roomCharges.filter((_,j)=>j!==i))} style={{color:'#dc2626',background:'none',border:'none',cursor:'pointer',fontSize:18,alignSelf:'flex-end',paddingBottom:4}}>×</button>:<div/>}
            </div>
            {item.qty&&item.rate&&<div style={{textAlign:'right',fontSize:12,color:'#16a34a',fontWeight:700,marginTop:4}}>{fmt(parseFloat(item.qty)*parseFloat(item.rate))}</div>}
          </div>))}
          <button onClick={()=>setRoomCharges([...roomCharges,{name:'',qty:'',rate:''}])} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer'}}>+ Add charge</button>
        </div>

        {/* Others */}
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:'14px',marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Other charges</div>
          {otherCharges.map((item,i)=>(<div key={i} style={{marginBottom:8}}>
            <AutoInput value={item.name} onChange={v=>{const n=[...otherCharges];n[i]={...n[i],name:v};setOtherCharges(n)}} placeholder="e.g. Dietician charges, Ambulance" suggestions={savedItems.service}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:6,marginTop:6}}>
              <div><div style={{fontSize:10,color:'#94a3b8',fontWeight:700,marginBottom:2}}>Qty</div><input inputMode="decimal" value={item.qty} onChange={e=>{const n=[...otherCharges];n[i]={...n[i],qty:e.target.value};setOtherCharges(n)}} placeholder="1" style={inpStyle}/></div>
              <div><div style={{fontSize:10,color:'#94a3b8',fontWeight:700,marginBottom:2}}>Rate</div><input inputMode="decimal" value={item.rate} onChange={e=>{const n=[...otherCharges];n[i]={...n[i],rate:e.target.value};setOtherCharges(n)}} placeholder="0" style={inpStyle}/></div>
              <button onClick={()=>{saveItem('service',item.name);setOtherCharges(otherCharges.filter((_,j)=>j!==i))}} style={{color:'#dc2626',background:'none',border:'none',cursor:'pointer',fontSize:18,alignSelf:'flex-end',paddingBottom:4}}>×</button>
            </div>
          </div>))}
          <button onClick={()=>setOtherCharges([...otherCharges,{name:'',qty:'',rate:''}])} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer'}}>+ Add</button>
        </div>

        {/* Pharmacy - date wise */}
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:'14px',marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700}}>💊 Medicines (date-wise)</div>
            <div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>Total: {fmt(pharmaTotal)}</div>
          </div>
          {pharmaDays.map((day,di)=>(<div key={di} style={{background:'#f8fafc',borderRadius:10,padding:'10px',marginBottom:10,border:'1px solid #e2e8f0'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:8,marginBottom:8,alignItems:'flex-end'}}>
              <div><div style={{fontSize:10,color:'#94a3b8',fontWeight:700,marginBottom:2}}>Bill No (e.g. OM62)</div><input value={day.billNo} onChange={e=>{const n=[...pharmaDays];n[di]={...n[di],billNo:e.target.value};setPharmaDays(n)}} placeholder="OM62" style={inpStyle}/></div>
              <div><div style={{fontSize:10,color:'#94a3b8',fontWeight:700,marginBottom:2}}>Date</div><input type="date" value={day.date} onChange={e=>{const n=[...pharmaDays];n[di]={...n[di],date:e.target.value};setPharmaDays(n)}} style={inpStyle}/></div>
              {pharmaDays.length>1&&<button onClick={()=>setPharmaDays(pharmaDays.filter((_,j)=>j!==di))} style={{color:'#dc2626',background:'none',border:'none',cursor:'pointer',fontSize:14,fontWeight:700}}>Remove day</button>}
            </div>
            {day.items.map((item,ii)=>(<div key={ii} style={{background:'#fff',borderRadius:8,padding:'8px',marginBottom:6,border:'1px solid #e2e8f0'}}>
              <AutoInput value={item.name} onChange={v=>{const n=[...pharmaDays];n[di].items[ii]={...n[di].items[ii],name:v};setPharmaDays(n)}} placeholder="Medicine name" suggestions={savedItems.medicine}/>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr auto',gap:6,marginTop:6}}>
                <div><div style={{fontSize:10,color:'#94a3b8',marginBottom:2}}>Batch</div><input value={item.batch||''} onChange={e=>{const n=[...pharmaDays];n[di].items[ii]={...n[di].items[ii],batch:e.target.value};setPharmaDays(n)}} placeholder="optional" style={inpStyle}/></div>
                <div><div style={{fontSize:10,color:'#94a3b8',marginBottom:2}}>Expiry</div><input value={item.expiry||''} onChange={e=>{const n=[...pharmaDays];n[di].items[ii]={...n[di].items[ii],expiry:e.target.value};setPharmaDays(n)}} placeholder="MM/YY" style={inpStyle}/></div>
                <div><div style={{fontSize:10,color:'#94a3b8',marginBottom:2}}>Qty</div><input inputMode="decimal" value={item.qty||''} onChange={e=>{const n=[...pharmaDays];n[di].items[ii]={...n[di].items[ii],qty:e.target.value};setPharmaDays(n)}} placeholder="1" style={inpStyle}/></div>
                <div><div style={{fontSize:10,color:'#94a3b8',marginBottom:2}}>Amount</div><input inputMode="decimal" value={item.amount||''} onChange={e=>{const n=[...pharmaDays];n[di].items[ii]={...n[di].items[ii],amount:e.target.value};setPharmaDays(n)}} placeholder="0" style={inpStyle}/></div>
              </div>
              {day.items.length>1&&<button onClick={()=>{saveItem('medicine',item.name);const n=[...pharmaDays];n[di].items=n[di].items.filter((_,j)=>j!==ii);setPharmaDays(n)}} style={{color:'#dc2626',background:'none',border:'none',cursor:'pointer',fontSize:11,marginTop:4}}>✕ Remove</button>}
            </div>))}
            <button onClick={()=>{const n=[...pharmaDays];n[di].items=[...n[di].items,{name:'',qty:'',amount:'',batch:'',expiry:''}];setPharmaDays(n)}} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer'}}>+ Add medicine</button>
            <div style={{textAlign:'right',fontSize:12,fontWeight:700,color:'#16a34a',marginTop:6}}>Day total: {fmt(day.items.reduce((a,i)=>a+(parseFloat(i.amount)||0),0))}</div>
          </div>))}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <button onClick={()=>setPharmaDays([...pharmaDays,{billNo:'',date:todayStr(),items:[{name:'',qty:'',amount:'',batch:'',expiry:''}]}])} style={{padding:'8px',background:'#f1f5f9',border:'1px dashed #cbd5e1',borderRadius:8,fontSize:13,cursor:'pointer',color:'#64748b',fontWeight:600}}>+ Add new day (blank)</button>
            <button onClick={()=>{
              const prev=pharmaDays[pharmaDays.length-1]
              if(!prev)return
              // Copy previous day items, clear amounts for re-entry
              const copiedItems=prev.items.map(i=>({...i,amount:'',batch:'',expiry:''}))
              // Next date = prev date + 1 day
              const nextDate=new Date(prev.date+'T00:00:00')
              nextDate.setDate(nextDate.getDate()+1)
              const nextDateStr=nextDate.toISOString().split('T')[0]
              setPharmaDays([...pharmaDays,{billNo:'',date:nextDateStr,items:copiedItems}])
            }} style={{padding:'8px',background:'#eff6ff',border:'1px dashed #93c5fd',borderRadius:8,fontSize:13,cursor:'pointer',color:'#1d4ed8',fontWeight:600}}>📋 Repeat previous day</button>
          </div>
        </div>

        {/* Lab tests */}
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:'14px',marginBottom:12}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
            <div style={{fontSize:13,fontWeight:700}}>🧪 Investigation charges</div>
            <div style={{fontSize:13,fontWeight:700,color:'#7c3aed'}}>Total: {fmt(labTotal)}</div>
          </div>
          {labTests.map((item,i)=>(<div key={i} style={{marginBottom:8}}>
            <AutoInput value={item.name} onChange={v=>{const n=[...labTests];n[i]={...n[i],name:v};setLabTests(n)}} placeholder="Test name" suggestions={savedItems.lab}/>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:6,marginTop:6}}>
              <div><div style={{fontSize:10,color:'#94a3b8',marginBottom:2}}>Qty</div><input inputMode="decimal" value={item.qty||''} onChange={e=>{const n=[...labTests];n[i]={...n[i],qty:e.target.value};setLabTests(n)}} placeholder="1" style={inpStyle}/></div>
              <div><div style={{fontSize:10,color:'#94a3b8',marginBottom:2}}>Rate</div><input inputMode="decimal" value={item.rate||''} onChange={e=>{const n=[...labTests];n[i]={...n[i],rate:e.target.value};setLabTests(n)}} placeholder="0" style={inpStyle}/></div>
              <button onClick={()=>{saveItem('lab',item.name);setLabTests(labTests.filter((_,j)=>j!==i))}} style={{color:'#dc2626',background:'none',border:'none',cursor:'pointer',fontSize:18,alignSelf:'flex-end',paddingBottom:4}}>×</button>
            </div>
            {item.name&&item.rate&&<div style={{textAlign:'right',fontSize:12,color:'#7c3aed',fontWeight:700,marginTop:2}}>{fmt((parseFloat(item.qty)||1)*parseFloat(item.rate))}</div>}
          </div>))}
          <button onClick={()=>setLabTests([...labTests,{name:'',qty:'1',rate:''}])} style={{fontSize:12,color:'#2563eb',background:'none',border:'none',cursor:'pointer'}}>+ Add test</button>
        </div>

        {/* Grand total + advance/discount */}
        <div style={{background:'#0f172a',borderRadius:14,padding:'16px',marginBottom:12}}>
          <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:4,display:'flex',justifyContent:'space-between'}}><span>Consultation</span><span>{fmt(consultTotal)}</span></div>
          <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:4,display:'flex',justifyContent:'space-between'}}><span>Room/Nursing/Monitor</span><span>{fmt(roomTotal)}</span></div>
          <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:4,display:'flex',justifyContent:'space-between'}}><span>Medicines</span><span>{fmt(pharmaTotal)}</span></div>
          <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:4,display:'flex',justifyContent:'space-between'}}><span>Investigation</span><span>{fmt(labTotal)}</span></div>
          <div style={{color:'rgba(255,255,255,0.5)',fontSize:12,marginBottom:8,display:'flex',justifyContent:'space-between'}}><span>Others</span><span>{fmt(otherTotal)}</span></div>
          <div style={{color:'#fff',fontSize:16,fontWeight:700,display:'flex',justifyContent:'space-between',borderTop:'1px solid rgba(255,255,255,0.2)',paddingTop:8,marginBottom:12}}><span>Grand Total</span><span>{fmt(grandTotal)}</span></div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
            <div><div style={{fontSize:10,color:'rgba(255,255,255,0.5)',marginBottom:3}}>Advance paid (Rs)</div><input inputMode="decimal" value={advance} onChange={e=>setAdvance(e.target.value)} placeholder="0" style={{...inpStyle,background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',color:'#fff'}}/></div>
            <div><div style={{fontSize:10,color:'rgba(255,255,255,0.5)',marginBottom:3}}>Discount (Rs)</div><input inputMode="decimal" value={discount} onChange={e=>setDiscount(e.target.value)} placeholder="0" style={{...inpStyle,background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',color:'#fff'}}/></div>
          </div>
          {(advAmt+discAmt)>0&&<div style={{color:'#4ade80',fontSize:16,fontWeight:700,display:'flex',justifyContent:'space-between',borderTop:'1px solid rgba(255,255,255,0.2)',paddingTop:8}}><span>Final Settlement</span><span>{fmt(finalAmt)}</span></div>}
        </div>
        <div style={{display:'flex',gap:8,marginTop:8}}>
          <GBtn onClick={saveBill} disabled={billSaving} style={{flex:1}}>{billSaving?'Saving...':billSaved&&!editMode?'✓ Saved — Update':'💾 Save Bill'}</GBtn>
          <GBtn onClick={()=>setPrintMode(true)} style={{flex:1,background:'#1d4ed8'}}>🖨 Print</GBtn>
        </div>
        {billSaved&&<div style={{textAlign:'center',fontSize:12,color:'#16a34a',marginTop:4}}>Bill saved — will reload next time you open billing</div>}
      </>}

      {/* ── RECEIPTS ── */}
      {view==='receipts'&&<>
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:'14px',marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:10}}>Generate receipt</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <FInp label="Amount (Rs)" type="number" value={newReceipt.amount} onChange={e=>setNewReceipt({...newReceipt,amount:e.target.value})} placeholder="0"/>
            <FInp label="Date" type="date" value={newReceipt.date} onChange={e=>setNewReceipt({...newReceipt,date:e.target.value})}/>
          </div>
          <FSel label="Payment mode" value={newReceipt.mode} onChange={e=>setNewReceipt({...newReceipt,mode:e.target.value})}>
            {PMODES.map(m=><option key={m} value={m}>{m==='credit'?'⏳ Credit':m==='written_off'?'✂️ Written Off':m==='discount'?'🎟️ Discount':m[0].toUpperCase()+m.slice(1)}</option>)}
          </FSel>
          <FInp label="Notes (optional)" type="text" value={newReceipt.notes} onChange={e=>setNewReceipt({...newReceipt,notes:e.target.value})} placeholder="e.g. Advance, Partial payment, Final"/>
          <GBtn onClick={addReceipt} disabled={savingReceipt}>{savingReceipt?'Saving...':'Generate Receipt'}</GBtn>
        </div>
        {loadingReceipts&&<div style={{textAlign:'center',padding:'20px',color:'#aaa'}}>Loading...</div>}
        {!loadingReceipts&&receipts.length===0&&<div style={{textAlign:'center',padding:'30px',color:'#ccc',fontSize:13}}>No receipts yet</div>}
        {receipts.map(r=>(<div key={r.id} style={{background:'#fff',border:'1px solid #f0f0f0',borderRadius:12,padding:'12px',marginBottom:8,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div>
            <div style={{fontSize:13,fontWeight:700}}>{r.receipt_no}</div>
            <div style={{fontSize:11,color:'#94a3b8'}}>{fmtD(r.receipt_date)} — {(r.mode||'cash')[0].toUpperCase()+(r.mode||'cash').slice(1)}{r.notes?' — '+r.notes:''}</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <div style={{fontSize:15,fontWeight:800,color:'#16a34a'}}>{fmt(r.amount)}</div>
            <button onClick={()=>{setPrintReceipt(r);setPrintMode(true)}} style={{padding:'5px 10px',background:'#f0f9ff',border:'1px solid #bfdbfe',borderRadius:8,fontSize:11,color:'#1d4ed8',cursor:'pointer',fontWeight:700}}>Print</button>
          </div>
        </div>))}
        {receipts.length>0&&<div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'10px 14px',display:'flex',justifyContent:'space-between',fontWeight:700,fontSize:14}}>
          <span>Total collected</span><span style={{color:'#16a34a'}}>{fmt(receipts.reduce((a,r)=>a+r.amount,0))}</span>
        </div>}
      </>}

      {/* ── DISCHARGE ── */}
      {view==='discharge'&&<>
        <div style={{background:'#fff',border:'1px solid #e2e8f0',borderRadius:14,padding:'14px',marginBottom:12}}>
          <div style={{fontSize:13,fontWeight:700,marginBottom:8}}>Discharge Summary</div>
          <div style={{fontSize:12,color:'#94a3b8',marginBottom:8}}>Type or paste complete discharge summary</div>
          <textarea value={dischargeText} onChange={e=>setDischargeText(e.target.value)} placeholder="Chief complaint:&#10;History:&#10;Examination:&#10;Investigations:&#10;Diagnosis:&#10;Treatment given:&#10;Condition at discharge:&#10;Advice:&#10;Follow-up:" style={{width:'100%',minHeight:400,padding:'12px',border:'1px solid #e2e8f0',borderRadius:10,fontSize:13,lineHeight:1.8,outline:'none',resize:'vertical',fontFamily:'inherit'}}/>
        </div>
        <GBtn onClick={()=>setPrintMode(true)}>🖨 Print Discharge Summary</GBtn>
      </>}
    </div>
  </div>)
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
const DatewiseNetCard=({incList,expList,dbRef=null})=>{
  const days=[...new Set(incList.map(e=>e.date).filter(Boolean))].sort()
  if(days.length===0)return null
  const dwRatio=(dn,s)=>{const cl=(dbRef||[]).filter(e=>e.ref_doctor===dn&&incomeSegment(e.type)==='clinical').reduce((a,e)=>a+getComm(e),0);const lb=(dbRef||[]).filter(e=>e.ref_doctor===dn&&incomeSegment(e.type)==='lab').reduce((a,e)=>a+getComm(e),0);const t=cl+lb;return t>0?(s==='lab'?lb/t:cl/t):(s==='lab'?0:1)}
  const calc=(dayInc,dayExp)=>{
    const seg=(s)=>{
      const si=dayInc.filter(e=>incomeSegment(e.type)===s)
      const collected=si.filter(e=>e.payment!=='discount'&&e.payment!=='written_off'&&!isCredit(e)).reduce((a,e)=>a+(e.amount||0),0)
      const comm=dayExp.filter(e=>e.category==='ref_paid').reduce((a,e)=>a+e.amount*dwRatio((e.description||'').trim(),s),0)
      const cons=s==='clinical'?dayExp.filter(e=>e.category==='consultant_fee'||e.category==='consultant_proc_comm').reduce((a,e)=>a+e.amount,0):0
      const exp=dayExp.filter(e=>e.category!=='ref_paid'&&e.category!=='consultant_fee'&&e.category!=='consultant_proc_comm'&&!isRetainedCat(e.category)&&expenseSegment(e.category)===s).reduce((a,e)=>a+(e.amount||0),0)
      return collected-comm-cons-exp
    }
    return{clin:seg('clinical'),lab:seg('lab')}
  }
  const rows=days.map(d=>{const di=incList.filter(e=>e.date===d);const de=expList.filter(e=>e.date===d);const r=calc(di,de);return{d,clin:r.clin,lab:r.lab,net:r.clin+r.lab}}).reverse()
  const tC=rows.reduce((a,r)=>a+r.clin,0),tL=rows.reduce((a,r)=>a+r.lab,0)
  return(<div style={{background:'#fff',border:'1px solid #eef2f7',borderRadius:14,padding:'14px 16px',marginBottom:14}}>
    <div style={{fontSize:13,fontWeight:800,color:'#0f172a',marginBottom:10,textTransform:'uppercase',letterSpacing:'.4px'}}>📅 Date-wise net profit</div>
    <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
      <thead><tr style={{fontSize:10.5,color:'#94a3b8',textTransform:'uppercase',borderBottom:'2px solid #f1f5f9'}}>
        <th style={{textAlign:'left',padding:'6px 4px'}}>Date</th><th style={{textAlign:'right',padding:'6px 4px'}}>🏥 Clinical</th><th style={{textAlign:'right',padding:'6px 4px'}}>🧪 Lab</th><th style={{textAlign:'right',padding:'6px 4px'}}>Net</th>
      </tr></thead>
      <tbody>
        {rows.map(r=>(<tr key={r.d} style={{borderBottom:'1px solid #f8fafc'}}>
          <td style={{padding:'7px 4px',fontWeight:700,color:'#334155'}}>{fmtD(r.d)}</td>
          <td style={{padding:'7px 4px',textAlign:'right',color:r.clin>=0?'#1d4ed8':'#dc2626'}}>{fmt(r.clin)}</td>
          <td style={{padding:'7px 4px',textAlign:'right',color:r.lab>=0?'#c2410c':'#dc2626'}}>{fmt(r.lab)}</td>
          <td style={{padding:'7px 4px',textAlign:'right',fontWeight:800,color:r.net>=0?'#15803d':'#dc2626'}}>{fmt(r.net)}</td>
        </tr>))}
        <tr style={{borderTop:'2px solid #e2e8f0'}}>
          <td style={{padding:'8px 4px',fontWeight:900}}>TOTAL</td>
          <td style={{padding:'8px 4px',textAlign:'right',fontWeight:800,color:'#1d4ed8'}}>{fmt(tC)}</td>
          <td style={{padding:'8px 4px',textAlign:'right',fontWeight:800,color:'#c2410c'}}>{fmt(tL)}</td>
          <td style={{padding:'8px 4px',textAlign:'right',fontWeight:900,fontSize:14.5,color:(tC+tL)>=0?'#15803d':'#dc2626'}}>{fmt(tC+tL)}</td>
        </tr>
      </tbody>
    </table>
  </div>)
}
const SegmentPL=({incList,expList,db=null,mtdIncList=null,mtdExpList=null,mtdLabel='',mtdTitle='Month to date net profit',monthlyOf=null})=>{
    // For each segment: income = sum of revenue (paid + credit, excluding discount/written_off)
    //                    commission = sum of getComm() for that segment's entries
    //                    consultant = sum of consultant_fee for that segment's entries
    //                    expenses = sum of category expenses in that segment
    const calcSeg=(seg,iL,eL)=>{
      const srcInc=iL||incList,srcExp=eL||expList
      const sInc=srcInc.filter(e=>incomeSegment(e.type)===seg)
      const billed=sInc.filter(e=>e.payment!=='discount'&&e.payment!=='written_off').reduce((a,e)=>a+(e.amount||0),0)
      const cash=sInc.filter(e=>e.payment!=='credit'&&e.payment!=='discount'&&e.payment!=='written_off').reduce((a,e)=>a+(e.amount||0),0)
      const credit=sInc.filter(e=>e.payment==='credit').reduce((a,e)=>a+(e.amount||0),0)
      // CASH BASIS: commission & consultant costs = actual payments in the period (by payment date)
      const docSegRatio=(dn)=>{const src=(db&&db.income)||incList;const cl=src.filter(e=>e.ref_doctor===dn&&incomeSegment(e.type)==='clinical').reduce((a,e)=>a+getComm(e),0);const lb=src.filter(e=>e.ref_doctor===dn&&incomeSegment(e.type)==='lab').reduce((a,e)=>a+getComm(e),0);const t=cl+lb;return t>0?(seg==='lab'?lb/t:cl/t):(seg==='lab'?0:1)}
      const commRows=srcExp.filter(e=>e.category==='ref_paid')
      const comm=commRows.reduce((a,e)=>a+e.amount*docSegRatio((e.description||'').trim()),0)
      const consRows=seg==='clinical'?srcExp.filter(e=>e.category==='consultant_fee'||e.category==='consultant_proc_comm'):[]
      const cons=consRows.reduce((a,e)=>a+e.amount,0)
      const incByType={};sInc.filter(e=>e.payment!=='discount'&&e.payment!=='written_off'&&!isCredit(e)).forEach(e=>{if(!incByType[e.type])incByType[e.type]={amt:0,pats:{}};incByType[e.type].amt+=e.amount||0;const pn=(e.patient_name||'—').trim()||'—';incByType[e.type].pats[pn]=(incByType[e.type].pats[pn]||0)+(e.amount||0)})
      const incSplit=Object.entries(incByType).map(([t,d2])=>({t,label:(ITYPES.find(x=>x.key===t)||{}).full||t,amt:d2.amt,pats:Object.entries(d2.pats).map(([n,a2])=>({n,a:a2})).sort((x,y)=>y.a-x.a)})).filter(s=>s.amt>0).sort((a,b)=>b.amt-a.amt)
      const commByDoc={};commRows.forEach(e=>{const dn=(e.description||'(unknown)').trim()||'(unknown)';const share=e.amount*docSegRatio(dn);if(share>0.5){if(!commByDoc[dn])commByDoc[dn]={amt:0,pats:{}};commByDoc[dn].amt+=share;commByDoc[dn].pats[fmtD(e.date)]=(commByDoc[dn].pats[fmtD(e.date)]||0)+share}})
      const commSplit=Object.entries(commByDoc).map(([n,d2])=>({name:n,amt:Math.round(d2.amt),pats:Object.entries(d2.pats).map(([pn,a2])=>({n:pn,a:Math.round(a2)})).sort((x,y)=>y.a-x.a)})).sort((a,b)=>b.amt-a.amt)
      const consByName={};consRows.forEach(e=>{const n=(e.description||'(unnamed)').trim()||'(unnamed)';if(!consByName[n])consByName[n]={amt:0,pats:{}};consByName[n].amt+=e.amount;consByName[n].pats[fmtD(e.date)]=(consByName[n].pats[fmtD(e.date)]||0)+e.amount})
      const consSplit=Object.entries(consByName).map(([n,d2])=>({name:n,amt:Math.round(d2.amt),pats:Object.entries(d2.pats).map(([pn,a2])=>({n:pn,a:Math.round(a2)})).sort((x,y)=>y.a-x.a)})).sort((a,b)=>b.amt-a.amt)
      const sExp=srcExp.filter(e=>e.category!=='ref_paid'&&e.category!=='consultant_fee'&&e.category!=='consultant_proc_comm'&&expenseSegment(e.category)===seg)
      const expTotal=sExp.reduce((a,e)=>a+(e.amount||0),0)
      const expByCat={};sExp.forEach(e=>{if(!expByCat[e.category])expByCat[e.category]=0;expByCat[e.category]+=e.amount||0})
      const expSplit=Object.entries(expByCat).map(([cat,amt])=>({cat,label:(ECATS.find(x=>x.key===cat)||{}).label||cat,amt})).sort((a,b)=>b.amt-a.amt)
      const credByPat={};sInc.filter(e=>isCredit(e)).forEach(e=>{const pn=(e.patient_name||'—').trim()||'—';credByPat[pn]=(credByPat[pn]||0)+(e.amount||0)})
      const creditSplit=Object.entries(credByPat).map(([n,a2])=>({n,a:a2})).sort((x,y)=>y.a-x.a)
      const retained=0,retSplit=[]
      const net=cash-comm-cons-expTotal
      const margin=cash>0?(net/cash*100):0
      return{billed,cash,credit,comm,cons,commSplit,consSplit,expTotal,expSplit,incSplit,creditSplit,retained,retSplit,net,margin,count:sInc.length}
    }
    const clinical=calcSeg('clinical')
    const lab=calcSeg('lab')
    const totalNet=clinical.net+lab.net
    const totalBilled=clinical.billed+lab.billed
    const combinedMargin=totalBilled>0?(totalNet/totalBilled*100):0
    
    const Card1=({title,d,color})=>(<div style={{background:'#fff',border:'2px solid '+color.border,borderRadius:14,padding:'14px 16px'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
        <div style={{fontSize:12.5,fontWeight:800,color:color.dark,textTransform:'uppercase',letterSpacing:'.5px'}}>{title}</div>
        <div style={{fontSize:11.5,fontWeight:600,color:'#94a3b8'}}>{d.count} entries</div>
      </div>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13.5}}>
        <tbody>
          <tr><td style={{padding:'4px 0',color:'#475569'}}>Income (collected)</td><td style={{textAlign:'right',padding:'4px 0',fontWeight:700,color:'#16a34a'}}>{fmt(d.cash)}</td></tr>
          {(d.incSplit||[]).map(s=>(<Fragment key={s.t}><tr style={{fontSize:12,color:'#64748b'}}><td style={{padding:'1px 0 1px 10px'}}>↳ {s.label}</td><td style={{textAlign:'right',padding:'1px 0',color:'#16a34a'}}>{fmt(s.amt)}</td></tr>{(s.pats||[]).map(p=>(<tr key={p.n} style={{fontSize:11,color:'#94a3b8'}}><td style={{padding:'0 0 0 20px'}}>· {p.n}</td><td style={{textAlign:'right',padding:0,color:'#86efac'}}>{fmt(p.a)}</td></tr>))}</Fragment>))}
          {d.credit>0&&<><tr style={{fontSize:12,color:'#c2410c'}}><td style={{padding:'2px 0 2px 8px'}}>↳ Credit outstanding (not counted)</td><td style={{textAlign:'right',padding:'2px 0'}}>{fmt(d.credit)}</td></tr>{(d.creditSplit||[]).map(cp=>(<tr key={cp.n} style={{fontSize:11,color:'#f59e0b'}}><td style={{padding:'0 0 0 18px'}}>· {cp.n}</td><td style={{textAlign:'right',padding:0}}>{fmt(cp.a)}</td></tr>))}</>}
          <tr><td style={{padding:'4px 0',color:'#dc2626'}}>Expenses</td><td style={{textAlign:'right',padding:'4px 0',color:'#dc2626',fontWeight:700}}>−{fmt(d.expTotal)}</td></tr>
          {(d.expSplit||[]).map(s=>(<tr key={s.cat} style={{fontSize:12,color:'#64748b'}}><td style={{padding:'1px 0 1px 10px'}}>↳ {s.label}</td><td style={{textAlign:'right',padding:'1px 0'}}>−{fmt(s.amt)}</td></tr>))}
          {d.comm>0&&<><tr><td style={{padding:'4px 0',color:'#dc2626'}}>Commission</td><td style={{textAlign:'right',padding:'4px 0',color:'#dc2626',fontWeight:700}}>−{fmt(d.comm)}</td></tr>
          {(d.commSplit||[]).map(s=>(<Fragment key={s.name}><tr style={{fontSize:12,color:'#64748b'}}><td style={{padding:'1px 0 1px 10px'}}>↳ Dr. {s.name}</td><td style={{textAlign:'right',padding:'1px 0'}}>−{fmt(s.amt)}</td></tr>{(s.pats||[]).map(p=>(<tr key={p.n} style={{fontSize:11,color:'#94a3b8'}}><td style={{padding:'0 0 0 20px'}}>· {p.n}</td><td style={{textAlign:'right',padding:0}}>−{fmt(p.a)}</td></tr>))}</Fragment>))}</>}
          {d.cons>0&&<><tr><td style={{padding:'4px 0',color:'#dc2626'}}>Consultant fees</td><td style={{textAlign:'right',padding:'4px 0',color:'#dc2626',fontWeight:700}}>−{fmt(d.cons)}</td></tr>
          {(d.consSplit||[]).map(s=>(<Fragment key={s.name}><tr style={{fontSize:12,color:'#64748b'}}><td style={{padding:'1px 0 1px 10px'}}>↳ Dr. {s.name}</td><td style={{textAlign:'right',padding:'1px 0'}}>−{fmt(s.amt)}</td></tr>{(s.pats||[]).map(p=>(<tr key={p.n} style={{fontSize:11,color:'#94a3b8'}}><td style={{padding:'0 0 0 20px'}}>· {p.n}</td><td style={{textAlign:'right',padding:0}}>−{fmt(p.a)}</td></tr>))}</Fragment>))}</>}
          
          <tr style={{borderTop:'1.5px solid '+color.border}}>
            <td style={{padding:'8px 0 2px',fontWeight:800,color:d.net>=0?'#15803d':'#dc2626',fontSize:14}}>NET PROFIT</td>
            <td style={{textAlign:'right',padding:'8px 0 2px',fontWeight:900,fontSize:18,color:d.net>=0?'#15803d':'#dc2626'}}>{fmt(d.net)}</td>
          </tr>
          <tr><td colSpan={2} style={{textAlign:'right',fontSize:11.5,color:'#94a3b8',fontWeight:600}}>Margin: {d.margin.toFixed(1)}%</td></tr>
        </tbody>
      </table>
    </div>)
    
    return(<div style={{marginBottom:14}}>
      <SecL>📊 Segment Profit & Loss</SecL>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
        <Card1 title="🏥 Clinical" d={clinical} color={{border:'#bfdbfe',dark:'#1d4ed8'}}/>
        <Card1 title="🧪 Lab" d={lab} color={{border:'#fde68a',dark:'#92400e'}}/>
      </div>
      <div style={{background:totalNet>=0?'linear-gradient(135deg,#16a34a,#15803d)':'linear-gradient(135deg,#dc2626,#991b1b)',color:'#fff',padding:'12px 18px',borderRadius:12,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <div>
          <div style={{fontSize:12.5,fontWeight:700,opacity:.9,textTransform:'uppercase',letterSpacing:'.5px'}}>Total Net Profit</div>
          <div style={{fontSize:12,opacity:.85,marginTop:2}}>Combined margin: {combinedMargin.toFixed(1)}%</div>
        </div>
        <div style={{fontSize:28,fontWeight:900}}>{fmt(totalNet)}</div>
      </div>
      {mtdIncList&&(()=>{
        const mc=calcSeg('clinical',mtdIncList,mtdExpList||[])
        const ml=calcSeg('lab',mtdIncList,mtdExpList||[])
        const mTotal=mc.net+ml.net
        return(<div style={{background:'linear-gradient(135deg,#7e22ce,#6d28d9)',color:'#fff',padding:'12px 18px',borderRadius:12,marginTop:10}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}>
            <div><div style={{fontSize:12.5,fontWeight:700,opacity:.9,textTransform:'uppercase',letterSpacing:'.5px'}}>{mtdTitle}</div><div style={{fontSize:11,opacity:.8,marginTop:2}}>{mtdLabel}</div></div>
            <div style={{fontSize:28,fontWeight:900}}>{fmt(mTotal)}</div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            <div style={{background:'rgba(255,255,255,.14)',borderRadius:8,padding:'8px 12px'}}><div style={{fontSize:10.5,fontWeight:700,opacity:.85}}>🏥 CLINICAL</div><div style={{fontSize:17,fontWeight:800}}>{fmt(mc.net)}</div></div>
            <div style={{background:'rgba(255,255,255,.14)',borderRadius:8,padding:'8px 12px'}}><div style={{fontSize:10.5,fontWeight:700,opacity:.85}}>🧪 LAB</div><div style={{fontSize:17,fontWeight:800}}>{fmt(ml.net)}</div></div>
          </div>
        </div>)
      })()}
      {monthlyOf&&(()=>{
        const months=[...new Set(incList.map(e=>e.date?.slice(0,7)).filter(Boolean))].sort()
        if(months.length===0)return null
        const MOSF=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
        const rows=months.map(ym=>{
          const mi=incList.filter(e=>e.date?.startsWith(ym))
          const me=expList.filter(e=>e.date?.startsWith(ym))
          const mc=calcSeg('clinical',mi,me),ml=calcSeg('lab',mi,me)
          return{ym,label:MOSF[parseInt(ym.split('-')[1])-1],clin:mc.net,lab:ml.net,total:mc.net+ml.net}
        })
        const yc=rows.reduce((a,r)=>a+r.clin,0),yl=rows.reduce((a,r)=>a+r.lab,0)
        return(<div style={{background:'linear-gradient(135deg,#7e22ce,#6d28d9)',color:'#fff',padding:'14px 16px',borderRadius:12,marginTop:10}}>
          <div style={{fontSize:12.5,fontWeight:700,opacity:.9,textTransform:'uppercase',letterSpacing:'.5px',marginBottom:10}}>Month-wise net profit — {monthlyOf}</div>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
            <thead><tr style={{fontSize:10.5,opacity:.75,textTransform:'uppercase'}}><th style={{textAlign:'left',paddingBottom:6}}>Month</th><th style={{textAlign:'right',paddingBottom:6}}>🏥 Clinical</th><th style={{textAlign:'right',paddingBottom:6}}>🧪 Lab</th><th style={{textAlign:'right',paddingBottom:6}}>Total</th></tr></thead>
            <tbody>
              {rows.map(r=>(<tr key={r.ym} style={{borderTop:'1px solid rgba(255,255,255,.18)'}}>
                <td style={{padding:'6px 0',fontWeight:700}}>{r.label}</td>
                <td style={{textAlign:'right',padding:'6px 0'}}>{fmt(r.clin)}</td>
                <td style={{textAlign:'right',padding:'6px 0'}}>{fmt(r.lab)}</td>
                <td style={{textAlign:'right',padding:'6px 0',fontWeight:800}}>{fmt(r.total)}</td>
              </tr>))}
              <tr style={{borderTop:'2px solid rgba(255,255,255,.4)'}}>
                <td style={{padding:'8px 0',fontWeight:900}}>YEAR</td>
                <td style={{textAlign:'right',padding:'8px 0',fontWeight:800}}>{fmt(yc)}</td>
                <td style={{textAlign:'right',padding:'8px 0',fontWeight:800}}>{fmt(yl)}</td>
                <td style={{textAlign:'right',padding:'8px 0',fontWeight:900,fontSize:14.5}}>{fmt(yc+yl)}</td>
              </tr>
            </tbody>
          </table>
        </div>)
      })()}
    </div>)
  }

const PatientBreakdown=({incList,db,gotoIP,gotoOP,title,compact})=>{
  const groups={}
  incList.forEach(e=>{
    if(e.type==='vc')return
    const name=(e.patient_name||'').trim()
    if(!name)return
    const key=name.toLowerCase()+'|'+(e.reg_no||'')
    if(!groups[key])groups[key]={name,reg_no:e.reg_no||'',patient_id:e.patient_id||null,entries:[],total:0,cash:0,credit:0}
    groups[key].entries.push(e)
    groups[key].total+=e.amount||0
    if(e.payment==='credit')groups[key].credit+=e.amount||0
    else if(e.payment!=='discount'&&e.payment!=='written_off')groups[key].cash+=e.amount||0
    if(e.patient_id&&!groups[key].patient_id)groups[key].patient_id=e.patient_id
  })
  const pats=Object.values(groups).sort((a,b)=>b.total-a.total)
  if(pats.length===0)return null
  const isIPPatient=(p)=>p.patient_id&&db.ip_patients.some(ip=>ip.id===p.patient_id)
  const handleClick=(p)=>{if(isIPPatient(p)){gotoIP&&gotoIP(p.patient_id,'rep')}else{gotoOP&&gotoOP(p.name,'rep')}}
  return(<div style={{marginBottom:14}}>
    <SecL>{'👥 '+(title||'Patients')+' ('+pats.length+')'}</SecL>
    <Card>
      {pats.map((p,i)=>(<div key={p.name+i} style={{padding:'10px 0',borderBottom:i<pats.length-1?'1px solid #f1f5f9':'none'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:compact?0:6}}>
          <button onClick={()=>handleClick(p)} style={{background:'none',border:'none',padding:0,cursor:'pointer',textAlign:'left',flex:1,minWidth:0}}>
            <div style={{fontSize:14,fontWeight:700,color:'#1d4ed8',textDecoration:'underline'}}>{p.name}{isIPPatient(p)?' 🏥':''}</div>
            <div style={{fontSize:10,color:'#94a3b8',marginTop:2}}>{p.reg_no?'Reg: '+p.reg_no:''}{p.entries.length>1?(p.reg_no?' · ':'')+p.entries.length+' transactions':''}</div>
          </button>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:14,fontWeight:800,color:'#0f172a'}}>{fmt(p.total)}</div>
            {p.credit>0&&<div style={{fontSize:10,color:'#c2410c',fontWeight:600}}>Credit: {fmt(p.credit)}</div>}
          </div>
        </div>
        {!compact&&<div style={{paddingLeft:8,fontSize:11,color:'#64748b'}}>
          {p.entries.map((e,j)=>(<div key={e.id} style={{display:'flex',justifyContent:'space-between',padding:'2px 0',borderBottom:j<p.entries.length-1?'1px dotted #f1f5f9':'none'}}>
            <span><TypeTag t={e.type}/> {fmtD(e.date)} · {e.payment}{e.notes?' · '+e.notes:''}</span>
            <span style={{color:e.payment==='credit'?'#c2410c':'#16a34a',fontWeight:600,whiteSpace:'nowrap',marginLeft:8}}>{fmt(e.amount)}</span>
          </div>))}
        </div>}
      </div>))}
    </Card>
  </div>)
}

const DailyDetailReport=({db,rd,setRd,allPaidComm,rm,setRm,ry,setRy,yrs,actions,gotoIP,gotoTimeline,gotoOP})=>{
  const dI=db.income.filter(e=>e.date===rd)
  const dExpAll=db.expenses.filter(e=>e.date===rd)
  const dRetainedClin=dExpAll.filter(e=>e.category==='comm_retained_clinical').reduce((a,e)=>a+e.amount,0)
  const dRetainedLab=dExpAll.filter(e=>e.category==='comm_retained_lab').reduce((a,e)=>a+e.amount,0)
  const dExpPnL=dExpAll.filter(e=>e.category!=='ref_paid'&&e.category!=='consultant_fee'&&e.category!=='consultant_proc_comm'&&!isRetainedCat(e.category))
  const dExpNonLab=dExpPnL.filter(e=>expenseSegment(e.category)!=='lab')
  const dExpLab=dExpPnL.filter(e=>expenseSegment(e.category)==='lab')

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
    if(!opLabByPat[k])opLabByPat[k]={name:(e.patient_name||'Unknown').trim(),pid:e.patient_id,ref:e.ref_doctor||'',amount:0,cash:0,upi:0,card:0,credit:0}
    opLabByPat[k].amount+=e.amount
    if(e.payment==='cash')opLabByPat[k].cash+=e.amount
    else if(e.payment==='upi')opLabByPat[k].upi+=e.amount
    else if(e.payment==='card')opLabByPat[k].card+=e.amount
    else if(e.payment==='credit')opLabByPat[k].credit+=e.amount
    if(e.ref_doctor&&!opLabByPat[k].ref)opLabByPat[k].ref=e.ref_doctor
  })
  const ipLabByPat={}
  dI.filter(e=>e.type==='ip_l').forEach(e=>{
    const k=e.patient_id||(e.patient_name||'Unknown').trim().toLowerCase()
    if(!ipLabByPat[k])ipLabByPat[k]={name:(e.patient_name||'Unknown').trim(),pid:e.patient_id,ref:e.ref_doctor||'',amount:0,cash:0,upi:0,card:0,credit:0}
    ipLabByPat[k].amount+=e.amount
    if(e.payment==='cash')ipLabByPat[k].cash+=e.amount
    else if(e.payment==='upi')ipLabByPat[k].upi+=e.amount
    else if(e.payment==='card')ipLabByPat[k].card+=e.amount
    else if(e.payment==='credit')ipLabByPat[k].credit+=e.amount
    if(e.ref_doctor&&!ipLabByPat[k].ref)ipLabByPat[k].ref=e.ref_doctor
  })
  const opLabEnts=Object.values(opLabByPat)
  const ipLabEnts=Object.values(ipLabByPat)

  // Totals
  const coll=(e)=>!isCredit(e)  // CASH BASIS: only collected money counts as income
  const opInc=dI.filter(e=>e.type==='op'&&coll(e)).reduce((a,e)=>a+e.amount,0)
  const opdInc=dI.filter(e=>e.type==='opd'&&coll(e)).reduce((a,e)=>a+e.amount,0)
  const opdmInc=dI.filter(e=>e.type==='op_dm'&&coll(e)).reduce((a,e)=>a+e.amount,0)
  const oppInc=dI.filter(e=>e.type==='op_p'&&coll(e)).reduce((a,e)=>a+e.amount,0)
  const opComm=dI.filter(e=>e.type==='op').reduce((a,e)=>a+getComm(e),0)
  const vcInc=dI.filter(e=>e.type==='vc'&&coll(e)).reduce((a,e)=>a+e.amount,0)
  const vcConsFee=dI.filter(e=>e.type==='vc'&&coll(e)).reduce((a,e)=>a+(e.consultant_fee||0),0)
  const vcProfit=vcInc-vcConsFee  // hospital keeps gross minus consultant's share
  const oprInc=dI.filter(e=>e.type==='op_r'&&coll(e)).reduce((a,e)=>a+e.amount,0)
  const oprComm=dI.filter(e=>e.type==='op_r').reduce((a,e)=>a+getComm(e),0)
  const ipEnts=dI.filter(e=>['ip','ip_r','ip_p'].includes(e.type))
  const ipInc=ipEnts.filter(coll).reduce((a,e)=>a+e.amount,0)
  const ipComm=ipEnts.reduce((a,e)=>a+getComm(e),0)
  const dCreditToday=dI.filter(e=>isCredit(e)).reduce((a,e)=>a+e.amount,0)
  const labInc=opLabEnts.filter(coll).reduce((a,e)=>a+e.amount,0)+ipLabEnts.filter(coll).reduce((a,e)=>a+e.amount,0)
  const labRawEnts=dI.filter(e=>['op_l','ip_l'].includes(e.type))
  const labCreditToday=labRawEnts.filter(e=>isCredit(e)).reduce((a,e)=>a+e.amount,0)
  const dLabRefPaidShare=(dn)=>{const cl=db.income.filter(e=>e.ref_doctor===dn&&incomeSegment(e.type)==='clinical').reduce((a,e)=>a+getComm(e),0);const lb=db.income.filter(e=>e.ref_doctor===dn&&incomeSegment(e.type)==='lab').reduce((a,e)=>a+getComm(e),0);const t=cl+lb;return t>0?lb/t:0}
  const labComm=dExpAll.filter(e=>e.category==='ref_paid').reduce((a,e)=>a+e.amount*dLabRefPaidShare((e.description||'').trim()),0)
  const labToLab=dExpLab.reduce((a,e)=>a+e.amount,0)
  const labActual=labInc-labComm-labToLab

  // CASH BASIS: collected income minus payments made today minus operating expenses
  const opIpInc=opInc+opdInc+opdmInc+oppInc+vcProfit+oprInc+ipInc
  const clinEntsAll=dI.filter(e=>!['op_l','ip_l'].includes(e.type))
  const docRatioClin=(dn)=>{const cl=db.income.filter(e=>e.ref_doctor===dn&&incomeSegment(e.type)==='clinical').reduce((a,e)=>a+getComm(e),0);const lb=db.income.filter(e=>e.ref_doctor===dn&&incomeSegment(e.type)==='lab').reduce((a,e)=>a+getComm(e),0);const t=cl+lb;return t>0?cl/t:1}
  const dRefPaidRows=dExpAll.filter(e=>e.category==='ref_paid')
  const opIpComm=dRefPaidRows.reduce((a,e)=>a+e.amount*docRatioClin((e.description||'').trim()),0)
  const dConsPaidRows=dExpAll.filter(e=>e.category==='consultant_fee'||e.category==='consultant_proc_comm')
  const opIpConsFee=dConsPaidRows.reduce((a,e)=>a+e.amount,0)
  const nonLabExpTotal=dExpNonLab.reduce((a,e)=>a+e.amount,0)
  const opIpActual=opIpInc-opIpComm-opIpConsFee-nonLabExpTotal

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
    <SegmentPL db={db} incList={dI} expList={dExpAll} mtdIncList={db.income.filter(e=>e.date>=rd.slice(0,7)+'-01'&&e.date<=rd)} mtdExpList={db.expenses.filter(e=>e.date>=rd.slice(0,7)+'-01'&&e.date<=rd)} mtdLabel={fmtD(rd.slice(0,7)+'-01')+' → '+fmtD(rd)}/>
      <PatientBreakdown incList={dI} db={db} gotoIP={gotoIP} gotoOP={gotoOP} title="Today patients" compact={false}/>
      <SecL>OP Consultation</SecL>
    {Object.keys(opByPat).length===0
      ?<div style={{color:'#ccc',fontSize:13,padding:'8px 0',marginBottom:8}}>No OP consultations</div>
      :<Card>
        {Object.values(opByPat).map(pat=>{
          const total=pat.entries.reduce((a,e)=>a+e.amount,0)
          const consFee=pat.entries.reduce((a,e)=>a+(e.consultant_fee||0),0)
          const consName=pat.entries.find(e=>e.consultant_name)?.consultant_name
          const ref=pat.entries.find(e=>e.ref_doctor)?.ref_doctor
          const cashAmt=pat.entries.filter(e=>e.payment==='cash').reduce((a,e)=>a+e.amount,0)
          const upiAmt=pat.entries.filter(e=>e.payment==='upi').reduce((a,e)=>a+e.amount,0)
          const cardAmt=pat.entries.filter(e=>e.payment==='card').reduce((a,e)=>a+e.amount,0)
          const creditAmt=pat.entries.filter(e=>e.payment==='credit').reduce((a,e)=>a+e.amount,0)
          return(<div key={pat.name} style={{padding:'9px 0',borderBottom:'1px solid #f5f5f5'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div style={{flex:1}}><NameBtn name={pat.name} pid={pat.pid} isIP={false}/>
                {ref&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>Ref: {ref}</div>}
                {consFee>0&&<div style={{fontSize:11,color:'#7c3aed',marginTop:2}}>Cons fee: {fmt(consFee)}{consName?' ('+consName+')':''}</div>}
                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
                  {cashAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#f0fdf4',color:'#16a34a',fontWeight:700}}>Cash {fmt(cashAmt)}</span>}
                  {upiAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#eff6ff',color:'#2563eb',fontWeight:700}}>UPI {fmt(upiAmt)}</span>}
                  {cardAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fdf4ff',color:'#7c3aed',fontWeight:700}}>Card {fmt(cardAmt)}</span>}
                  {typeof bankAmt!=='undefined'&&bankAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#e0f2fe',color:'#0369a1',fontWeight:700}}>Bank {fmt(bankAmt)}</span>}
                  {creditAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fef2f2',color:'#dc2626',fontWeight:700}}>Credit {fmt(creditAmt)}</span>}
                </div>
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
          const cashAmt=pat.entries.filter(e=>e.payment==='cash').reduce((a,e)=>a+e.amount,0)
          const upiAmt=pat.entries.filter(e=>e.payment==='upi').reduce((a,e)=>a+e.amount,0)
          const cardAmt=pat.entries.filter(e=>e.payment==='card').reduce((a,e)=>a+e.amount,0)
          const creditAmt=pat.entries.filter(e=>e.payment==='credit').reduce((a,e)=>a+e.amount,0)
          return(<div key={pat.name} style={{padding:'9px 0',borderBottom:'1px solid #f5f5f5'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
              <div style={{flex:1}}><NameBtn name={pat.name} pid={pat.pid} isIP={false}/>{ref&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>Ref: {ref}</div>}
                <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
                  {cashAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#f0fdf4',color:'#16a34a',fontWeight:700}}>Cash {fmt(cashAmt)}</span>}
                  {upiAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#eff6ff',color:'#2563eb',fontWeight:700}}>UPI {fmt(upiAmt)}</span>}
                  {cardAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fdf4ff',color:'#7c3aed',fontWeight:700}}>Card {fmt(cardAmt)}</span>}
                  {typeof bankAmt!=='undefined'&&bankAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#e0f2fe',color:'#0369a1',fontWeight:700}}>Bank {fmt(bankAmt)}</span>}
                  {creditAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fef2f2',color:'#dc2626',fontWeight:700}}>Credit {fmt(creditAmt)}</span>}
                </div>
              </div>
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
        {Object.values(ipByPat).map(pat=>{
          const ipEnts=dI.filter(e=>['ip','ip_r'].includes(e.type)&&(e.patient_id===pat.id||(e.patient_name||'').trim().toLowerCase()===(pat.name||'').trim().toLowerCase()))
          const cashAmt=ipEnts.filter(e=>e.payment==='cash').reduce((a,e)=>a+e.amount,0)
          const upiAmt=ipEnts.filter(e=>e.payment==='upi').reduce((a,e)=>a+e.amount,0)
          const creditAmt=ipEnts.filter(e=>e.payment==='credit').reduce((a,e)=>a+e.amount,0)
          return(<div key={pat.id||pat.name} style={{padding:'9px 0',borderBottom:'1px solid #f5f5f5'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
            <div style={{flex:1}}><NameBtn name={pat.name} pid={pat.id} isIP={true}/>
              <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:4}}>
                {pat.ip>0&&<span style={{fontSize:11,color:'#2563eb',fontWeight:600}}>IP Charges: {fmt(pat.ip)}</span>}
                {pat.ip_r>0&&<span style={{fontSize:11,color:'#16a34a',fontWeight:600}}>IP Pharmacy: {fmt(pat.ip_r)}</span>}
              </div>
              {pat.ref&&<div style={{fontSize:11,color:'#d97706',marginTop:2}}>Ref: {pat.ref}</div>}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:4}}>
                {cashAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#f0fdf4',color:'#16a34a',fontWeight:700}}>Cash {fmt(cashAmt)}</span>}
                {upiAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#eff6ff',color:'#2563eb',fontWeight:700}}>UPI {fmt(upiAmt)}</span>}
                {creditAmt>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fef2f2',color:'#dc2626',fontWeight:700}}>Credit {fmt(creditAmt)}</span>}
              </div>
            </div>
            <div style={{textAlign:'right'}}><div style={{fontSize:14,fontWeight:700,color:'#16a34a'}}>{fmt(pat.ip+pat.ip_r)}</div></div>
          </div>
        </div>)})}

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
            <div style={{flex:1}}><NameBtn name={e.name} pid={e.pid} isIP={false}/>{e.ref&&<div style={{fontSize:11,color:'#d97706'}}>Ref: {e.ref}</div>}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:3}}>
                {e.cash>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#f0fdf4',color:'#16a34a',fontWeight:700}}>Cash {fmt(e.cash)}</span>}
                {e.upi>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#eff6ff',color:'#2563eb',fontWeight:700}}>UPI {fmt(e.upi)}</span>}
                {e.card>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fdf4ff',color:'#7c3aed',fontWeight:700}}>Card {fmt(e.card)}</span>}
                {e.credit>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fef2f2',color:'#dc2626',fontWeight:700}}>Credit {fmt(e.credit)}</span>}
              </div>
            </div>
            <div style={{textAlign:'right'}}><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(e.amount)}</div><TypeTag t="op_l"/></div>
          </div>))}
          <R l="OP Lab subtotal" v={fmt(opLabEnts.reduce((a,e)=>a+e.amount,0))} bold/>
        </div>}
        {ipLabEnts.length>0&&<div>
          <div style={{fontSize:11,fontWeight:700,color:'#7c3aed',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:6}}>IP Lab</div>
          {ipLabEnts.map((e,i)=>(<div key={e.name+i} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid #f5f5f5'}}>
            <div style={{flex:1}}><NameBtn name={e.name} pid={e.pid} isIP={true}/>{e.ref&&<div style={{fontSize:11,color:'#d97706'}}>Ref: {e.ref}</div>}
              <div style={{display:'flex',gap:6,flexWrap:'wrap',marginTop:3}}>
                {e.cash>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#f0fdf4',color:'#16a34a',fontWeight:700}}>Cash {fmt(e.cash)}</span>}
                {e.upi>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#eff6ff',color:'#2563eb',fontWeight:700}}>UPI {fmt(e.upi)}</span>}
                {e.card>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fdf4ff',color:'#7c3aed',fontWeight:700}}>Card {fmt(e.card)}</span>}
                {e.credit>0&&<span style={{fontSize:10,padding:'1px 8px',borderRadius:20,background:'#fef2f2',color:'#dc2626',fontWeight:700}}>Credit {fmt(e.credit)}</span>}
              </div>
            </div>
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
            <div style={{fontSize:10,color:'#7dd3fc',marginTop:2,lineHeight:1.5}}>OP + OPD + OP Procedures + VC + OP Pharmacy + IP Charges + IP Pharmacy − ref comm − consultant fees − non-lab expenses <span style={{background:'#0369a1',color:'#fff',padding:'1px 6px',borderRadius:6,fontSize:9,fontWeight:800}}>v2</span></div>
          </div>
          <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
            <div style={{fontSize:10,color:'#7dd3fc'}}>Actual income</div>
            <div style={{fontSize:22,fontWeight:800,color:opIpActual>=0?'#0369a1':'#dc2626'}}>{fmt(opIpActual)}</div>
          </div>
        </div>
        <div style={{background:'rgba(255,255,255,0.8)',borderRadius:10,padding:'10px 12px',display:'flex',flexDirection:'column',gap:5}}>
          {opInc>0&&<>
            <R l="OP Consultation" v={fmt(opInc)} green/>
            {dI.filter(e=>e.type==='op').map((e,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,color:'#374151',padding:'4px 0 4px 10px',borderLeft:'2px solid #bae6fd',gap:8}}>
              <div style={{display:'flex',flexDirection:'column',gap:2,flex:1,minWidth:0}}>
                <div><NameBtn name={e.patient_name||'—'} pid={e.patient_id||null} isIP={false}/>{e.op_type?' — '+e.op_type:''}</div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}><PayBadges e={e} cr={isCredit(e)}/></div>
              </div>
              <span style={{fontWeight:700,color:'#16a34a',whiteSpace:'nowrap'}}>{fmt(e.amount)}</span>
            </div>)}
          </>}
          {opdInc>0&&<>
            <R l="OPD Services" v={fmt(opdInc)} green/>
            {dI.filter(e=>e.type==='opd').map((e,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,color:'#374151',padding:'4px 0 4px 10px',borderLeft:'2px solid #bae6fd',gap:8}}>
              <div style={{display:'flex',flexDirection:'column',gap:2,flex:1,minWidth:0}}>
                <div><NameBtn name={e.patient_name||'—'} pid={e.patient_id||null} isIP={false}/></div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}><PayBadges e={e} cr={isCredit(e)}/></div>
              </div>
              <span style={{fontWeight:700,color:'#16a34a',whiteSpace:'nowrap'}}>{fmt(e.amount)}</span>
            </div>)}
          </>}
          {oppInc>0&&<>
            <R l="OP Procedures" v={fmt(oppInc)} green/>
            {dI.filter(e=>e.type==='op_p').map((e,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,color:'#374151',padding:'4px 0 4px 10px',borderLeft:'2px solid #bae6fd',gap:8}}>
              <div style={{display:'flex',flexDirection:'column',gap:2,flex:1,minWidth:0}}>
                <div><NameBtn name={e.patient_name||'—'} pid={e.patient_id||null} isIP={false}/></div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}><PayBadges e={e} cr={isCredit(e)}/></div>
              </div>
              <span style={{fontWeight:700,color:'#16a34a',whiteSpace:'nowrap'}}>{fmt(e.amount)}</span>
            </div>)}
          </>}
          {opdmInc>0&&<>
            <R l="OP Discharge Medicine" v={fmt(opdmInc)} green/>
            {dI.filter(e=>e.type==='op_dm').map((e,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,color:'#374151',padding:'4px 0 4px 10px',borderLeft:'2px solid #f9a8d4',gap:8}}>
              <div style={{display:'flex',flexDirection:'column',gap:2,flex:1,minWidth:0}}>
                <div><NameBtn name={e.patient_name||'—'} pid={e.patient_id||null} isIP={false}/></div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}><PayBadges e={e} cr={isCredit(e)}/></div>
              </div>
              <span style={{fontWeight:700,color:'#16a34a',whiteSpace:'nowrap'}}>{fmt(e.amount)}</span>
            </div>)}
          </>}
          {vcProfit>0&&<R l="VC hospital profit" v={fmt(vcProfit)} green sub={'Collected '+fmt(vcInc)+' - Cons fee '+fmt(vcConsFee)}/>}
          {oprInc>0&&<>
            <R l="OP Pharmacy" v={fmt(oprInc)} green/>
            {dI.filter(e=>e.type==='op_r').map((e,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,color:'#374151',padding:'4px 0 4px 10px',borderLeft:'2px solid #bae6fd',gap:8}}>
              <div style={{display:'flex',flexDirection:'column',gap:2,flex:1,minWidth:0}}>
                <div><NameBtn name={e.patient_name||'—'} pid={e.patient_id||null} isIP={false}/></div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}><PayBadges e={e} cr={isCredit(e)}/></div>
              </div>
              <span style={{fontWeight:700,color:'#16a34a',whiteSpace:'nowrap'}}>{fmt(e.amount)}</span>
            </div>)}
          </>}
          {ipInc>0&&<>
            <R l="IP Charges + Pharmacy" v={fmt(ipInc)} green/>
            {(()=>{const ipEnts=dI.filter(e=>['ip','ip_r','ip_p'].includes(e.type));const byPat={};ipEnts.forEach(e=>{const k=e.patient_name||'—';if(!byPat[k])byPat[k]={amt:0,cr:0,pid:e.patient_id||null};byPat[k].amt+=e.amount;if(isCredit(e))byPat[k].cr+=e.amount});return Object.entries(byPat).map(([name,d],i)=><div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#374151',padding:'2px 0 2px 10px',borderLeft:'2px solid #bae6fd'}}>
              <span>🏥 <NameBtn name={name} pid={d.pid} isIP={true}/>{d.cr>0&&<span style={{fontSize:9.5,padding:'1px 7px',borderRadius:20,background:'#fff7ed',color:'#c2410c',fontWeight:700,marginLeft:5}}>Credit {fmt(d.cr)}</span>}</span><span style={{fontWeight:600}}>{fmt(d.amt)}</span>
            </div>)})()}
          </>}
          <R l="Collected OP + IP income" v={fmt(opIpInc)} bold green/>{dCreditToday-labCreditToday>0&&<>{<R l="Credit given today (not counted)" v={fmt(dCreditToday-labCreditToday)} sub="Will count as income on the day you collect it"/>}{Object.entries(dI.filter(e=>isCredit(e)&&!['op_l','ip_l'].includes(e.type)).reduce((m,e)=>{const n=(e.patient_name||'—').trim()||'—';m[n]=(m[n]||0)+e.amount;return m},{})).sort((a,b)=>b[1]-a[1]).map(([n,amt])=>(<div key={n} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#d97706',padding:'2px 0 2px 14px'}}><span>· {n}</span><span>{fmt(amt)}</span></div>))}</>}
          {opIpComm>0&&<>{<R l="Ref commissions paid" v={'- '+fmt(Math.round(opIpComm))} red sub="Actual payments made today (clinical share)"/>}{dRefPaidRows.map((e,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#94a3b8',padding:'2px 0 2px 14px'}}><span>↳ Dr. {(e.description||'').trim()}</span><span>- {fmt(Math.round(e.amount*docRatioClin((e.description||'').trim())))}</span></div>))}</>}
          {opIpConsFee>0&&<>{<R l="Consultant fees paid" v={'- '+fmt(opIpConsFee)} red sub="Actual payments made today"/>}{dConsPaidRows.map((e,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#94a3b8',padding:'2px 0 2px 14px'}}><span>↳ {(e.description||'').trim()}</span><span>- {fmt(e.amount)}</span></div>))}</>}
          {dExpNonLab.map((e,i)=>(<R key={i} l={(e.category||'misc').replace(/_/g,' ')} v={'- '+fmt(e.amount)} red/>))}
          <div style={{height:1,background:'#bae6fd'}}/>
          <R l="= Actual income" v={fmt(opIpActual)} bold/>
          <div style={{height:1,background:'#bae6fd',margin:'6px 0'}}/>
          <div style={{fontSize:10,color:'#0369a1',fontWeight:700,marginBottom:4}}>Payment modes</div>
          {(()=>{
            const segInc=dI.filter(e=>!['op_l','ip_l'].includes(e.type))
            const segCash=segInc.filter(e=>e.payment==='cash').reduce((a,e)=>a+e.amount,0)
            const segUpi=segInc.filter(e=>e.payment==='upi').reduce((a,e)=>a+e.amount,0)
            const segIns=segInc.filter(e=>e.payment==='insurance').reduce((a,e)=>a+e.amount,0)
            const segCredit=segInc.filter(e=>e.payment==='credit').reduce((a,e)=>a+e.amount,0)
            return(<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {segCash>0&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#f0fdf4',color:'#16a34a',fontWeight:700}}>Cash {fmt(segCash)}</span>}
              {segUpi>0&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#eff6ff',color:'#2563eb',fontWeight:700}}>UPI {fmt(segUpi)}</span>}
              {segIns>0&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#dbeafe',color:'#1d4ed8',fontWeight:700}}>Insurance {fmt(segIns)}</span>}
              {segCredit>0&&<span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#fef2f2',color:'#dc2626',fontWeight:700}}>Credit {fmt(segCredit)}</span>}
            </div>)
          })()}
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
          {(()=>{
            const opL=dI.filter(e=>e.type==='op_l'),ipL=dI.filter(e=>e.type==='ip_l')
            const opLT=opL.reduce((a,e)=>a+e.amount,0),ipLT=ipL.reduce((a,e)=>a+e.amount,0)
            const MRow=({e,isIP})=>(<div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:11,color:'#374151',padding:'4px 0 4px 10px',borderLeft:'2px solid #e9d5ff',gap:8}}>
              <div style={{display:'flex',flexDirection:'column',gap:2,flex:1,minWidth:0}}>
                <div>{isIP?'🏥 ':''}<NameBtn name={e.patient_name||'—'} pid={e.patient_id||null} isIP={isIP}/></div>
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}><PayBadges e={e} cr={isCredit(e)}/></div>
              </div>
              <span style={{fontWeight:700,color:'#16a34a',whiteSpace:'nowrap'}}>{fmt(e.amount)}</span>
            </div>)
            return(<>
              {opLT>0&&<><R l="OP Lab" v={fmt(opLT)} green/>{opL.map((e,i)=><MRow key={'o'+i} e={e} isIP={false}/>)}</>}
              {ipLT>0&&<><R l="IP Lab" v={fmt(ipLT)} green/>{ipL.map((e,i)=><MRow key={'i'+i} e={e} isIP={true}/>)}</>}
              <R l="Collected lab income" v={fmt(labInc)} bold green/>{labCreditToday>0&&<>{<R l="Credit given today (not counted)" v={fmt(labCreditToday)} sub="Counts on collection day"/>}{Object.entries(dI.filter(e=>isCredit(e)&&['op_l','ip_l'].includes(e.type)).reduce((m,e)=>{const n=(e.patient_name||'—').trim()||'—';m[n]=(m[n]||0)+e.amount;return m},{})).sort((a,b)=>b[1]-a[1]).map(([n,amt])=>(<div key={n} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#d97706',padding:'2px 0 2px 14px'}}><span>· {n}</span><span>{fmt(amt)}</span></div>))}</>}
            </>)
          })()}
          <><R l="Ref commissions paid" v={'- '+fmt(Math.round(labComm))} red sub="Lab share of today's payments"/>{dExpAll.filter(e=>e.category==='ref_paid'&&dLabRefPaidShare((e.description||'').trim())>0).map((e,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:11,color:'#94a3b8',padding:'2px 0 2px 14px'}}><span>↳ Dr. {(e.description||'').trim()}</span><span>- {fmt(Math.round(e.amount*dLabRefPaidShare((e.description||'').trim())))}</span></div>))}</>
          {labToLab>0&&<R l="Lab to lab expenses" v={'- '+fmt(labToLab)} red/>}
          <div style={{height:1,background:'#e9d5ff'}}/>
          <R l="= Actual income" v={fmt(labActual)} bold/>
          <div style={{height:1,background:'#e9d5ff',margin:'6px 0'}}/>
          <div style={{fontSize:10,color:'#7c3aed',fontWeight:700,marginBottom:4}}>Payment modes</div>
          {(()=>{
            const labEnts=dI.filter(e=>['op_l','ip_l'].includes(e.type))
            return(<div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
              {['cash','upi','card','insurance','credit'].map(m=>{
                const amt=labEnts.filter(e=>e.payment===m).reduce((a,e)=>a+e.amount,0)
                if(!amt)return null
                const styles={cash:{bg:'#f0fdf4',c:'#16a34a'},upi:{bg:'#eff6ff',c:'#2563eb'},card:{bg:'#fdf4ff',c:'#7c3aed'},insurance:{bg:'#dbeafe',c:'#1d4ed8'},credit:{bg:'#fef2f2',c:'#dc2626'}}
                const s=styles[m]||{bg:'#f1f5f9',c:'#64748b'}
                return(<span key={m} style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:s.bg,color:s.c,fontWeight:700}}>{m==='upi'?'UPI/Scan':m[0].toUpperCase()+m.slice(1)} {fmt(amt)}</span>)
              })}
            </div>)
          })()}
        </div>
      </div>
    </div>
    <SecL>Payment mode breakdown</SecL>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:16}}>
      {[{k:'cash',l:'Cash',bg:'#f0fdf4',c:'#16a34a'},{k:'upi',l:'UPI / Scan',bg:'#eff6ff',c:'#2563eb'},{k:'card',l:'Card',bg:'#fdf4ff',c:'#7c3aed'},{k:'bank',l:'Bank',bg:'#fff7ed',c:'#d97706'},{k:'credit',l:'Credit (Due)',bg:'#fef2f2',c:'#dc2626'}].map(m=>{
        const amt=dI.filter(e=>e.payment===m.k).reduce((a,e)=>a+(e.amount||0),0)
        if(!amt)return null
        return(<div key={m.k} style={{background:m.bg,borderRadius:12,padding:'10px 12px'}}>
          <div style={{fontSize:10,color:m.c,fontWeight:700,marginBottom:4}}>{m.l}</div>
          <div style={{fontSize:16,fontWeight:800,color:m.c}}>{fmt(amt)}</div>
        </div>)
      })}
    </div>
    <SecL>Income chart — last 30 days</SecL>
    {(()=>{
      const days=[];const today=new Date();
      for(let i=29;i>=0;i--){const d=new Date(today);d.setDate(d.getDate()-i);days.push(d.toISOString().split('T')[0])}
      const chartData=days.map(d=>{
        const dI2=db.income.filter(e=>e.date===d)
        const dE=db.expenses.filter(e=>e.date===d&&e.category!=='ref_paid')
        const gross=dI2.reduce((a,e)=>a+e.amount,0)
        const comm=dI2.reduce((a,e)=>a+getComm(e),0)
        const exp=dE.reduce((a,e)=>a+e.amount,0)
        return{label:d.slice(8),date:d,gross,real:gross-comm,actual:gross-comm-exp,isSelected:d===rd}
      })
      const maxVal=Math.max(...chartData.map(d=>d.gross),1)
      return(<div style={{background:'#fff',borderRadius:14,border:'1px solid #f0f0f0',padding:'14px',marginBottom:16}}>
        <div style={{display:'flex',gap:12,marginBottom:10,flexWrap:'wrap'}}>
          {[{c:'#16a34a',l:'Gross'},{c:'#2563eb',l:'Real'},{c:'#7c3aed',l:'Actual'}].map(m=>(<div key={m.l} style={{display:'flex',alignItems:'center',gap:4,fontSize:11}}><div style={{width:10,height:10,borderRadius:2,background:m.c}}/>{m.l}</div>))}
        </div>
        <div style={{overflowX:'auto'}}>
          <div style={{minWidth:900,paddingBottom:4}}>
            <div style={{display:'flex',alignItems:'flex-end',gap:2,height:120,marginBottom:4,borderBottom:'1px solid #f0f0f0'}}>
              {chartData.map((d,i)=>(
                <div key={i} onClick={()=>setRd(d.date)} style={{flex:1,display:'flex',gap:1,alignItems:'flex-end',height:'100%',cursor:'pointer',minWidth:20,opacity:d.isSelected?1:0.75,filter:d.isSelected?'brightness(1.1)':'none'}}>
                  <div style={{flex:1,background:'#16a34a',borderRadius:'2px 2px 0 0',height:Math.round((d.gross/maxVal)*110)+'px'}}/>
                  <div style={{flex:1,background:'#2563eb',borderRadius:'2px 2px 0 0',height:Math.round((d.real/maxVal)*110)+'px'}}/>
                  <div style={{flex:1,background:'#7c3aed',borderRadius:'2px 2px 0 0',height:Math.round((Math.max(d.actual,0)/maxVal)*110)+'px'}}/>
                </div>
              ))}
            </div>
            <div style={{display:'flex',gap:2}}>
              {chartData.map((d,i)=>(<div key={i} style={{flex:1,textAlign:'center',fontSize:8,color:d.isSelected?'#16a34a':'#aaa',fontWeight:d.isSelected?700:400,minWidth:20}}>{d.label}</div>))}
            </div>
          </div>
        </div>
        <div style={{marginTop:10,fontSize:12,color:'#94a3b8',textAlign:'center'}}>Tap any bar to jump to that date</div>
      </div>)
    })()}
    {/* INSURANCE DAILY CARD */}
    {(()=>{
      const insPatients=db.ip_patients.filter(p=>p.insurance_type&&p.insurance_type.trim()&&p.admission_date<=rd&&(!p.discharge_date||p.discharge_date>=rd))
      const insPaymentsToday=db.ip_patients.flatMap(p=>(p.payments||[]).filter(py=>py.mode==='insurance'&&py.date===rd).map(py=>({...py,patName:p.name,insType:p.insurance_type})))
      if(insPatients.length===0)return null
      return(<>
        {insPaymentsToday.length>0&&<>
          <SecL>Insurance payments received today</SecL>
          <Card style={{border:'1px solid #bfdbfe',background:'#eff6ff'}}>
            {insPaymentsToday.map((py,i)=>(<div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #dbeafe'}}>
              <div><div style={{fontSize:13,fontWeight:600,color:'#1e40af'}}>{py.patName}</div>
                <div style={{fontSize:11,color:'#3b82f6'}}>{py.insType} — {py.note||'Insurance payment'}</div>
              </div>
              <div style={{fontSize:14,fontWeight:800,color:'#1d4ed8'}}>{fmt(py.amount)}</div>
            </div>))}
            <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #bfdbfe',fontWeight:700,fontSize:13}}>
              <span style={{color:'#1e40af'}}>Total insurance received today</span>
              <span style={{color:'#1d4ed8'}}>{fmt(insPaymentsToday.reduce((a,py)=>a+py.amount,0))}</span>
            </div>
          </Card>
        </>}
        <SecL>Insurance patients today</SecL>
        {insPatients.map(p=>{
          const totalBill=db.income.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+(e.amount||0),0)
          const insRec=(p.payments||[]).filter(py=>py.mode==='insurance').reduce((a,py)=>a+(py.amount||0),0)
          const insPend=Math.max((p.insurance_expected||0)-insRec,0)
          const copay=Math.max(totalBill-(p.insurance_expected||0),0)
          const cashRec=(p.payments||[]).filter(py=>py.mode!=='insurance').reduce((a,py)=>a+(py.amount||0),0)
          const copayPend=Math.max(copay-cashRec,0)
          return(<div key={p.id} style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:12,padding:'12px',marginBottom:8}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:8}}>
              <div><div style={{fontSize:13,fontWeight:700,color:'#1e40af'}}>{p.name}</div>
                <div style={{fontSize:11,color:'#3b82f6'}}>{p.insurance_type}{p.insurance_policy_no?' — '+p.insurance_policy_no:''}</div>
              </div>
              <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,fontWeight:700,
                background:p.insurance_status==='approved'?'#f0fdf4':p.insurance_status==='rejected'?'#fef2f2':'#fffbeb',
                color:p.insurance_status==='approved'?'#16a34a':p.insurance_status==='rejected'?'#dc2626':'#d97706'
              }}>{p.insurance_status==='approved'?'Approved':p.insurance_status==='rejected'?'Rejected':'Pending'}</span>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:6}}>
              <div style={{textAlign:'center',background:'rgba(255,255,255,0.7)',borderRadius:8,padding:'6px'}}>
                <div style={{fontSize:9,color:'#64748b',fontWeight:700}}>TOTAL BILL</div>
                <div style={{fontSize:13,fontWeight:800,color:'#0f172a'}}>{fmt(totalBill)}</div>
              </div>
              <div style={{textAlign:'center',background:'rgba(255,255,255,0.7)',borderRadius:8,padding:'6px'}}>
                <div style={{fontSize:9,color:'#2563eb',fontWeight:700}}>INS APPROVED</div>
                <div style={{fontSize:13,fontWeight:800,color:'#2563eb'}}>{fmt(p.insurance_expected||0)}</div>
              </div>
              <div style={{textAlign:'center',background:'rgba(255,255,255,0.7)',borderRadius:8,padding:'6px'}}>
                <div style={{fontSize:9,color:'#7c3aed',fontWeight:700}}>CO-PAY</div>
                <div style={{fontSize:13,fontWeight:800,color:'#7c3aed'}}>{fmt(copay)}</div>
              </div>
            </div>
            <div style={{fontSize:11,display:'flex',flexDirection:'column',gap:3}}>
              {insPend>0&&<div style={{display:'flex',justifyContent:'space-between',color:'#d97706'}}><span>Insurance pending</span><span style={{fontWeight:700}}>{fmt(insPend)}</span></div>}
              {copayPend>0&&<div style={{display:'flex',justifyContent:'space-between',color:'#dc2626'}}><span>Co-pay pending</span><span style={{fontWeight:700}}>{fmt(copayPend)}</span></div>}
              {insPend===0&&copayPend===0&&<div style={{color:'#16a34a',fontWeight:700,textAlign:'center'}}>✓ Fully settled</div>}
            </div>
          </div>)
        })}
      </>)
    })()}
    <SecL>Doctor referrals</SecL>
    <ReferralsReport db={db} income={dI} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs} actions={actions}/>
  </>)
}


const PatientDataReport=({db})=>{
  const [search,setSearch]=useState('')
  const [filterArea,setFilterArea]=useState('')
  const [filterRef,setFilterRef]=useState('')
  const [filterCond,setFilterCond]=useState('')
  const [showFilters,setShowFilters]=useState(false)

  const patMap={}
  ;(db.income||[]).forEach(e=>{
    if(!e.patient_name)return
    const k=(e.patient_name||'').trim().toLowerCase()
    if(!k)return
    if(!patMap[k])patMap[k]={name:(e.patient_name||'').trim(),phone:'',area:'',ref_doctor:'',reg_no:'',visits:0,lastVisit:'',conditions:[]}
    patMap[k].visits++
    if((e.date||'')>(patMap[k].lastVisit||''))patMap[k].lastVisit=e.date||''
    if(!patMap[k].phone&&e.patient_phone)patMap[k].phone=e.patient_phone
    if(!patMap[k].area&&e.patient_area)patMap[k].area=e.patient_area
    if(!patMap[k].ref_doctor&&e.ref_doctor)patMap[k].ref_doctor=e.ref_doctor
    if(!patMap[k].reg_no&&e.reg_no)patMap[k].reg_no=e.reg_no
    ;(e.conditions||'').split(',').filter(Boolean).forEach(cd=>{if(!patMap[k].conditions.includes(cd.trim()))patMap[k].conditions.push(cd.trim())})
  })
  ;(db.ip_patients||[]).forEach(p=>{
    const k=(p.name||'').trim().toLowerCase()
    if(!k)return
    if(!patMap[k])patMap[k]={name:(p.name||'').trim(),phone:'',area:'',ref_doctor:'',reg_no:'',visits:0,lastVisit:'',conditions:[]}
    if(!patMap[k].phone&&p.phone)patMap[k].phone=p.phone
    if(!patMap[k].area&&p.patient_area)patMap[k].area=p.patient_area
    if(!patMap[k].ref_doctor&&p.ref_doctor)patMap[k].ref_doctor=p.ref_doctor
    if(!patMap[k].reg_no&&p.reg_no)patMap[k].reg_no=p.reg_no
    ;(p.diagnosis||'').split(',').filter(Boolean).forEach(cd=>{const t=cd.trim();if(t&&!patMap[k].conditions.includes(t))patMap[k].conditions.push(t)})
  })

  let pats=Object.values(patMap).sort((a,b)=>(a.name||'').localeCompare(b.name||''))
  const areas=[...new Set(pats.map(p=>p.area).filter(Boolean))].sort()
  const refs=[...new Set(pats.map(p=>p.ref_doctor).filter(Boolean))].sort()
  const allConds=[...new Set(pats.flatMap(p=>p.conditions||[]))].sort()

  if(search.trim().length>1){const s=search.trim().toLowerCase();pats=pats.filter(p=>(p.name||'').toLowerCase().includes(s)||(p.phone||'').includes(s)||(p.reg_no||'').toLowerCase().includes(s))}
  if(filterArea)pats=pats.filter(p=>p.area===filterArea)
  if(filterRef)pats=pats.filter(p=>p.ref_doctor===filterRef)
  if(filterCond)pats=pats.filter(p=>(p.conditions||[]).includes(filterCond))

  const activeFilters=[filterArea,filterRef,filterCond].filter(Boolean).length

  return(<>
    <div style={{display:'flex',gap:6,marginBottom:8,flexWrap:'wrap',alignItems:'center'}}>
      <input placeholder="🔍 Search name / phone / reg no" value={search} onChange={e=>setSearch(e.target.value)}
        style={{flex:'1 1 160px',padding:'9px 12px',border:'1px solid #e2e8f0',borderRadius:10,fontSize:13,outline:'none'}}/>
      <button onClick={()=>setShowFilters(f=>!f)} style={{padding:'9px 14px',border:'1px solid #e2e8f0',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',
        background:activeFilters>0?'#1a1a2e':'#fff',color:activeFilters>0?'#c9a84c':'#555'}}>
        ⚙ Filters{activeFilters>0?` (${activeFilters})`:''}
      </button>
      {activeFilters>0&&<button onClick={()=>{setFilterArea('');setFilterRef('');setFilterCond('')}} style={{padding:'9px 10px',background:'#fef2f2',color:'#dc2626',border:'1px solid #fecaca',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer'}}>✕</button>}
    </div>
    {showFilters&&<div style={{background:'#f8fafc',border:'1px solid #e2e8f0',borderRadius:10,padding:'12px',marginBottom:10,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
      <div>
        <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Area</div>
        <select value={filterArea} onChange={e=>setFilterArea(e.target.value)} style={{width:'100%',padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:12,background:'#fff'}}>
          <option value="">All Areas</option>{areas.map(a=><option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div>
        <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Ref Doctor</div>
        <select value={filterRef} onChange={e=>setFilterRef(e.target.value)} style={{width:'100%',padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:12,background:'#fff'}}>
          <option value="">All Doctors</option>{refs.map(r=><option key={r} value={r}>Dr. {r}</option>)}
        </select>
      </div>
      <div style={{gridColumn:'1/-1'}}>
        <div style={{fontSize:10,color:'#94a3b8',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Condition / Diagnosis</div>
        <select value={filterCond} onChange={e=>setFilterCond(e.target.value)} style={{width:'100%',padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:8,fontSize:12,background:'#fff'}}>
          <option value="">All Conditions</option>{allConds.map(cd=><option key={cd} value={cd}>{cd}</option>)}
        </select>
      </div>
    </div>}
    <div style={{fontSize:12,color:'#64748b',marginBottom:8,fontWeight:600}}>{pats.length} patients found</div>
    <div style={{overflowX:'auto'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
        <thead><tr style={{background:'#1a1a2e',color:'#fff'}}>
          <th style={{padding:'8px 10px',textAlign:'left',fontWeight:700,whiteSpace:'nowrap'}}>Name / Reg</th>
          <th style={{padding:'8px 10px',textAlign:'left',fontWeight:700}}>Phone</th>
          <th style={{padding:'8px 10px',textAlign:'left',fontWeight:700}}>Area</th>
          <th style={{padding:'8px 10px',textAlign:'left',fontWeight:700}}>Ref Doctor</th>
          <th style={{padding:'8px 10px',textAlign:'left',fontWeight:700}}>Conditions</th>
          <th style={{padding:'8px 6px',textAlign:'center',fontWeight:700}}>Visits</th>
          <th style={{padding:'8px 10px',textAlign:'left',fontWeight:700,whiteSpace:'nowrap'}}>Last Visit</th>
        </tr></thead>
        <tbody>
          {pats.map((p,i)=>(
            <tr key={i} style={{background:i%2===0?'#fff':'#f8fafc',borderBottom:'1px solid #f0f0f0'}}>
              <td style={{padding:'8px 10px'}}>
                <div style={{fontWeight:700,color:'#111'}}>{p.name}</div>
                {p.reg_no&&<div style={{fontSize:10,color:'#94a3b8'}}>{p.reg_no}</div>}
              </td>
              <td style={{padding:'8px 10px',color:'#555'}}>{p.phone||'—'}</td>
              <td style={{padding:'8px 10px',color:'#555'}}>{p.area||'—'}</td>
              <td style={{padding:'8px 10px',color:p.ref_doctor?'#d97706':'#ccc',fontWeight:p.ref_doctor?600:400}}>
                {p.ref_doctor?'Dr. '+p.ref_doctor:'Self'}
              </td>
              <td style={{padding:'8px 10px'}}>
                <div style={{display:'flex',gap:4,flexWrap:'wrap'}}>
                  {(p.conditions||[]).length>0
                    ?(p.conditions||[]).map(cd=><span key={cd} style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#f0fdf4',color:'#16a34a',fontWeight:700,display:'inline-block'}}>{cd}</span>)
                    :<span style={{color:'#ccc',fontSize:12}}>—</span>
                  }
                </div>
              </td>
              <td style={{padding:'8px 6px',textAlign:'center',fontWeight:700,color:'#1d4ed8'}}>{p.visits}</td>
              <td style={{padding:'8px 10px',color:'#555',fontSize:12,whiteSpace:'nowrap'}}>{p.lastVisit?fmtD(p.lastVisit):'—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>)
}


const ProfitReport=({db})=>{
  const today=new Date().toISOString().slice(0,10)
  const firstOfMonth=today.slice(0,8)+'01'
  const [from,setFrom]=useState(firstOfMonth)
  const [to,setTo]=useState(today)
  const [periodPreset,setPeriodPreset]=useState('month')
  
  const setPreset=(k)=>{
    setPeriodPreset(k)
    const t=new Date()
    if(k==='today'){setFrom(today);setTo(today)}
    else if(k==='week'){const d=new Date();d.setDate(d.getDate()-7);setFrom(d.toISOString().slice(0,10));setTo(today)}
    else if(k==='month'){setFrom(firstOfMonth);setTo(today)}
    else if(k==='year'){setFrom(today.slice(0,4)+'-01-01');setTo(today)}
  }
  
  const inRange=d=>d>=from&&d<=to
  const periodInc=db.income.filter(e=>inRange(e.date))
  const periodExp=db.expenses.filter(e=>inRange(e.date))
  
  // Revenue: paid + credit (the BILLED amount, what hospital earned)
  // Actually for profit we want REALIZED revenue: billed - written off - discount
  const billedRev=periodInc.filter(e=>e.payment!=='discount'&&e.payment!=='written_off').reduce((a,e)=>a+(e.amount||0),0)
  const realizedRev=periodInc.filter(e=>e.payment!=='credit'&&e.payment!=='discount'&&e.payment!=='written_off').reduce((a,e)=>a+(e.amount||0),0)
  const creditOutstanding=periodInc.filter(e=>e.payment==='credit').reduce((a,e)=>a+(e.amount||0),0)
  const discountGiven=periodInc.filter(e=>e.payment==='discount').reduce((a,e)=>a+(e.amount||0),0)
  const writtenOff=periodInc.filter(e=>e.payment==='written_off').reduce((a,e)=>a+(e.amount||0),0)
  
  // Costs
  const totalExp=periodExp.reduce((a,e)=>a+(e.amount||0),0)
  const totalComm=periodInc.reduce((a,e)=>a+getComm(e),0)
  const totalConsult=periodInc.reduce((a,e)=>a+(e.consultant_fee||0),0)
  
  const grossProfit=billedRev-totalComm-totalConsult
  const netProfit=grossProfit-totalExp
  const netMargin=billedRev>0?(netProfit/billedRev*100):0
  
  // Service-line P&L
  const TYPE_LABELS={op:'OP Consultations',opd:'OPD',op_p:'OP Procedures',op_r:'OP Pharmacy',op_l:'OP Lab',op_dm:'OP Discharge Med',ip:'IP Charges',ip_r:'IP Pharmacy',ip_l:'IP Lab',ip_p:'IP Package',vc:'Visiting Consultant'}
  const lines={}
  periodInc.forEach(e=>{
    if(!lines[e.type])lines[e.type]={rev:0,comm:0,consult:0,count:0}
    if(e.payment!=='discount'&&e.payment!=='written_off')lines[e.type].rev+=e.amount||0
    lines[e.type].comm+=getComm(e)
    lines[e.type].consult+=e.consultant_fee||0
    lines[e.type].count++
  })
  const linesSorted=Object.entries(lines).map(([t,d])=>({type:t,label:TYPE_LABELS[t]||t,...d,net:d.rev-d.comm-d.consult})).sort((a,b)=>b.net-a.net)
  
  // Doctor profitability
  const docMap={}
  periodInc.forEach(e=>{
    if(!e.ref_doctor)return
    if(!docMap[e.ref_doctor])docMap[e.ref_doctor]={rev:0,comm:0,count:0}
    if(e.payment!=='discount'&&e.payment!=='written_off')docMap[e.ref_doctor].rev+=e.amount||0
    docMap[e.ref_doctor].comm+=getComm(e)
    docMap[e.ref_doctor].count++
  })
  const docsSorted=Object.entries(docMap).map(([n,d])=>({name:n,...d,net:d.rev-d.comm})).sort((a,b)=>b.net-a.net)
  
  const tot=billedRev||1
  
  return(<div>
    <SecL>💰 Profit Analysis</SecL>
    
    {/* Period selector */}
    <Card style={{marginBottom:14}}>
      <div style={{display:'flex',gap:6,marginBottom:10,flexWrap:'wrap'}}>
        {[{k:'today',l:'Today'},{k:'week',l:'7 days'},{k:'month',l:'This month'},{k:'year',l:'This year'},{k:'custom',l:'Custom'}].map(p=>(
          <button key={p.k} onClick={()=>setPreset(p.k)} style={{padding:'7px 14px',borderRadius:20,border:periodPreset===p.k?'none':'1.5px solid #e2e8f0',background:periodPreset===p.k?'#1a1a2e':'#fff',color:periodPreset===p.k?'#c9a84c':'#475569',fontSize:12,fontWeight:700,cursor:'pointer'}}>{p.l}</button>
        ))}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
        <div><label style={{fontSize:10,color:'#64748b',fontWeight:700,display:'block',marginBottom:2}}>From</label>
          <input type="date" value={from} onChange={e=>{setFrom(e.target.value);setPeriodPreset('custom')}} style={{width:'100%',padding:'7px 10px',border:'1.5px solid #cbd5e1',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none'}}/>
        </div>
        <div><label style={{fontSize:10,color:'#64748b',fontWeight:700,display:'block',marginBottom:2}}>To</label>
          <input type="date" value={to} onChange={e=>{setTo(e.target.value);setPeriodPreset('custom')}} style={{width:'100%',padding:'7px 10px',border:'1.5px solid #cbd5e1',borderRadius:8,fontSize:13,boxSizing:'border-box',outline:'none'}}/>
        </div>
      </div>
    </Card>
    
    {/* HERO NET PROFIT */}
    <Card style={{marginBottom:14,background:netProfit>=0?'linear-gradient(135deg,#16a34a,#15803d)':'linear-gradient(135deg,#dc2626,#991b1b)',color:'#fff',padding:'22px 20px'}}>
      <div style={{fontSize:12,fontWeight:700,opacity:.9,textTransform:'uppercase',letterSpacing:'.5px'}}>NET PROFIT</div>
      <div style={{fontSize:36,fontWeight:900,marginTop:6,letterSpacing:'-1px'}}>{fmt(netProfit)}</div>
      <div style={{display:'flex',gap:16,marginTop:10,fontSize:12,fontWeight:600,opacity:.95}}>
        <span>Margin: <strong style={{fontSize:14}}>{netMargin.toFixed(1)}%</strong></span>
        <span>on Rs {(billedRev/1000).toFixed(1)}K revenue</span>
      </div>
    </Card>
    
    {/* P&L BREAKDOWN */}
    <SecL>Profit & Loss breakdown</SecL>
    <Card style={{marginBottom:14}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
        <tbody>
          <tr style={{borderBottom:'1px solid #f0f0f0'}}><td style={{padding:'8px 0',color:'#0f172a',fontWeight:600}}>Total Revenue (billed)</td><td style={{textAlign:'right',padding:'8px 0',fontWeight:700,color:'#16a34a'}}>{fmt(billedRev)}</td></tr>
          <tr style={{borderBottom:'1px solid #f0f0f0',fontSize:11,color:'#64748b'}}><td style={{padding:'4px 0 4px 12px'}}>↳ Realized (cash/UPI/card)</td><td style={{textAlign:'right',padding:'4px 0'}}>{fmt(realizedRev)}</td></tr>
          <tr style={{borderBottom:'1px solid #f0f0f0',fontSize:11,color:'#64748b'}}><td style={{padding:'4px 0 4px 12px'}}>↳ Credit outstanding</td><td style={{textAlign:'right',padding:'4px 0'}}>{fmt(creditOutstanding)}</td></tr>
          {discountGiven>0&&<tr style={{borderBottom:'1px solid #f0f0f0',fontSize:11,color:'#dc2626'}}><td style={{padding:'4px 0 4px 12px'}}>↳ Discounts given</td><td style={{textAlign:'right',padding:'4px 0'}}>−{fmt(discountGiven)}</td></tr>}
          {writtenOff>0&&<tr style={{borderBottom:'1px solid #f0f0f0',fontSize:11,color:'#dc2626'}}><td style={{padding:'4px 0 4px 12px'}}>↳ Written off</td><td style={{textAlign:'right',padding:'4px 0'}}>−{fmt(writtenOff)}</td></tr>}
          <tr style={{borderBottom:'1px solid #f0f0f0'}}><td style={{padding:'8px 0',color:'#dc2626'}}>Referral commissions</td><td style={{textAlign:'right',padding:'8px 0',color:'#dc2626',fontWeight:700}}>−{fmt(totalComm)}</td></tr>
          <tr style={{borderBottom:'1px solid #f0f0f0'}}><td style={{padding:'8px 0',color:'#dc2626'}}>Consultant fees</td><td style={{textAlign:'right',padding:'8px 0',color:'#dc2626',fontWeight:700}}>−{fmt(totalConsult)}</td></tr>
          <tr style={{borderBottom:'2px solid #1a1a2e',borderTop:'1px solid #e2e8f0'}}><td style={{padding:'10px 0',color:'#1a1a2e',fontWeight:800}}>Gross Profit</td><td style={{textAlign:'right',padding:'10px 0',fontWeight:800,color:'#1a1a2e'}}>{fmt(grossProfit)}</td></tr>
          <tr style={{borderBottom:'1px solid #f0f0f0'}}><td style={{padding:'8px 0',color:'#dc2626'}}>Operating expenses</td><td style={{textAlign:'right',padding:'8px 0',color:'#dc2626',fontWeight:700}}>−{fmt(totalExp)}</td></tr>
          <tr style={{background:netProfit>=0?'#f0fdf4':'#fef2f2'}}><td style={{padding:'12px 8px',fontWeight:900,fontSize:15,color:netProfit>=0?'#15803d':'#991b1b'}}>NET PROFIT</td><td style={{textAlign:'right',padding:'12px 8px',fontWeight:900,fontSize:15,color:netProfit>=0?'#15803d':'#991b1b'}}>{fmt(netProfit)}</td></tr>
        </tbody>
      </table>
    </Card>
    
    {/* SERVICE LINE P&L */}
    {linesSorted.length>0&&<>
      <SecL>Profit by service line</SecL>
      <Card style={{marginBottom:14}}>
        {linesSorted.map((l,i)=>{
          const pct=tot>0?(l.rev/tot*100):0
          const netPct=l.rev>0?(l.net/l.rev*100):0
          return(<div key={l.type} style={{padding:'10px 0',borderBottom:i<linesSorted.length-1?'1px solid #f1f5f9':'none'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:4}}>
              <div style={{fontSize:13,fontWeight:700,color:'#1a1a2e'}}>{l.label}</div>
              <div style={{fontSize:14,fontWeight:800,color:l.net>=0?'#15803d':'#dc2626'}}>{fmt(l.net)}</div>
            </div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:10,color:'#64748b'}}>
              <span>Rev: {fmt(l.rev)} · {l.count} entries</span>
              <span>{netPct.toFixed(1)}% margin</span>
            </div>
            <div style={{height:4,background:'#f1f5f9',borderRadius:2,marginTop:6,overflow:'hidden'}}>
              <div style={{width:pct+'%',height:'100%',background:l.net>=0?'linear-gradient(90deg,#16a34a,#22c55e)':'#dc2626'}}/>
            </div>
          </div>)
        })}
      </Card>
    </>}
    
    {/* DOCTOR PROFITABILITY */}
    {docsSorted.length>0&&<>
      <SecL>Net contribution by referring doctor</SecL>
      <div style={{fontSize:11,color:'#64748b',marginBottom:8}}>Revenue from doctor's patients minus commission paid to them</div>
      <Card style={{marginBottom:14}}>
        {docsSorted.slice(0,15).map((d,i)=>{
          const pct=d.rev>0?(d.net/d.rev*100):0
          return(<div key={d.name} style={{padding:'10px 0',borderBottom:i<Math.min(docsSorted.length,15)-1?'1px solid #f1f5f9':'none',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:13,fontWeight:700,color:'#1a1a2e'}}>Dr. {d.name}</div>
              <div style={{fontSize:10,color:'#64748b',marginTop:2}}>Rev: {fmt(d.rev)} · Comm: {fmt(d.comm)} · {d.count} entries</div>
            </div>
            <div style={{textAlign:'right'}}>
              <div style={{fontSize:14,fontWeight:800,color:'#15803d'}}>{fmt(d.net)}</div>
              <div style={{fontSize:10,color:'#64748b'}}>{pct.toFixed(0)}% kept</div>
            </div>
          </div>)
        })}
        {docsSorted.length>15&&<div style={{fontSize:11,color:'#94a3b8',textAlign:'center',padding:8}}>+ {docsSorted.length-15} more doctors</div>}
      </Card>
    </>}
    
    {/* INSIGHTS / LEAKAGE ALERTS */}
    {(discountGiven>0||writtenOff>0||creditOutstanding>billedRev*0.2)&&<>
      <SecL>⚠️ Revenue leakage alerts</SecL>
      <Card style={{marginBottom:14,background:'#fffbeb',border:'1.5px solid #fde68a'}}>
        {creditOutstanding>billedRev*0.2&&<div style={{padding:'8px 0',borderBottom:'1px dashed #fde68a',fontSize:12,color:'#92400e'}}>
          <strong>High credit balance:</strong> {(creditOutstanding/billedRev*100).toFixed(0)}% of period revenue ({fmt(creditOutstanding)}) is in credit. Consider collection drive.
        </div>}
        {discountGiven>0&&<div style={{padding:'8px 0',borderBottom:writtenOff>0?'1px dashed #fde68a':'none',fontSize:12,color:'#92400e'}}>
          <strong>Discounts given:</strong> {fmt(discountGiven)} ({(discountGiven/billedRev*100).toFixed(1)}% of revenue) — review if discount policy is being followed.
        </div>}
        {writtenOff>0&&<div style={{padding:'8px 0',fontSize:12,color:'#92400e'}}>
          <strong>Written off:</strong> {fmt(writtenOff)} — these are pure losses. Investigate root cause.
        </div>}
      </Card>
    </>}
    
  </div>)
}

const RepTab=({db,rv,setRv,rd,setRd,rm,setRm,ry,setRy,gotoIP,gotoOP,actions,hospital,canSeeReports})=>{
  const [timelinePid,setTimelinePid]=useState(null)
  const [timelineSelPid,setTimelineSelPid]=useState('')
  const [timelineSearch,setTimelineSearch]=useState('')
  const [vcPer,setVcPer]=useState('month')
  const [customFrom,setCustomFrom]=useState(todayStr().slice(0,7)+'-01')
  const [customTo,setCustomTo]=useState(todayStr())
  const yrs=[...new Set([...db.income,...db.expenses].map(e=>e.date?.slice(0,4)))].filter(Boolean).sort().reverse()
  if(!yrs.includes(ry))yrs.unshift(ry)
  const allPaidComm=useMemo(()=>db.expenses.filter(e=>e.category==='ref_paid'),[db.expenses])
  const RVTABS=[{k:'daily',l:'Daily'},{k:'monthly',l:'Monthly'},{k:'yearly',l:'Yearly'},{k:'profit',l:'💰 Profit'},{k:'custom',l:'Custom'},{k:'referrals',l:'Referrals'},{k:'lostdrs',l:'Lost Doctors'},{k:'supplies',l:'Supplies'},{k:'insurance',l:'Insurance'},{k:'patlist',l:'Pat List'},{k:'timeline',l:'Timeline'},{k:'expenses',l:'Expenses'},{k:'realincome',l:'Real Income'},{k:'area',l:'Area-wise'},{k:'incomechart',l:'Income Chart'},{k:'patdata',l:'Patient Data'}]
  
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
      {rv==='monthly'&&(()=>{const mI=db.income.filter(e=>e.date?.startsWith(rm));const mE=db.expenses.filter(e=>e.date?.startsWith(rm));const exp=sumExp(mE);const rc=totalRef(mI);const pkg=getPkgPayments(db.ip_patients,rm);const days=[...new Set(mI.map(e=>e.date))].sort();const[yr,mo]=rm.split('-');return(<><input style={{...S.inp,marginBottom:12}} type="month" value={rm} onChange={e=>setRm(e.target.value)}/><div style={{fontSize:14,fontWeight:600,color:'#555',margin:'0 0 14px'}}>{MOFULL[parseInt(mo)-1]} {yr}</div><SegmentPL db={db} incList={mI} expList={mE} mtdIncList={mI} mtdExpList={mE} mtdTitle="Month net profit" mtdLabel={new Date(rm+'-01').toLocaleDateString('en-IN',{month:'long',year:'numeric'})}/><DatewiseNetCard incList={mI} expList={mE} dbRef={db.income}/><PLCards incList={mI} exp={exp} refComm={rc} pkgList={pkg}/>{days.length>0&&<VBarChart title="Daily revenue trend" data={days.map(d=>{const dI=db.income.filter(e=>e.date===d);return{label:d.slice(8),v1:cashTotal(dI),color:'#16a34a'}})}/>}<SecL>Income by source</SecL><IncT incList={mI}/><PatientBreakdown incList={mI} db={db} gotoIP={gotoIP} gotoOP={gotoOP} title="Patients this month" compact={true}/><SecL>Expenses</SecL><ExpT exp={exp}/><SecL>Referrals</SecL><ReferralsReport db={db} income={mI} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs} actions={actions}/></>)})()}
      {rv==='yearly'&&(()=>{const yI=db.income.filter(e=>e.date?.startsWith(ry));const yE=db.expenses.filter(e=>e.date?.startsWith(ry));const exp=sumExp(yE);const rc=totalRef(yI);const mons=[...new Set(yI.map(e=>e.date?.slice(0,7)))].sort();return(<><select style={{...S.sel,marginBottom:12}} value={ry} onChange={e=>setRy(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select><SegmentPL db={db} incList={yI} expList={yE} monthlyOf={ry}/><PLCards incList={yI} exp={exp} refComm={rc} pkgList={getPkgPayments(db.ip_patients,ry)}/>{mons.length>0&&<VBarChart title="Monthly revenue vs expenses" data={mons.map(ym=>{const mi=db.income.filter(e=>e.date?.startsWith(ym));const me=db.expenses.filter(e=>e.date?.startsWith(ym)&&e.category!=='ref_paid').reduce((a,e)=>a+e.amount,0);const[,m]=ym.split('-');return{label:MOS[parseInt(m)-1],v1:cashTotal(mi),v2:me,color:'#16a34a'}})}/>}<SecL>Income by source</SecL><IncT incList={yI}/><PatientBreakdown incList={yI} db={db} gotoIP={gotoIP} gotoOP={gotoOP} title="Patients this year" compact={true}/><SecL>Referrals</SecL><ReferralsReport db={db} income={yI} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs} actions={actions}/></>)})()}
      {rv==='custom'&&(()=>{const incList=db.income.filter(e=>e.date>=customFrom&&e.date<=customTo);const expList=db.expenses.filter(e=>e.date>=customFrom&&e.date<=customTo);const exp=sumExp(expList);const rc=totalRef(incList);const pkg=getPkgPayments(db.ip_patients,null).filter(py=>py.date>=customFrom&&py.date<=customTo);return(<><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:14}}><FInp label="From" type="date" value={customFrom} onChange={e=>setCustomFrom(e.target.value)}/><FInp label="To" type="date" value={customTo} onChange={e=>setCustomTo(e.target.value)}/></div><SegmentPL db={db} incList={incList} expList={expList}/><PLCards incList={incList} exp={exp} refComm={rc} pkgList={pkg}/><SecL>Income by source</SecL><IncT incList={incList}/><PatientBreakdown incList={incList} db={db} gotoIP={gotoIP} gotoOP={gotoOP} title="Patients in range" compact={false}/><SecL>Expenses</SecL><ExpT exp={exp}/><SecL>Referrals</SecL><ReferralsReport db={db} income={incList} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs} actions={actions}/></>)})()}
      {rv==='referrals'&&<ReferralsReport db={db} income={db.income} allPaid={allPaidComm} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs} actions={actions} hospital={hospital}/>}
      {rv==='patdata'&&<PatientDataReport db={db}/>}
      {rv==='patlist'&&(timelinePid?<PatientTimeline db={db} pid={timelinePid} onBack={()=>setTimelinePid(null)}/>:<PatientListReport db={db} gotoTimeline={pid=>setTimelinePid(pid)} canSeeReports={canSeeReports}/>)}
      {rv==='timeline'&&(timelineSelPid?<PatientTimeline db={db} pid={timelineSelPid} onBack={()=>{setTimelineSelPid('');setTimelineSearch('')}}/>:
          <TimelinePatientList db={db} onSelect={pid=>setTimelineSelPid(pid)} search={timelineSearch} setSearch={setTimelineSearch}/>
        )}
      {rv==='expenses'&&<ExpensesReport db={db} actions={actions}/>}
      {rv==='realincome'&&<RealIncomeReport db={db}/>}
      {rv==='area'&&<AreaReport db={db} rm={rm} setRm={setRm} ry={ry} setRy={setRy} yrs={yrs}/>}
      {rv==='insurance'&&<InsuranceReport db={db} actions={actions}/>}
      {rv==='lostdrs'&&<LostDoctorsReport db={db}/>}
      {rv==='supplies'&&<SuppliesReport db={db} actions={actions}/>}
      {rv==='incomechart'&&<IncomeChartReport db={db}/>}
      {rv==='profit'&&<ProfitReport db={db}/>}
    </div>
  )
}

/*  MAIN APP  */
/*  SLOW LOAD / MAINTENANCE WARNING  */
const SlowLoadWarning=()=>{
  const [showSlow,setShowSlow]=useState(false)
  const [showOffline,setShowOffline]=useState(!navigator.onLine)
  useEffect(()=>{
    const t=setTimeout(()=>setShowSlow(true),5000) // show after 5 sec
    const onOffline=()=>setShowOffline(true)
    const onOnline=()=>setShowOffline(false)
    window.addEventListener('offline',onOffline)
    window.addEventListener('online',onOnline)
    return()=>{clearTimeout(t);window.removeEventListener('offline',onOffline);window.removeEventListener('online',onOnline)}
  },[])
  if(showOffline)return(
    <div style={{background:'rgba(220,38,38,0.15)',border:'1px solid rgba(220,38,38,0.3)',borderRadius:14,padding:'16px 20px',maxWidth:320,textAlign:'center'}}>
      <div style={{fontSize:24,marginBottom:8}}>📡</div>
      <div style={{fontSize:14,fontWeight:700,color:'#fca5a5',marginBottom:6}}>No internet connection</div>
      <div style={{fontSize:12,color:'rgba(255,255,255,0.5)'}}>Please check your WiFi or mobile data and try again</div>
      <button onClick={()=>window.location.reload()} style={{marginTop:12,padding:'8px 20px',background:'#dc2626',border:'none',borderRadius:8,color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>Retry</button>
    </div>
  )
  const hardReset=()=>{
    try{
      // Clear all Supabase auth tokens + any cached app state (fixes stale/corrupt token hangs)
      Object.keys(localStorage).forEach(k=>{if(/^sb-|supabase|auth/i.test(k))localStorage.removeItem(k)})
      Object.keys(sessionStorage||{}).forEach(k=>{try{sessionStorage.removeItem(k)}catch(e){}})
    }catch(e){}
    window.location.reload()
  }
  if(showSlow)return(
    <div style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:14,padding:'16px 20px',maxWidth:340,textAlign:'center'}}>
      <div style={{fontSize:24,marginBottom:8}}>☕</div>
      <div style={{fontSize:13,fontWeight:700,color:'rgba(255,255,255,0.8)',marginBottom:6}}>Taking longer than usual...</div>
      <div style={{fontSize:12,color:'rgba(255,255,255,0.4)',marginBottom:14}}>The server is waking up. Usually ready in 10-15 seconds. If it stays stuck, tap Reset &amp; reload below.</div>
      <div style={{display:'flex',gap:8,justifyContent:'center'}}>
        <button onClick={()=>window.location.reload()} style={{padding:'8px 18px',background:'rgba(0,192,107,0.2)',border:'1px solid rgba(0,192,107,0.3)',borderRadius:8,color:'#00c06b',fontSize:13,fontWeight:700,cursor:'pointer'}}>Refresh</button>
        <button onClick={hardReset} style={{padding:'8px 18px',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.35)',borderRadius:8,color:'#fca5a5',fontSize:13,fontWeight:700,cursor:'pointer'}}>Reset &amp; reload</button>
      </div>
      <div style={{fontSize:10,color:'rgba(255,255,255,0.3)',marginTop:10}}>Reset clears saved login and fixes stuck screens</div>
    </div>
  )
  return null
}


const REF_COLORS={ip:{bg:'#dbeafe',border:'#3b82f6',color:'#1d4ed8',name:'IP Charges'},ip_r:{bg:'#dcfce7',border:'#16a34a',color:'#15803d',name:'IP Pharmacy'},ip_l:{bg:'#ffedd5',border:'#f59e0b',color:'#c2410c',name:'IP Lab'},lab:{bg:'#ffedd5',border:'#f59e0b',color:'#c2410c',name:'Lab'},ip_p:{bg:'#f3e8ff',border:'#8b5cf6',color:'#6d28d9',name:'IP Package'},op:{bg:'#fce7f3',border:'#ec4899',color:'#be185d',name:'OP'},op_r:{bg:'#d1fae5',border:'#10b981',color:'#047857',name:'OP Pharmacy'},op_l:{bg:'#fed7aa',border:'#ea580c',color:'#9a3412',name:'OP Lab'},op_p:{bg:'#fef3c7',border:'#eab308',color:'#854d0e',name:'OP Procedure'},op_dm:{bg:'#fce7f3',border:'#ec4899',color:'#be185d',name:'OP Discharge Med'},vc:{bg:'#e0e7ff',border:'#4f46e5',color:'#3730a3',name:'VC'},custom:{bg:'#e5e7eb',border:'#6b7280',color:'#374151',name:'Other'}}

const ReferralReportModal=({entries,docName,patientName,hospital,onClose})=>{
  const [items,setItems]=useState(()=>(entries||[]).map((e,i)=>({
    id:'e'+i,
    type:e.type||'custom',
    desc:(e.patient_name||'')+(e.type?' - '+(ITYPES.find(t=>t.key===e.type)?.full||e.type):''),
    date:e.date||todayStr(),
    amount:e.amount||0,
    commPct:e.custom_commission!=null?parseFloat(e.custom_commission):((COMM[e.type]||0)*100),
    isCustom:false
  })))
  const [refDocName,setRefDocName]=useState(docName||'')
  const [reportDate,setReportDate]=useState(todayStr())
  const [notes,setNotes]=useState('')
  const addItem=()=>setItems([...items,{id:'c'+Date.now(),type:'custom',desc:'',date:todayStr(),amount:0,commPct:0,isCustom:true}])
  const updItem=(id,f,v)=>setItems(items.map(it=>it.id===id?{...it,[f]:v}:it))
  const rmItem=id=>{if(window.confirm('Remove this line item?'))setItems(items.filter(it=>it.id!==id))}
  const calc=it=>it.isCustom?(parseFloat(it.amount)||0):Math.round((parseFloat(it.amount)||0)*(parseFloat(it.commPct)||0)/100)
  const totalRef=items.reduce((a,it)=>a+calc(it),0)
  const totalBill=items.reduce((a,it)=>a+(parseFloat(it.amount)||0),0)
  const [adjTarget,setAdjTarget]=useState('')
  // LIVE auto-scaling: whatever amount is entered, every line scales proportionally (percentages unchanged)
  const getScaled=()=>{
    const target=parseFloat(adjTarget)
    if(!target||target<=0||totalRef<=0)return{list:items,active:false,scaledRef:totalRef,scaledBill:totalBill}
    const f=target/totalRef
    let next=items.map(it=>({...it,amount:Math.round((parseFloat(it.amount)||0)*f)}))
    const ncalc=it=>it.isCustom?(parseFloat(it.amount)||0):Math.round((parseFloat(it.amount)||0)*(parseFloat(it.commPct)||0)/100)
    let diff=Math.round(target)-next.reduce((a,it)=>a+ncalc(it),0)
    if(diff!==0){
      const idx=next.reduce((best,it,i)=>{const p=parseFloat(it.commPct)||0;if(!it.isCustom&&p>0&&(best<0||(parseFloat(it.amount)||0)>(parseFloat(next[best].amount)||0)))return i;return best},-1)
      if(idx>=0){const p=(parseFloat(next[idx].commPct)||0)/100;next[idx]={...next[idx],amount:Math.round((parseFloat(next[idx].amount)||0)+diff/p)}}
      else{const ci=next.findIndex(it=>it.isCustom);if(ci>=0)next[ci]={...next[ci],amount:(parseFloat(next[ci].amount)||0)+diff}}
    }
    return{list:next,active:true,scaledRef:next.reduce((a,it)=>a+ncalc(it),0),scaledBill:next.reduce((a,it)=>a+(parseFloat(it.amount)||0),0)}
  }
  const scaled=getScaled()
  
  const genPDF=()=>{
    const pdfItems=scaled.list
    const grouped={}
    pdfItems.forEach(it=>{
      let t=it.type||'custom'
      // Combine OP Lab + IP Lab into single 'lab' group
      if(t==='op_l'||t==='ip_l')t='lab'
      if(!grouped[t])grouped[t]={items:[],totalAmt:0,totalComm:0}
      grouped[t].items.push(it)
      grouped[t].totalAmt+=parseFloat(it.amount)||0
      grouped[t].totalComm+=calc(it)
    })
    const cards=Object.entries(grouped).map(([typeKey,grp],idx)=>{
      const col=REF_COLORS[typeKey]||REF_COLORS.custom
      const cnt=grp.items.length
      const breakdown=cnt>1&&typeKey==='custom'?grp.items.map(it=>{
        const cm=calc(it)
        return '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px dashed #e2e8f0;font-size:13px;gap:12px"><span style="color:#475569;font-weight:600;flex:1;min-width:0">'+(it.desc||'-')+'</span><span style="color:#1d4ed8;font-weight:700;white-space:nowrap">Rs '+((parseFloat(it.amount)||0).toLocaleString('en-IN'))+'</span><span style="color:#15803d;font-weight:800;min-width:90px;text-align:right;white-space:nowrap">Rs '+cm.toLocaleString('en-IN')+'</span></div>'
      }).join(''):''
      const avgPct=grp.totalAmt>0?Math.round(grp.totalComm*100/grp.totalAmt):0
      return '<div style="background:#fff;border:2px solid '+col.border+';border-radius:14px;margin-bottom:18px;overflow:hidden;page-break-inside:avoid">'
        + '<div style="background:'+col.bg+';padding:14px 22px;border-bottom:2px solid '+col.border+';display:flex;justify-content:space-between;align-items:center">'
        + '<div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0"><span style="background:'+col.color+';color:#fff;width:38px;height:38px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;flex-shrink:0">'+(idx+1)+'</span><div style="min-width:0;flex:1"><div style="font-size:17px;font-weight:900;color:'+col.color+';letter-spacing:1px">TOTAL '+col.name.toUpperCase()+'</div>'+(typeKey==='custom'&&cnt===1&&grp.items[0].desc?'<div style="font-size:13px;color:#475569;font-weight:700;margin-top:2px">'+grp.items[0].desc+'</div>':'')+'</div></div>'
        + (cnt>1?'<div style="font-size:12px;color:#475569;font-weight:700">'+cnt+' entries</div>':'')
        + '</div>'
        + (breakdown?'<div style="padding:14px 22px 4px;background:#fafafa">'+breakdown+'</div>':'')
        + '<div style="padding:18px 22px;display:flex;justify-content:space-between;align-items:center;gap:16px;border-top:'+(breakdown?'2px solid '+col.border:'none')+'">'
        + '<div><div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:1.2px">Total Bill</div><div style="font-size:26px;font-weight:900;color:#1d4ed8;margin-top:4px">Rs '+grp.totalAmt.toLocaleString('en-IN')+'</div></div>'
        + '<div style="text-align:center"><div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:1.2px">'+(cnt>1?'Avg Rate':'Rate')+'</div><div style="font-size:24px;font-weight:900;color:#475569;margin-top:4px">'+avgPct+'%</div></div>'
        + '<div style="text-align:right"><div style="font-size:11px;color:#15803d;text-transform:uppercase;font-weight:800;letter-spacing:1.2px">Referral</div><div style="font-size:34px;font-weight:900;color:#15803d;margin-top:4px;line-height:1">Rs '+grp.totalComm.toLocaleString('en-IN')+'</div></div>'
        + '</div>'
        + '</div>'
    }).join('')
    const hospName=((hospital&&hospital.name)||'HOSPITAL').toUpperCase()
    const hospCity=(hospital&&hospital.city)||''
    const hospPhone=hospital&&hospital.phone?'  Ph: '+hospital.phone:''
    const docFull='Dr. '+(refDocName||'-')
    const dateFull=new Date(reportDate).toLocaleDateString('en-IN',{weekday:'long',day:'2-digit',month:'long',year:'numeric'})
    const html='<!DOCTYPE html><html><head><title>Referral - '+refDocName+'</title><meta charset="utf-8"/>'
      +'<style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}'
      +'body{background:#fff;padding:36px;color:#0f172a;font-size:14px;line-height:1.45;max-width:780px;margin:0 auto}'
      +'@media print{body{padding:18px;max-width:none}.no-print{display:none!important}}'
      +'</style></head><body>'
      +'<div style="text-align:center;border-bottom:4px double #1a1a2e;padding-bottom:22px;margin-bottom:26px">'
      +'<div style="font-size:36px;font-weight:900;color:#1a1a2e;letter-spacing:3px;margin-bottom:6px">'+hospName+'</div>'
      +'<div style="font-size:14px;color:#64748b;letter-spacing:2px;font-weight:700">MULTI-SPECIALITY MEDICAL CENTRE</div>'
      +'<div style="height:4px;background:linear-gradient(90deg,#c9a84c,#f0d068,#c9a84c);margin:12px auto;width:60%;border-radius:2px"></div>'
      +'<div style="font-size:13px;color:#64748b;margin-top:8px;font-weight:600">'+hospCity+hospPhone+'</div>'
      +'</div>'
      +'<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:22px 28px;border-radius:14px;margin-bottom:24px;text-align:center">'
      +'<div style="font-size:26px;color:#c9a84c;letter-spacing:2px;font-weight:900">REFERRAL PAYMENT VOUCHER</div>'
      +'<div style="font-size:13px;color:#cbd5e1;font-weight:600;margin-top:4px">For services rendered to referred patient</div>'
      +'</div>'
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px">'
      +'<div style="background:#eff6ff;border:2px solid #3b82f6;padding:18px 22px;border-radius:12px"><div style="font-size:11px;color:#1d4ed8;font-weight:900;text-transform:uppercase;letter-spacing:1.5px">Paid to</div><div style="font-size:22px;font-weight:900;color:#1a1a2e;margin-top:6px">'+docFull+'</div></div>'
      +'<div style="background:#f0fdf4;border:2px solid #16a34a;padding:18px 22px;border-radius:12px"><div style="font-size:11px;color:#15803d;font-weight:900;text-transform:uppercase;letter-spacing:1.5px">Date</div><div style="font-size:18px;font-weight:900;color:#1a1a2e;margin-top:6px;line-height:1.3">'+dateFull+'</div></div>'
      +(patientName?'<div style="background:#faf5ff;border:2px solid #7c3aed;padding:18px 22px;border-radius:12px;grid-column:1/-1"><div style="font-size:11px;color:#6d28d9;font-weight:900;text-transform:uppercase;letter-spacing:1.5px">Patient</div><div style="font-size:22px;font-weight:900;color:#1a1a2e;margin-top:6px">'+patientName+'</div></div>':'')
      +'</div>'
      +'<div style="margin-bottom:24px"><div style="font-size:13px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px">Service Categories ('+Object.keys(grouped).length+')</div>'
      +cards
      +'</div>'
      +'<div style="background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);border:3px solid #16a34a;border-radius:16px;padding:30px 28px;margin:28px 0;box-shadow:0 8px 24px rgba(22,163,74,.2)">'
      +'<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;padding-bottom:18px;border-bottom:2px dashed #16a34a">'
      +'<div><div style="font-size:12px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:1.5px">Total Bill</div><div style="font-size:28px;font-weight:900;color:#1d4ed8;margin-top:4px">Rs '+(scaled.active?scaled.scaledBill:totalBill).toLocaleString('en-IN')+'</div></div>'
      +'<div style="text-align:right"><div style="font-size:12px;color:#64748b;font-weight:800;text-transform:uppercase;letter-spacing:1.5px">Items</div><div style="font-size:28px;font-weight:900;color:#475569;margin-top:4px">'+items.length+' entries</div></div>'
      +'</div>'
      +'<div style="text-align:center"><div style="font-size:14px;color:#15803d;font-weight:900;text-transform:uppercase;letter-spacing:3px;margin-bottom:10px">★ TOTAL REFERRAL PAYABLE ★</div>'
      +'<div style="font-size:60px;font-weight:900;color:#15803d;letter-spacing:1px;line-height:1">Rs '+(scaled.active?scaled.scaledRef:totalRef).toLocaleString('en-IN')+'</div>'
      +'<div style="margin-top:14px;font-size:15px;color:#374151;font-weight:700">To '+docFull+'</div></div>'
      +'</div>'
      +(notes?'<div style="background:#fffbeb;border:2px solid #fde68a;border-radius:12px;padding:18px 22px;margin-top:22px"><div style="font-size:12px;color:#a16207;font-weight:900;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px">Notes</div><div style="color:#451a03;font-size:15px;line-height:1.55;font-weight:500">'+notes.replace(/\n/g,'<br/>')+'</div></div>':'')
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:60px;padding-top:34px">'
      +'<div style="text-align:center"><div style="height:50px"></div><div style="border-top:2px solid #1a1a2e;padding-top:8px;font-size:12px;color:#64748b;font-weight:700">Authorised Signatory<br/><span style="color:#1a1a2e;font-weight:900;font-size:14px">'+((hospital&&hospital.name)||'Hospital')+'</span></div></div>'
      +'<div style="text-align:center"><div style="height:50px"></div><div style="border-top:2px solid #1a1a2e;padding-top:8px;font-size:12px;color:#64748b;font-weight:700">Received by<br/><span style="color:#1a1a2e;font-weight:900;font-size:14px">'+docFull+'</span></div></div>'
      +'</div>'
      +'<div style="margin-top:36px;padding-top:18px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;font-weight:500">Computer-generated voucher  ·  '+new Date().toLocaleString('en-IN')+'</div>'
      +'<div class="no-print" style="text-align:center;margin-top:36px"><button onclick="window.print()" style="padding:18px 56px;background:#16a34a;color:#fff;border:none;border-radius:12px;font-size:17px;font-weight:800;cursor:pointer;letter-spacing:.5px;box-shadow:0 6px 18px rgba(22,163,74,.35)">Print / Save as PDF</button></div>'
      +'</body></html>'
    const w=window.open('','_blank','width=900,height=1200')
    if(!w){alert('Please allow popups to view PDF');return}
    w.document.write(html)
    w.document.close()
  }
  
  return(
    <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.6)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:8}}>
      <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:680,maxHeight:'95vh',overflowY:'auto',padding:'20px 18px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14,paddingBottom:12,borderBottom:'2px solid #f1f5f9'}}>
          <div>
            <div style={{fontSize:17,fontWeight:800,color:'#1a1a2e'}}>Referral Payment</div>
            <div style={{fontSize:11,color:'#64748b'}}>Edit values, add items, then generate PDF</div>
          </div>
          <button onClick={onClose} style={{background:'#f3f4f6',border:'none',borderRadius:20,width:34,height:34,fontSize:18,cursor:'pointer'}}>×</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
          <div><label style={{fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',display:'block',marginBottom:4}}>Referring Doctor</label>
            <input type="text" value={refDocName} onChange={e=>setRefDocName(e.target.value)} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #e2e8f0',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
          </div>
          <div><label style={{fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',display:'block',marginBottom:4}}>Date</label>
            <input type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)} style={{width:'100%',padding:'9px 12px',border:'1.5px solid #e2e8f0',borderRadius:8,fontSize:13,outline:'none',boxSizing:'border-box'}}/>
          </div>
        </div>
        <div style={{marginBottom:10,fontSize:11,fontWeight:700,color:'#64748b',textTransform:'uppercase'}}>Line Items ({items.length})</div>
        {items.map(it=>{const col=REF_COLORS[it.type]||REF_COLORS.custom;return(
          <div key={it.id} style={{background:col.bg+'66',border:'1.5px solid '+col.border,borderRadius:10,padding:10,marginBottom:8}}>
        <div style={{background:'#fffbeb',border:'1px solid #fde68a',borderRadius:10,padding:'10px 12px',marginBottom:10}}>
          <div style={{fontSize:11,fontWeight:800,color:'#92400e',marginBottom:6}}>⚖️ Amount you are giving (auto-adjusts the statement)</div>
          <input type="number" inputMode="numeric" placeholder={'Leave empty to show calculated: '+Math.round(totalRef)} value={adjTarget} onChange={e=>setAdjTarget(e.target.value)} style={{width:'100%',padding:'10px 12px',border:'1.5px solid #fcd34d',borderRadius:8,fontSize:15,fontWeight:800,outline:'none',boxSizing:'border-box'}}/>
          {scaled.active&&<div style={{fontSize:11,color:'#166534',fontWeight:700,marginTop:8,background:'#f0fdf4',borderRadius:6,padding:'6px 10px'}}>✓ PDF will show: Bill total {fmt(scaled.scaledBill)} → Commission {fmt(scaled.scaledRef)} — every percentage unchanged</div>}
        </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
              <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:'#fff',color:col.color,fontWeight:700,border:'1px solid '+col.border}}>{col.name}</span>
              <button onClick={()=>rmItem(it.id)} style={{background:'#fee2e2',color:'#dc2626',border:'none',borderRadius:6,width:24,height:24,cursor:'pointer',fontWeight:700,fontSize:14}}>×</button>
            </div>
            <input type="text" value={it.desc} onChange={e=>updItem(it.id,'desc',e.target.value)} placeholder="Description" style={{width:'100%',padding:'6px 10px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:12,marginBottom:6,boxSizing:'border-box',background:'#fff'}}/>
            {it.isCustom&&<select value={it.type} onChange={e=>updItem(it.id,'type',e.target.value)} style={{width:'100%',padding:'6px 10px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:12,marginBottom:6,boxSizing:'border-box',background:'#fff'}}>
              {Object.entries(REF_COLORS).map(([k,v])=><option key={k} value={k}>{v.name}</option>)}
            </select>}
            <div style={{display:'grid',gridTemplateColumns:it.isCustom?'2fr 1.5fr':'2fr 1fr 1.5fr',gap:6}}>
              <div><label style={{fontSize:9,color:'#64748b',fontWeight:600}}>Amount (Rs)</label>
                <input type="number" value={it.amount} onChange={e=>updItem(it.id,'amount',e.target.value)} style={{width:'100%',padding:'6px 8px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:13,fontWeight:700,boxSizing:'border-box'}}/>
              </div>
              {!it.isCustom&&<div><label style={{fontSize:9,color:'#64748b',fontWeight:600}}>Rate %</label>
                <input type="number" value={it.commPct} onChange={e=>updItem(it.id,'commPct',e.target.value)} style={{width:'100%',padding:'6px 8px',border:'1px solid #e2e8f0',borderRadius:6,fontSize:13,fontWeight:700,boxSizing:'border-box'}}/>
              </div>}
              <div style={{textAlign:'right'}}>
                <label style={{fontSize:9,color:'#64748b',fontWeight:600}}>Referral</label>
                <div style={{padding:'6px 8px',background:'#fff',border:'1px solid '+col.border,borderRadius:6,fontSize:14,fontWeight:800,color:col.color}}>Rs {calc(it).toLocaleString('en-IN')}</div>
              </div>
            </div>
          </div>
        )})}
        <button onClick={addItem} style={{width:'100%',padding:'10px',background:'#f9fafb',border:'2px dashed #d1d5db',borderRadius:10,fontSize:13,fontWeight:700,color:'#374151',cursor:'pointer',marginBottom:10}}>+ Add Custom Item</button>
        <div><label style={{fontSize:10,fontWeight:700,color:'#64748b',textTransform:'uppercase',display:'block',marginBottom:4}}>Notes</label>
          <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Optional notes" rows={2} style={{width:'100%',padding:'8px 12px',border:'1.5px solid #e2e8f0',borderRadius:8,fontSize:12,resize:'vertical',boxSizing:'border-box',fontFamily:'inherit'}}/>
        </div>
        <div style={{background:'linear-gradient(135deg,#f0fdf4,#dcfce7)',border:'2px solid #16a34a',borderRadius:10,padding:'12px 16px',margin:'14px 0',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div><div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase'}}>Total Referral</div>
            <div style={{fontSize:24,color:'#15803d',fontWeight:900}}>Rs {(scaled.active?scaled.scaledRef:totalRef).toLocaleString('en-IN')}</div>
          </div>
          <div style={{textAlign:'right'}}><div style={{fontSize:10,color:'#1d4ed8',fontWeight:700,textTransform:'uppercase'}}>Bill Total</div>
            <div style={{fontSize:16,color:'#1d4ed8',fontWeight:700}}>Rs {(scaled.active?scaled.scaledBill:totalBill).toLocaleString('en-IN')}</div>
          </div>
        </div>
        <button onClick={genPDF} style={{width:'100%',padding:'14px',background:'linear-gradient(135deg,#1a1a2e,#16213e)',color:'#c9a84c',border:'none',borderRadius:12,fontSize:15,fontWeight:800,cursor:'pointer'}}>Generate Colorful PDF</button>
      </div>
    </div>
  )
}

export default function App(){
  const [session,setSession]=useState(null)
  const [profile,setProfile]=useState(null)
  const [recoveryMode,setRecoveryMode]=useState(()=>{try{const h=(window.location.hash||'')+(window.location.search||'');return /type=recovery/.test(h)}catch(e){return false}})
  const [newPwd,setNewPwd]=useState('')
  const [newPwd2,setNewPwd2]=useState('')
  const [pwdMsg,setPwdMsg]=useState('')
  const [pwdBusy,setPwdBusy]=useState(false)
  const [hospital,setHospital]=useState(null)
  const [isSuperAdmin,setIsSuperAdmin]=useState(false)
  const [previewHospital,setPreviewHospital]=useState(null)  // {hospital, db} - super admin preview mode
  const [editIPPatient,setEditIPPatient]=useState(null)
  const [showRegister,setShowRegister]=useState(false)
  const [showPayment,setShowPayment]=useState(()=>new URLSearchParams(window.location.search).get('upgrade')==='true'||sessionStorage.getItem('pendingUpgrade')==='1')
  const [loading,setLoading]=useState(()=>{try{return !/type=recovery/.test((window.location.hash||'')+(window.location.search||''))}catch(e){return true}})
  const [db,setDb]=useState({income:[],expenses:[],ip_patients:[],ref_doctors:[],consultants:[]})
  const [dbLoading,setDbLoading]=useState(false)
  const [tab,setTab]=useState('dash')
  const [tabInitialized,setTabInitialized]=useState(false)
  const [eDate,setEDate]=useState(todayStr())
  const [itype,setItype]=useState('op')
  const [iF,setIF]=useState({amount:'',pid:'',pname:'',ref:'',pay:'cash',notes:'',consultant_fee:0,consultant_name:'',phone:'',op_type:'New OP',custom_commission:'',patient_area:'',conditions:[],newCondition:'',splits:[{amount:'',mode:'cash'}]})
  const [ipv,setIpv]=useState('list')
  const [ipid,setIpid]=useState(null)
  const [pF,setPF]=useState({name:'',adm:todayStr(),dx:'',room:'',ref:'',is_package:false,phone:'',patient_type:'Regular',custom_commission:'',linkedRegNo:'',patient_area:'',admit_type:'cash',insurance_type:'',insurance_policy_no:'',insurance_expected:''})
  const [cF,setCF]=useState({date:todayStr(),type:'ip',amt:'',pay:'cash',notes:''})
  const [pyF,setPyF]=useState({date:todayStr(),amt:'',pay:'cash'})
  const [exD,setExD]=useState(todayStr())
  const [exF,setExF]=useState({cat:'water',amt:'',desc:'',pay:'cash',mon:false})
  const [rv,setRv]=useState('daily')
  const [rd,setRd]=useState(todayStr())
  const [rm,setRm]=useState(todayStr().slice(0,7))
  const [ry,setRy]=useState(todayStr().slice(0,4))

  useEffect(()=>{
    // Wake Supabase DB immediately (reduces cold start time)
    supabase.from('hospitals').select('id').limit(1).then(()=>{})
    const upgradeParam=new URLSearchParams(window.location.search).get('upgrade')==='true'||sessionStorage.getItem('pendingUpgrade')==='1'
    if(upgradeParam)sessionStorage.removeItem('pendingUpgrade')
    // If this is a password-recovery link, show the reset screen and do NOT run normal session load
    let isRecovery=false
    try{isRecovery=/type=recovery/.test((window.location.hash||'')+(window.location.search||''))}catch(e){}
    if(isRecovery){setRecoveryMode(true);setLoading(false)}
    let settled=false
    // Safety timeout: if getSession hangs (stale/corrupt token), stop waiting and show login
    const failsafe=setTimeout(()=>{if(!settled){settled=true;console.warn('Session load timed out — showing login');setSession(null);setLoading(false)}},10000)
    if(!isRecovery){
      supabase.auth.getSession().then(({data:{session}})=>{if(settled)return;settled=true;clearTimeout(failsafe);setSession(session);setLoading(false);if(session&&upgradeParam)setShowPayment(true)}).catch(()=>{if(settled)return;settled=true;clearTimeout(failsafe);setSession(null);setLoading(false)})
    }else{settled=true;clearTimeout(failsafe)}
    const {data:{subscription}}=supabase.auth.onAuthStateChange((evt,session)=>{if(evt==='PASSWORD_RECOVERY'){setRecoveryMode(true);setLoading(false);return};if(isRecovery)return;setSession(session);if(!session){setProfile(null);setHospital(null);setIsSuperAdmin(false)};setLoading(false);if(session&&upgradeParam)setShowPayment(true)})
    return()=>{clearTimeout(failsafe);subscription.unsubscribe()}
  },[])

  useEffect(()=>{
    if(!session)return
    let initDone=false
    // Failsafe: if any startup query hangs, stop the spinner so the user isn't stuck forever
    const initFailsafe=setTimeout(()=>{if(!initDone){console.warn('Post-login init timed out');setLoading(false)}},12000)
    const init=async()=>{
     try{
      const {data:sa,error:saErr}=await supabase.from('super_admins').select('id').eq('id',session.user.id).maybeSingle()
      if(saErr)console.warn('super_admins check error',saErr)
      if(sa){setIsSuperAdmin(true);initDone=true;clearTimeout(initFailsafe);setLoading(false);return}
      const {data:prof,error:pErr}=await supabase.from('profiles').select('*').eq('id',session.user.id).maybeSingle()
      if(pErr)console.warn('profile fetch error',pErr)
      if(!prof){setProfile(null);initDone=true;clearTimeout(initFailsafe);setLoading(false);alert('No profile found for this account. If you are the super admin, you should have landed on the dashboard — please contact support if this persists.');return}
      if(!prof?.hospital_id){setProfile(prof);initDone=true;clearTimeout(initFailsafe);setLoading(false);return}
      const hid=prof.hospital_id
      const [{data:hosp},[incR,expR,ptsR,rdsR,consR,empR,attR,salR]]=await Promise.all([
        supabase.from('hospitals').select('*').eq('id',hid).single(),
        Promise.all([
          supabase.from('income').select('id,date,type,amount,patient_id,patient_name,payment,ref_doctor,notes,consultant_fee,consultant_name,op_type,custom_commission,reg_no,patient_area,patient_phone,speciality,entered_by,conditions,created_at').eq('hospital_id',hid).order('date',{ascending:false}).limit(2000),
          supabase.from('expenses').select('id,date,category,amount,description,payment,is_monthly').eq('hospital_id',hid).order('date',{ascending:false}).limit(300),
          supabase.from('ip_patients').select('*').eq('hospital_id',hid).order('admission_date',{ascending:false}).limit(300),
          supabase.from('ref_doctors').select('*').eq('hospital_id',hid).order('name'),
          supabase.from('consultants').select('*').eq('hospital_id',hid).order('name'),
          supabase.from('employees').select('*').eq('hospital_id',hid).order('name'),
          supabase.from('attendance').select('*').eq('hospital_id',hid).order('date',{ascending:false}).limit(2000),
          supabase.from('salary_payments').select('*').eq('hospital_id',hid).order('paid_date',{ascending:false}).limit(500)
        ])
      ])
      setProfile(prof)
      setHospital(hosp)
      if(hosp&&!hosp.is_active){alert('Hospital suspended. Contact support.');await supabase.auth.signOut();return}
      setDb({income:incR.data||[],expenses:expR.data||[],ip_patients:ptsR.data||[],ref_doctors:rdsR.data||[],consultants:consR.data||[],employees:empR.data||[],attendance:attR.data||[],salary_payments:salR.data||[],hospital:hosp});try{CUSTOM_CAT_REG={};(Array.isArray(hosp?.custom_expense_cats)?hosp.custom_expense_cats:[]).forEach(cc=>{if(cc&&cc.key)CUSTOM_CAT_REG[cc.key]=cc.segment==='lab'?'lab':'clinical'})}catch(e){}
      initDone=true;clearTimeout(initFailsafe);setLoading(false)
      if(!tabInitialized){
        if(prof?.role==='admin'||prof?.role==='management')setTab('rep');else setTab('entry')
        setTabInitialized(true)
      }
     }catch(err){console.error('Init failed',err);initDone=true;clearTimeout(initFailsafe);setLoading(false);alert('Could not load data: '+(err?.message||err)+'\n\nTap Reset & reload if the screen is stuck.')}
    }
    init()
    return()=>clearTimeout(initFailsafe)
  },[session])

  const actions={
    addIncome:async row=>{const hid=profile?.hospital_id;if(!hid){alert('Hospital not loaded yet, please wait and try again');return false}const {data,error}=await supabase.from('income').insert([{...row,hospital_id:hid}]).select();if(error){alert('Save failed: '+error.message);return false}if(data)setDb(d=>({...d,income:[data[0],...d.income]}));return true},
    delIncome:async id=>{await supabase.from('income').delete().eq('id',id);setDb(d=>({...d,income:d.income.filter(e=>e.id!==id)}))},
    editIncome:async row=>{
      const updates={amount:row.amount,ref_doctor:row.ref_doctor||'',payment:row.payment||'cash',notes:row.notes||'',date:row.date,op_type:row.op_type||'',custom_commission:row.custom_commission??null,consultant_fee:row.consultant_fee??null,consultant_name:row.consultant_name||'',patient_area:row.patient_area||'',conditions:row.conditions??''}
      const safe={amount:updates.amount,ref_doctor:updates.ref_doctor,payment:updates.payment,notes:updates.notes,date:updates.date}
      let {error}=await supabase.from('income').update(updates).eq('id',row.id)
      if(error){
        // Retry with core fields only (schema cache issue)
        const r2=await supabase.from('income').update(safe).eq('id',row.id)
        error=r2.error
      }
      if(error){alert('Could not save: '+error.message);return false}
      // Always update local state optimistically (works even if RLS blocks select)
      setDb(d=>({...d,income:d.income.map(e=>e.id===row.id?{...e,...updates}:e)}))
      return true
    },
    addCustomCategory:async(cat)=>{const hid=profile?.hospital_id;if(!hid)return false;
      const cur=Array.isArray(hospital?.custom_expense_cats)?hospital.custom_expense_cats:[]
      if(cur.some(x=>x.key===cat.key)||ECATS.some(x=>x.key===cat.key)){return true}
      const next=[...cur,cat]
      const {error}=await supabase.from('hospitals').update({custom_expense_cats:next}).eq('id',hid)
      if(error){alert('Could not save category: '+error.message);return false}
      setHospital(h=>({...(h||{}),custom_expense_cats:next}))
      setDb(d=>({...d,hospital:{...(d.hospital||{}),custom_expense_cats:next}}))
      return true},
    addExpense:async row=>{const hid=profile?.hospital_id;if(!hid){alert('Hospital not loaded, please wait');return false}const {data,error}=await supabase.from('expenses').insert([{...row,hospital_id:hid}]).select();if(error){alert('Save failed: '+error.message);return false}if(data)setDb(d=>({...d,expenses:[data[0],...d.expenses]}));return true},
    delExpense:async id=>{await supabase.from('expenses').delete().eq('id',id);setDb(d=>({...d,expenses:d.expenses.filter(e=>e.id!==id)}))},
    updateExpense:async(id,updates)=>{await supabase.from('expenses').update(updates).eq('id',id);setDb(d=>({...d,expenses:d.expenses.map(e=>e.id===id?{...e,...updates}:e)}))},
    addEmployee:async row=>{const hid=profile?.hospital_id;const {data,error}=await supabase.from('employees').insert([{...row,hospital_id:hid}]).select();if(error){alert('Failed: '+error.message);return false}if(data)setDb(d=>({...d,employees:[...(d.employees||[]),data[0]].sort((a,b)=>a.name.localeCompare(b.name))}));return true},
    updateEmployee:async(id,updates)=>{const {error}=await supabase.from('employees').update(updates).eq('id',id);if(error){alert('Failed: '+error.message);return false}setDb(d=>({...d,employees:d.employees.map(e=>e.id===id?{...e,...updates}:e)}));return true},
    deleteEmployee:async id=>{const {error}=await supabase.from('employees').delete().eq('id',id);if(error){alert('Failed: '+error.message);return false}setDb(d=>({...d,employees:d.employees.filter(e=>e.id!==id)}));return true},
    markAttendance:async(empId,date,status)=>{const hid=profile?.hospital_id;
      const existing=(db.attendance||[]).find(a=>a.employee_id===empId&&a.date===date)
      if(existing){const {error}=await supabase.from('attendance').update({status}).eq('id',existing.id);if(error){alert('Failed: '+error.message);return false}setDb(d=>({...d,attendance:d.attendance.map(a=>a.id===existing.id?{...a,status}:a)}))}
      else{const {data,error}=await supabase.from('attendance').insert([{hospital_id:hid,employee_id:empId,date,status}]).select();if(error){alert('Failed: '+error.message);return false}if(data)setDb(d=>({...d,attendance:[data[0],...(d.attendance||[])]}))}
      return true},
    paySalary:async(emp,month,amount,paidDate,payment,notes)=>{const hid=profile?.hospital_id;
      const {data,error}=await supabase.from('salary_payments').insert([{hospital_id:hid,employee_id:emp.id,month,amount,paid_date:paidDate,payment:payment||'cash',notes:notes||''}]).select()
      if(error){alert('Failed: '+error.message);return false}
      if(data)setDb(d=>({...d,salary_payments:[data[0],...(d.salary_payments||[])]}))
      // Auto-create matching expense entry
      const {data:expData,error:expErr}=await supabase.from('expenses').insert([{hospital_id:hid,date:paidDate,category:'salary',amount,description:emp.name+' — '+month+' salary',payment:payment||'cash',is_monthly:false}]).select()
      if(!expErr&&expData)setDb(d=>({...d,expenses:[expData[0],...d.expenses]}))
      return true},
    deleteSalaryPayment:async id=>{const {error}=await supabase.from('salary_payments').delete().eq('id',id);if(error){alert('Failed: '+error.message);return false}setDb(d=>({...d,salary_payments:d.salary_payments.filter(s=>s.id!==id)}));return true},
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
    dischargePatient:async id=>{const {data}=await supabase.from('ip_patients').update({discharge_date:todayStr()}).eq('id',id).select();if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(p=>p.id===id?data[0]:p)}))},undoDischarge:async id=>{const {data,error}=await supabase.from('ip_patients').update({discharge_date:null}).eq('id',id).select();if(error){alert('Failed to undo discharge: '+error.message);return false}if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(p=>p.id===id?data[0]:p)}));return true},updateIPPatient:async(id,updates)=>{const {data,error}=await supabase.from('ip_patients').update(updates).eq('id',id).select();if(error){alert('Failed: '+error.message);return false}if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(p=>p.id===id?data[0]:p)}));return true},
    addPayment:async(pid,payment)=>{const p=db.ip_patients.find(x=>x.id===pid);const np=[...(p.payments||[]),payment];const {data}=await supabase.from('ip_patients').update({payments:np}).eq('id',pid).select();if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(x=>x.id===pid?data[0]:x)}))},
    deletePayment:async(pid,payid)=>{const p=db.ip_patients.find(x=>x.id===pid);const np=(p.payments||[]).filter(py=>py.id!==payid);const {data}=await supabase.from('ip_patients').update({payments:np}).eq('id',pid).select();if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(x=>x.id===pid?data[0]:x)}))},
    deletePatient:async id=>{await supabase.from('income').delete().eq('patient_id',id);await supabase.from('ip_patients').delete().eq('id',id);setDb(d=>({...d,ip_patients:d.ip_patients.filter(p=>p.id!==id),income:d.income.filter(e=>e.patient_id!==id)}))},
    addRefDoctor:async form=>{const hid=profile?.hospital_id;let {data,error}=await supabase.from('ref_doctors').insert([{...form,hospital_id:hid}]).select();if(error&&/column|schema/i.test(error.message)){const {op_pct,op_p_pct,...rest}=form;const r2=await supabase.from('ref_doctors').insert([{...rest,hospital_id:hid}]).select();data=r2.data;error=r2.error;if(!error)alert('Saved, but OP Consultation % / OP Procedure % were NOT saved.\n\nPlease run the add_op_procedure_pct.sql script in Supabase to enable these fields.')}if(error){alert('Save failed: '+error.message);return}if(data)setDb(d=>({...d,ref_doctors:[...d.ref_doctors,data[0]].sort((a,b)=>a.name.localeCompare(b.name))}))},
    updateRefDoctor:async(id,form)=>{let {data,error}=await supabase.from('ref_doctors').update(form).eq('id',id).select();if(error&&/column|schema/i.test(error.message)){const {op_pct,op_p_pct,...rest}=form;const r2=await supabase.from('ref_doctors').update(rest).eq('id',id).select();data=r2.data;error=r2.error;if(!error)alert('Saved, but OP Consultation % / OP Procedure % were NOT saved.\n\nPlease run the add_op_procedure_pct.sql script in Supabase to enable these fields.')}if(error){alert('Update failed: '+error.message);return}if(data)setDb(d=>({...d,ref_doctors:d.ref_doctors.map(r=>r.id===id?{...r,...form,...data[0]}:r)}))},
    deleteRefDoctor:async id=>{await supabase.from('ref_doctors').delete().eq('id',id);setDb(d=>({...d,ref_doctors:d.ref_doctors.filter(r=>r.id!==id)}))},
    addConsultant:async form=>{const hid=profile?.hospital_id;let {data,error}=await supabase.from('consultants').insert([{...form,hospital_id:hid}]).select();if(error&&/column|schema/i.test(error.message)){const {op_p_pct,...rest}=form;const r2=await supabase.from('consultants').insert([{...rest,hospital_id:hid}]).select();data=r2.data;error=r2.error;if(!error)alert('Saved, but OP Procedure % was NOT saved.\n\nPlease run add_op_procedure_pct_consultants.sql in Supabase.')}if(error){alert('Save failed: '+error.message);return}if(data)setDb(d=>({...d,consultants:[...d.consultants,data[0]].sort((a,b)=>a.name.localeCompare(b.name))}))},
    updateConsultant:async(id,form)=>{let {data,error}=await supabase.from('consultants').update(form).eq('id',id).select();if(error&&/column|schema/i.test(error.message)){const {op_p_pct,...rest}=form;const r2=await supabase.from('consultants').update(rest).eq('id',id).select();data=r2.data;error=r2.error;if(!error)alert('Saved, but OP Procedure % was NOT saved.\n\nPlease run add_op_procedure_pct_consultants.sql in Supabase.')}if(error){alert('Update failed: '+error.message);return}if(data)setDb(d=>({...d,consultants:d.consultants.map(r=>r.id===id?{...r,...form,...data[0]}:r)}))},
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
  const TABS=[...(canSeeReports?[{k:'dash',l:'Dashboard'},{k:'rep',l:'Reports'}]:[]),{k:'entry',l:'First Entry'},{k:'ip',l:'IP Patients'},...(canSeeReports?[{k:'op',l:'OP Patients'}]:[]),{k:'ins',l:'🏥 Insurance'},{k:'exp',l:'Expenses'},...(canSeeReports?[{k:'refdrs',l:'Ref Doctors'}]:[]),{k:'consult',l:'Consultants'},...(canSeeReports?[{k:'credit',l:'Credit'},{k:'employees',l:'👥 Employees'}]:[]),...(isAdmin?[{k:'admin',l:'Users'}]:[])]

  if(loading||(!profile&&session&&!isSuperAdmin))return(
    <div style={{minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',background:'linear-gradient(160deg,#0a1628 0%,#0f2044 100%)',padding:24}}>
      <svg width="52" height="52" viewBox="0 0 40 40" fill="none" style={{marginBottom:16}}><rect width="40" height="40" rx="12" fill="rgba(0,192,107,0.15)"/><rect x="16" y="6" width="8" height="28" rx="4" fill="#00c06b"/><rect x="6" y="16" width="28" height="8" rx="4" fill="#00c06b"/><circle cx="20" cy="20" r="5" fill="#00e87f"/></svg>
      <div style={{fontSize:18,fontWeight:700,color:'#fff',marginBottom:4,letterSpacing:'-0.5px'}}>EasyMedical</div>
      <div style={{fontSize:12,color:'rgba(0,192,107,0.6)',marginBottom:24,fontWeight:600,textTransform:'uppercase',letterSpacing:'0.12em'}}>Solutions</div>
      <div style={{display:'flex',gap:6,marginBottom:32}}>
        {[0,1,2].map(i=><div key={i} style={{width:8,height:8,borderRadius:'50%',background:'#00c06b',opacity:0.8,animation:'pulse 1.2s ease-in-out infinite',animationDelay:i*0.2+'s'}}/>)}
      </div>
      <SlowLoadWarning/>
      <style>{`@keyframes pulse{0%,100%{transform:scale(0.7);opacity:0.4}50%{transform:scale(1);opacity:1}}`}</style>
    </div>
  )
  if(editIPPatient)return(
    <div style={{position:'fixed',inset:0,background:'#f8fafc',zIndex:9999,overflowY:'auto'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #f0f0f0',padding:'14px 16px',display:'flex',justifyContent:'space-between',alignItems:'center',position:'sticky',top:0,zIndex:10}}>
        <button onClick={()=>setEditIPPatient(null)} style={{background:'none',border:'none',color:'#3b82f6',fontSize:14,fontWeight:600,cursor:'pointer'}}>Cancel</button>
        <div style={{fontSize:15,fontWeight:700}}>Edit patient info</div>
        <button onClick={async()=>{
          const safe={name:editIPPatient.name,phone:editIPPatient.phone||'',diagnosis:editIPPatient.dx||'',room:editIPPatient.room||'',ref_doctor:editIPPatient.ref||'',admission_date:editIPPatient.adm||'',admission_time:editIPPatient.admission_time||'',discharge_time:editIPPatient.discharge_time||''}
          const full={...safe,patient_area:editIPPatient.patient_area||'',insurance_type:editIPPatient.insurance_type||'',insurance_policy_no:editIPPatient.insurance_policy_no||'',insurance_expected:editIPPatient.insurance_expected||0,insurance_status:editIPPatient.insurance_status||'pending'}
          let {error}=await supabase.from('ip_patients').update(full).eq('id',editIPPatient.id)
          if(error){const r2=await supabase.from('ip_patients').update(safe).eq('id',editIPPatient.id);error=r2.error}
          if(error){alert('Save failed: '+error.message);return}
          setDb(d=>({...d,ip_patients:d.ip_patients.map(p=>p.id===editIPPatient.id?{...p,...full}:p)}))
          // PROPAGATE: update ref_doctor + commission rate to ALL of this patient's IP-type entries
          const newRefDoc=editIPPatient.ref||''
          const ipTypes=['ip','ip_r','ip_l','ip_p']
          const pname=(editIPPatient.name||'').trim().toLowerCase()
          // Match by patient_id OR patient_name (handles legacy entries without patient_id)
          const entriesToUpdate=db.income.filter(e=>{
            if(!ipTypes.includes(e.type))return false
            if(e.patient_id===editIPPatient.id)return true
            if(e.patient_name&&e.patient_name.trim().toLowerCase()===pname)return true
            return false
          })
          if(entriesToUpdate.length>0){
            let updateCount=0,errors=[]
            for(const e of entriesToUpdate){
              const doc=db.ref_doctors.find(d=>d.name===newRefDoc)
              const pctKey={ip:'ip_pct',ip_r:'ip_r_pct',ip_l:'ip_l_pct',ip_p:'ip_pct'}[e.type]
              let newCC=null
              if(doc&&pctKey&&doc[pctKey]!=null)newCC=doc[pctKey]
              else if(editIPPatient.custom_commission!=null&&editIPPatient.custom_commission!=='')newCC=parseFloat(editIPPatient.custom_commission)
              const {error:upErr}=await supabase.from('income').update({ref_doctor:newRefDoc,custom_commission:newCC,patient_id:editIPPatient.id}).eq('id',e.id)
              if(upErr){errors.push(e.id+': '+upErr.message)}else{updateCount++}
            }
            if(errors.length>0)alert('Some entries failed to update:\n'+errors.slice(0,3).join('\n'))
            // Refresh local state
            setDb(d=>({...d,income:d.income.map(e=>{
              const matchesPat=e.patient_id===editIPPatient.id||(e.patient_name&&e.patient_name.trim().toLowerCase()===pname)
              if(!matchesPat||!ipTypes.includes(e.type))return e
              const doc=db.ref_doctors.find(d2=>d2.name===newRefDoc)
              const pctKey={ip:'ip_pct',ip_r:'ip_r_pct',ip_l:'ip_l_pct',ip_p:'ip_pct'}[e.type]
              let newCC=null
              if(doc&&pctKey&&doc[pctKey]!=null)newCC=doc[pctKey]
              else if(editIPPatient.custom_commission!=null&&editIPPatient.custom_commission!=='')newCC=parseFloat(editIPPatient.custom_commission)
              return{...e,ref_doctor:newRefDoc,custom_commission:newCC,patient_id:editIPPatient.id}
            })}))
            if(updateCount>0){alert('✅ Updated '+updateCount+' charges with '+(newRefDoc?'Dr. '+newRefDoc:'no referring doctor')+'.\n\nCommission will recalculate immediately.')} else if(entriesToUpdate.length===0){alert('No IP charges found for this patient to update commission on.')}
          }
          setEditIPPatient(null)
        }} style={{background:'#16a34a',color:'#fff',border:'none',borderRadius:8,padding:'7px 16px',fontSize:14,fontWeight:700,cursor:'pointer'}}>Save</button>
      </div>
      <div style={{padding:'16px',maxWidth:480,margin:'0 auto'}}>
        <FInp label="Patient name" type="text" value={editIPPatient.name||''} onChange={e=>setEditIPPatient(p=>({...p,name:e.target.value}))}/>
        <FInp label="Phone" type="tel" value={editIPPatient.phone||''} onChange={e=>setEditIPPatient(p=>({...p,phone:e.target.value}))}/>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FInp label="Admission date" type="date" value={editIPPatient.adm||''} onChange={e=>setEditIPPatient(p=>({...p,adm:e.target.value}))}/>
          <FInp label="Admission time" type="time" value={editIPPatient.admission_time||''} onChange={e=>setEditIPPatient(p=>({...p,admission_time:e.target.value}))}/>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FInp label="Discharge date (if discharged)" type="date" value={editIPPatient.discharge_date||''} onChange={e=>setEditIPPatient(p=>({...p,discharge_date:e.target.value}))}/>
          <FInp label="Discharge time" type="time" value={editIPPatient.discharge_time||''} onChange={e=>setEditIPPatient(p=>({...p,discharge_time:e.target.value}))}/>
        </div>
        <FInp label="Ward / Room" type="text" value={editIPPatient.room||''} onChange={e=>setEditIPPatient(p=>({...p,room:e.target.value}))}/>
        <FInp label="Diagnosis" type="text" value={editIPPatient.dx||''} onChange={e=>setEditIPPatient(p=>({...p,dx:e.target.value}))}/>
        <FInp label="Patient area (optional)" type="text" placeholder="e.g. Kukatpally, Miyapur" value={editIPPatient.patient_area||''} onChange={e=>setEditIPPatient(p=>({...p,patient_area:e.target.value}))}/>
        <FSel label="Referring doctor" value={editIPPatient.ref||''} onChange={e=>setEditIPPatient(p=>({...p,ref:e.target.value}))}>
          <option value="">- No referral / Self patient -</option>
          {(db?.ref_doctors||[]).map(d=><option key={d.id} value={d.name}>Dr. {d.name}{d.area?' ('+d.area+')':''}</option>)}
        </FSel>
        <div style={{marginTop:12,paddingTop:12,borderTop:'1px solid #f0f0f0'}}>
          <div style={{fontSize:12,fontWeight:700,color:'#0f172a',marginBottom:8}}>Insurance details (optional)</div>
          <FInp label="Insurance company / TPA name" type="text" value={editIPPatient.insurance_type||''} onChange={e=>setEditIPPatient(p=>({...p,insurance_type:e.target.value}))} placeholder="e.g. Star Health, CGHS, ESI"/>
          <FInp label="Policy / Authorization number" type="text" value={editIPPatient.insurance_policy_no||''} onChange={e=>setEditIPPatient(p=>({...p,insurance_policy_no:e.target.value}))} placeholder="Policy number"/>
          <FInp label="Expected amount (Rs)" type="number" value={editIPPatient.insurance_expected||''} onChange={e=>setEditIPPatient(p=>({...p,insurance_expected:parseFloat(e.target.value)||0}))} placeholder="0"/>
          <FSel label="Approval status" value={editIPPatient.insurance_status||'pending'} onChange={e=>setEditIPPatient(p=>({...p,insurance_status:e.target.value}))}>
            <option value="pending">Pending approval</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </FSel>
        </div>
        <button onClick={()=>setEditIPPatient(null)} style={{width:'100%',padding:'12px',background:'none',border:'1px solid #e5e7eb',borderRadius:12,fontSize:14,color:'#aaa',cursor:'pointer',marginTop:16}}>Cancel</button>
      </div>
    </div>
  )
  if(loading)return(<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center'}}><div style={{textAlign:'center',color:'#94a3b8'}}><div style={{fontSize:40,marginBottom:8}}>🏥</div><div style={{fontSize:14,fontWeight:600}}>Loading...</div></div></div>)
  if(showPayment||new URLSearchParams(window.location.search).get('upgrade')==='true')return<PaymentPage session={session} onBack={()=>{setShowPayment(false);window.history.replaceState({},'',window.location.pathname)}}/>
  if(!session&&showRegister)return<HospitalOnboarding onBack={()=>setShowRegister(false)}/>
  if(recoveryMode){
    const doSetPwd=async()=>{
      if(newPwd.length<6){setPwdMsg('Password must be at least 6 characters');return}
      if(newPwd!==newPwd2){setPwdMsg('Passwords do not match');return}
      setPwdBusy(true);setPwdMsg('')
      const {error}=await supabase.auth.updateUser({password:newPwd})
      setPwdBusy(false)
      if(error){setPwdMsg('Error: '+error.message);return}
      setPwdMsg('✅ Password updated! Redirecting to login...')
      setTimeout(async()=>{await supabase.auth.signOut();try{window.location.hash='';window.location.href=window.location.pathname}catch(e){window.location.reload()}},1500)
    }
    return(<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:20,background:'linear-gradient(160deg,#0a1628 0%,#0f2044 60%,#0a1628 100%)'}}>
      <div style={{background:'#0f2044',border:'1px solid rgba(255,255,255,0.12)',borderRadius:16,width:'100%',maxWidth:400,padding:'28px 24px'}}>
        <div style={{fontSize:34,textAlign:'center',marginBottom:8}}>🔑</div>
        <div style={{fontSize:19,fontWeight:800,color:'#fff',textAlign:'center',marginBottom:6}}>Set a new password</div>
        <div style={{fontSize:12.5,color:'rgba(255,255,255,0.5)',textAlign:'center',marginBottom:20,lineHeight:1.5}}>Choose a new password for your account.</div>
        <input type="password" placeholder="New password (min 6 chars)" value={newPwd} onChange={e=>setNewPwd(e.target.value)} style={{width:'100%',padding:'13px 14px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,fontSize:15,color:'#fff',fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:10}}/>
        <input type="password" placeholder="Confirm new password" value={newPwd2} onChange={e=>setNewPwd2(e.target.value)} onKeyDown={e=>e.key==='Enter'&&doSetPwd()} style={{width:'100%',padding:'13px 14px',background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)',borderRadius:12,fontSize:15,color:'#fff',fontFamily:'inherit',outline:'none',boxSizing:'border-box',marginBottom:12}}/>
        {pwdMsg&&<div style={{fontSize:12.5,color:pwdMsg.startsWith('✅')?'#00e87f':'#fca5a5',marginBottom:12,lineHeight:1.5,background:'rgba(255,255,255,0.04)',padding:'10px 12px',borderRadius:8}}>{pwdMsg}</div>}
        <button onClick={doSetPwd} disabled={pwdBusy} style={{width:'100%',padding:'14px',background:pwdBusy?'rgba(0,192,107,0.3)':'linear-gradient(135deg,#00c06b,#00e87f)',color:'#0a1628',border:'none',borderRadius:12,fontSize:15,fontWeight:800,cursor:pwdBusy?'not-allowed':'pointer'}}>{pwdBusy?'Updating...':'Update password'}</button>
        <button onClick={async()=>{await supabase.auth.signOut();window.location.hash='';window.location.href=window.location.pathname}} style={{width:'100%',padding:'10px',marginTop:8,background:'none',border:'none',color:'rgba(255,255,255,0.5)',fontSize:13,fontWeight:600,cursor:'pointer'}}>Cancel — back to login</button>
      </div>
    </div>)
  }
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
  if(hospital&&!hospital.comped&&hospital.plan_end&&hospital.plan_end<todayStr()&&hospital.plan!=='pro'&&hospital.plan!=='enterprise'){
    return <PaymentPage session={session}/>
  }

  const TAB_COLORS={dash:{active:'#6366f1',bg:'#eef2ff'},entry:{active:'#16a34a',bg:'#f0fdf4'},ip:{active:'#2563eb',bg:'#eff6ff'},op:{active:'#7c3aed',bg:'#f5f3ff'},exp:{active:'#dc2626',bg:'#fff1f2'},rep:{active:'#d97706',bg:'#fffbeb'},credit:{active:'#c2410c',bg:'#fff7ed'},refdrs:{active:'#0891b2',bg:'#ecfeff'},consult:{active:'#7c3aed',bg:'#f5f3ff'},admin:{active:'#475569',bg:'#f8fafc'}}
  const tc=TAB_COLORS[tab]||{active:'#16a34a',bg:'#f0fdf4'}
  return(
    <div className="app-wrapper" style={{maxWidth:520,margin:'0 auto',background:'#f8fafc',minHeight:'100vh'}}>
      <InjectCSS/>
      <div className="app-header" style={{background:'#fff',borderBottom:'2px solid '+tc.bg,padding:'12px 16px 0',position:'sticky',top:0,zIndex:10,boxShadow:'0 2px 12px rgba(0,0,0,0.06)'}}>
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
        <div className="app-nav-tabs" style={{display:'flex',overflowX:'auto',gap:4,marginBottom:-1,paddingBottom:0,WebkitOverflowScrolling:'touch'}}>
          {TABS.map(t=>{const tcolor=TAB_COLORS[t.k]||{active:'#16a34a',bg:'#f0fdf4'};const on=tab===t.k;return(<button key={t.k} onClick={()=>setTab(t.k)} style={{flexShrink:0,padding:'9px 12px',fontSize:11,fontWeight:700,border:'none',background:on?tcolor.bg:'transparent',color:on?tcolor.active:'#94a3b8',borderBottom:on?'2.5px solid '+tcolor.active:'2.5px solid transparent',cursor:'pointer',whiteSpace:'nowrap',borderRadius:'8px 8px 0 0',transition:'all .15s'}}>{t.l}</button>)})}
        </div>
      </div>
      <div className="app-main-content" style={{padding:'16px 16px 80px',minHeight:'50vh'}}>
        {tab==='dash'&&(canSeeReports?<AnalyticsDash db={db} actions={actions}/>:<div style={{textAlign:'center',padding:'40px 0',color:'#94a3b8',fontSize:13}}>Dashboard available for Admin and Management only</div>)}
        <div style={{display:tab==='entry'?'block':'none'}}><EntryTab db={db} actions={actions} eDate={eDate} setEDate={setEDate} itype={itype} setItype={setItype} iF={iF} setIF={setIF} profile={profile} canSeeReports={canSeeReports}/></div>
        <div style={{display:tab==='ip'?'block':'none'}}><IPTab db={db} actions={actions} hospital={hospital} canSeeReports={canSeeReports} ipv={ipv} setIpv={setIpv} ipid={ipid} setIpid={setIpid} pF={pF} setPF={setPF} cF={cF} setCF={setCF} pyF={pyF} setPyF={setPyF} gotoIP={gotoIP} gotoOP={name=>gotoOP(name,'ip')} prevTab={prevTab} setPrevTab={setPrevTab} setTab={setTab} setEditIPPatient={setEditIPPatient}/></div>
        {tab==='op'&&canSeeReports&&<OPTab db={db} actions={actions} canSeeReports={canSeeReports} hospital={hospital} opSearch={opNavSearch} setOpSearch={setOpNavSearch} opPrevTab={opPrevTab} setOpPrevTab={setOpPrevTab} setTab={setTab} gotoIP={pid=>gotoIP(pid,'op')}/>}
        {tab==='exp'&&<ExpTab db={db} actions={actions} exD={exD} setExD={setExD} exF={exF} setExF={setExF}/>}
        {tab==='rep'&&<RepTab canSeeReports={canSeeReports} db={db} rv={rv} setRv={setRv} rd={rd} setRd={setRd} rm={rm} setRm={setRm} ry={ry} setRy={setRy} gotoIP={gotoIP} gotoOP={gotoOP} actions={actions} hospital={hospital}/>}
        {tab==='ins'&&<InsuranceMainTab db={db} setDb={setDb} hospital={hospital} gotoIP={(id)=>{setTab('ip');setTimeout(()=>gotoIP(id),100)}}/>}
        {tab==='credit'&&canSeeReports&&<CreditTab canSeeReports={canSeeReports} db={db} actions={actions}/>}
        {tab==='refdrs'&&canSeeReports&&<RefDoctorsTab db={db} actions={actions}/>}
        {tab==='consult'&&<ConsultantsTab db={db} actions={actions}/>}
        {tab==='employees'&&canSeeReports&&<EmployeesTab db={db} actions={actions}/>}
        {isAdmin&&tab==='admin'&&<AdminTab currentUser={profile} hospital={hospital} onLogoUpdate={url=>setHospital(h=>({...h,logo_url:url}))}/>}
      </div>
    </div>
  )
}


/*  REF DOCTORS TAB  */
const RefDoctorsTab=({db,actions})=>{
  const [showAdd,setShowAdd]=useState(false)
  const [payDocR,setPayDocR]=useState(null)
  const [editId,setEditId]=useState(null)
  const [busy,setBusy]=useState(false)
  const blank={name:'',phone:'',area:'',ip_pct:40,ip_r_pct:40,ip_l_pct:50,op_pct:0,op_r_pct:0,op_l_pct:0,op_p_pct:0}
  const [form,setForm]=useState(blank)
  const ipCats=[{key:'ip_pct',label:'IP Charges',color:'#16a34a'},{key:'ip_r_pct',label:'IP Pharmacy',color:'#b45309'},{key:'ip_l_pct',label:'IP Lab',color:'#9d174d'}]
  const opCats=[{key:'op_pct',label:'OP Consultation',color:'#1d4ed8'},{key:'op_p_pct',label:'OP Procedure',color:'#0f766e'},{key:'op_r_pct',label:'OP Pharmacy',color:'#c2410c'},{key:'op_l_pct',label:'OP Lab',color:'#7e22ce'}]
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
  const startEdit=d=>{setForm({name:d.name,phone:d.phone||'',area:d.area||'',ip_pct:d.ip_pct??40,ip_r_pct:d.ip_r_pct??40,ip_l_pct:d.ip_l_pct??50,op_pct:d.op_pct??0,op_r_pct:d.op_r_pct??0,op_l_pct:d.op_l_pct??0,op_p_pct:d.op_p_pct??0});setEditId(d.id);setShowAdd(true);setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),50)}
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
      <div style={{fontSize:11,fontWeight:700,color:'#555',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:10}}>OP commission % per category</div>
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
          {(()=>{
            const earned=(db.income||[]).filter(e=>e.ref_doctor===d.name).reduce((a,e)=>a+getComm(e),0)
            if(earned<=0)return null
            const paid=(db.expenses||[]).filter(e=>e.category==='ref_paid'&&e.description===d.name).reduce((a,e)=>a+e.amount,0)
            const waivedR=(db.expenses||[]).filter(e=>isRetainedCat(e.category)&&e.description===d.name).reduce((a,e)=>a+e.amount,0)
            const due=earned-paid-waivedR
            const isOpen=payDocR===d.name
            return(<div style={{marginTop:8,paddingTop:8,borderTop:'1px solid #f5f5f5'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:due>0?8:0}}>
                <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Earned</div><div style={{fontSize:13,fontWeight:700,color:'#c2410c'}}>{fmt(earned)}</div></div>
                <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Paid</div><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(paid)}</div></div>
                <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Due</div><div style={{fontSize:13,fontWeight:700,color:due>0?'#ef4444':'#16a34a'}}>{fmt(due)}</div></div>
              </div>
              {due>0&&(payDocR===d.name?<CommPayForm docName={d.name} balance={due} onCancel={()=>setPayDocR(null)} onSave={async(amt,date,pay)=>{await settleRefPayment(db,actions,d.name,amt,date,pay,0);setPayDocR(null)}}/>
               :payDocR==='DED:'+d.name?<DeductCommForm db={db} docName={d.name} balance={due} onCancel={()=>setPayDocR(null)} onSave={async(g1,g2,d1,d2,date,pay)=>{if(g1+g2>0)await actions.addExpense({id:uid(),date,category:'ref_paid',amount:Math.round(g1+g2),description:d.name,payment:pay,is_monthly:false});await deductCommSplit(actions,d.name,date,d1,d2);setPayDocR(null)}}/>
               :<div style={{display:'flex',gap:8}}>
                  <button onClick={()=>setPayDocR(d.name)} style={{flex:2,padding:'9px',background:'#111',color:'#fff',border:'none',borderRadius:10,fontSize:12,fontWeight:600,cursor:'pointer'}}>+ Record payment</button>
                  <button onClick={()=>setPayDocR('DED:'+d.name)} style={{flex:1,padding:'9px',background:'#fffbeb',color:'#b45309',border:'1.5px solid #fcd34d',borderRadius:10,fontSize:12,fontWeight:700,cursor:'pointer'}}>− Deduct</button>
                </div>)}
            </div>)
          })()}
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
      {(d.op_pct>0||d.op_p_pct>0||d.op_r_pct>0||d.op_l_pct>0)&&<div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6}}>
        {opCats.map(c=>(<div key={c.key} style={{background:'#f9f9f9',borderRadius:8,padding:'6px 8px',textAlign:'center'}}>
          <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>{c.label.replace(' Pharmacy','OP Pharm').replace(' Lab','OP Lab')}</div>
          <div style={{fontSize:15,fontWeight:800,color:d[c.key]>0?c.color:'#ccc'}}>{d[c.key]}%</div>
        </div>))}
      </div>}
    </Card>))}
  </div>)
}

/*  CONSULTANTS TAB  */
const EmployeesTab=({db,actions})=>{
  const [view,setView]=useState('list')  // list | detail | attendance
  const [selEmp,setSelEmp]=useState(null)
  const [showAdd,setShowAdd]=useState(false)
  const [editEmp,setEditEmp]=useState(null)
  const [addF,setAddF]=useState({name:'',role:'',phone:'',monthly_salary:'',join_date:todayStr()})
  const [attDate,setAttDate]=useState(todayStr())
  const [payForm,setPayForm]=useState(null)
  const [attMonth,setAttMonth]=useState(todayStr().slice(0,7))
  
  const emps=(db.employees||[]).filter(e=>e.active!==false)
  const inactiveEmps=(db.employees||[]).filter(e=>e.active===false)
  const att=db.attendance||[]
  const sals=db.salary_payments||[]
  
  const ROLES=['Nurse','Doctor','Receptionist','Pharmacist','Lab Technician','Cleaner','Ward Boy','Security','Accountant','Manager','Other']
  const hospital=db.hospital||{}
  const genSalarySlip=(emp,month,paidAmount,paidDate,paymentMode,notes)=>{
    const ded=computeSalaryDeduction(emp,month,db.attendance||[])
    const monthAtt=(db.attendance||[]).filter(a=>a.employee_id===emp.id&&a.date&&a.date.startsWith(month))
    const counts={present:0,absent:0,half:0,leave:0}
    monthAtt.forEach(a=>{if(counts[a.status]!=null)counts[a.status]++})
    const hospName=((hospital&&hospital.name)||'OM HOSPITAL').toUpperCase()
    const hospCity=(hospital&&hospital.city)||''
    const hospPhone=hospital&&hospital.phone?'  Ph: '+hospital.phone:''
    const monthLabel=new Date(month+'-01').toLocaleDateString('en-IN',{month:'long',year:'numeric'})
    const base=emp.monthly_salary||0
    const html='<!DOCTYPE html><html><head><title>Salary Slip - '+emp.name+' - '+month+'</title><meta charset="utf-8"/>'
      +'<style>*{margin:0;padding:0;box-sizing:border-box;font-family:Arial,Helvetica,sans-serif}'
      +'body{background:#fff;padding:36px;color:#0f172a;font-size:14px;line-height:1.45;max-width:760px;margin:0 auto}'
      +'@media print{body{padding:18px;max-width:none}.no-print{display:none!important}}'
      +'</style></head><body>'
      // Letterhead
      +'<div style="text-align:center;border-bottom:4px double #1a1a2e;padding-bottom:22px;margin-bottom:26px">'
      +'<div style="font-size:36px;font-weight:900;color:#1a1a2e;letter-spacing:3px;margin-bottom:6px">'+hospName+'</div>'
      +'<div style="font-size:14px;color:#64748b;letter-spacing:2px;font-weight:700">MULTI-SPECIALITY MEDICAL CENTRE</div>'
      +'<div style="height:4px;background:linear-gradient(90deg,#c9a84c,#f0d068,#c9a84c);margin:12px auto;width:60%;border-radius:2px"></div>'
      +'<div style="font-size:13px;color:#64748b;margin-top:8px;font-weight:600">'+hospCity+hospPhone+'</div>'
      +'</div>'
      // Title banner
      +'<div style="background:linear-gradient(135deg,#1a1a2e,#16213e);color:#fff;padding:20px 28px;border-radius:14px;margin-bottom:24px;text-align:center">'
      +'<div style="font-size:24px;color:#c9a84c;letter-spacing:2px;font-weight:900">SALARY SLIP</div>'
      +'<div style="font-size:14px;color:#cbd5e1;font-weight:600;margin-top:4px">'+monthLabel+'</div>'
      +'</div>'
      // Employee info
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:22px">'
      +'<div style="background:#eff6ff;border:2px solid #3b82f6;padding:16px 20px;border-radius:12px"><div style="font-size:11px;color:#1d4ed8;font-weight:900;text-transform:uppercase;letter-spacing:1.5px">Employee</div><div style="font-size:20px;font-weight:900;color:#1a1a2e;margin-top:6px">'+emp.name+'</div><div style="font-size:13px;color:#64748b;margin-top:2px">'+(emp.role||'')+'</div></div>'
      +'<div style="background:#f0fdf4;border:2px solid #16a34a;padding:16px 20px;border-radius:12px"><div style="font-size:11px;color:#15803d;font-weight:900;text-transform:uppercase;letter-spacing:1.5px">Paid On</div><div style="font-size:16px;font-weight:900;color:#1a1a2e;margin-top:6px">'+new Date(paidDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})+'</div><div style="font-size:12px;color:#64748b;margin-top:2px;text-transform:capitalize">'+(paymentMode||'cash')+'</div></div>'
      +'</div>'
      // Attendance summary
      +'<div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin-bottom:18px">'
      +'<div style="font-size:12px;color:#64748b;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px">Attendance — '+monthLabel+'</div>'
      +'<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;text-align:center">'
      +'<div><div style="font-size:22px;font-weight:900;color:#16a34a">'+counts.present+'</div><div style="font-size:10px;color:#64748b;font-weight:700">PRESENT</div></div>'
      +'<div><div style="font-size:22px;font-weight:900;color:#dc2626">'+counts.absent+'</div><div style="font-size:10px;color:#64748b;font-weight:700">ABSENT</div></div>'
      +'<div><div style="font-size:22px;font-weight:900;color:#d97706">'+counts.half+'</div><div style="font-size:10px;color:#64748b;font-weight:700">HALF DAY</div></div>'
      +'<div><div style="font-size:22px;font-weight:900;color:#7c3aed">'+counts.leave+'</div><div style="font-size:10px;color:#64748b;font-weight:700">LEAVE</div></div>'
      +'</div></div>'
      // Earnings/Deductions table
      +'<div style="border:2px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:20px">'
      +'<table style="width:100%;border-collapse:collapse;font-size:14px">'
      +'<tr style="background:#1a1a2e;color:#fff"><td style="padding:12px 18px;font-weight:800;text-transform:uppercase;letter-spacing:1px;font-size:12px">Description</td><td style="padding:12px 18px;text-align:right;font-weight:800;text-transform:uppercase;letter-spacing:1px;font-size:12px">Amount</td></tr>'
      +'<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:12px 18px;color:#1a1a2e;font-weight:600">Basic Monthly Salary</td><td style="padding:12px 18px;text-align:right;font-weight:700;color:#16a34a">Rs '+base.toLocaleString('en-IN')+'</td></tr>'
      +(ded.excess>0?'<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:12px 18px;color:#dc2626">Leave Deduction <span style="font-size:11px;color:#94a3b8">('+ded.excess+' day'+(ded.excess!==1?'s':'')+' over 2 free · Rs '+ded.perDay+'/day)</span></td><td style="padding:12px 18px;text-align:right;font-weight:700;color:#dc2626">− Rs '+ded.deduction.toLocaleString('en-IN')+'</td></tr>':'<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:12px 18px;color:#16a34a">Leave Deduction <span style="font-size:11px;color:#94a3b8">(within 2-day allowance)</span></td><td style="padding:12px 18px;text-align:right;font-weight:700;color:#16a34a">Rs 0</td></tr>')
      +(paidAmount!=ded.payable?'<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:12px 18px;color:#64748b;font-style:italic">Manual adjustment</td><td style="padding:12px 18px;text-align:right;font-weight:700;color:#64748b">Rs '+(paidAmount-ded.payable).toLocaleString('en-IN')+'</td></tr>':'')
      +'</table></div>'
      // Net pay hero
      +'<div style="background:linear-gradient(135deg,#f0fdf4 0%,#dcfce7 100%);border:3px solid #16a34a;border-radius:16px;padding:26px;margin-bottom:24px;text-align:center;box-shadow:0 8px 24px rgba(22,163,74,.18)">'
      +'<div style="font-size:13px;color:#15803d;font-weight:900;text-transform:uppercase;letter-spacing:3px;margin-bottom:8px">★ NET SALARY PAID ★</div>'
      +'<div style="font-size:52px;font-weight:900;color:#15803d;line-height:1">Rs '+Number(paidAmount).toLocaleString('en-IN')+'</div>'
      +'</div>'
      +(notes?'<div style="background:#fffbeb;border:2px solid #fde68a;border-radius:12px;padding:14px 20px;margin-bottom:20px"><div style="font-size:11px;color:#a16207;font-weight:900;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Notes</div><div style="color:#451a03;font-size:14px">'+notes+'</div></div>':'')
      // Signatures
      +'<div style="display:grid;grid-template-columns:1fr 1fr;gap:60px;margin-top:60px">'
      +'<div style="text-align:center"><div style="height:40px"></div><div style="border-top:2px solid #1a1a2e;padding-top:8px;font-size:12px;color:#64748b;font-weight:700">Employee Signature<br/><span style="color:#1a1a2e;font-weight:900;font-size:14px">'+emp.name+'</span></div></div>'
      +'<div style="text-align:center"><div style="height:40px"></div><div style="border-top:2px solid #1a1a2e;padding-top:8px;font-size:12px;color:#64748b;font-weight:700">Authorised Signatory<br/><span style="color:#1a1a2e;font-weight:900;font-size:14px">'+((hospital&&hospital.name)||'Om Hospital')+'</span></div></div>'
      +'</div>'
      +'<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8">Computer-generated salary slip · '+new Date().toLocaleString('en-IN')+'</div>'
      +'<div class="no-print" style="text-align:center;margin-top:32px"><button onclick="window.print()" style="padding:16px 50px;background:#16a34a;color:#fff;border:none;border-radius:12px;font-size:16px;font-weight:800;cursor:pointer;box-shadow:0 6px 18px rgba(22,163,74,.35)">Print / Save as PDF</button></div>'
      +'</body></html>'
    const w=window.open('','_blank','width=900,height=1200')
    if(!w){alert('Please allow popups to view the salary slip');return}
    w.document.write(html);w.document.close()
  }
  const ATT_STATUS={present:{l:'Present',c:'#16a34a',bg:'#f0fdf4'},absent:{l:'Absent',c:'#dc2626',bg:'#fef2f2'},half:{l:'Half day',c:'#d97706',bg:'#fffbeb'},leave:{l:'Leave',c:'#7c3aed',bg:'#f5f3ff'}}
  
  const saveAdd=async()=>{
    if(!addF.name.trim()){alert('Name required');return}
    const ok=await actions.addEmployee({name:addF.name.trim(),role:addF.role,phone:addF.phone,monthly_salary:parseFloat(addF.monthly_salary)||0,join_date:addF.join_date||null,active:true})
    if(ok!==false){setAddF({name:'',role:'',phone:'',monthly_salary:'',join_date:todayStr()});setShowAdd(false)}
  }
  const saveEdit=async()=>{
    if(!editEmp.name.trim()){alert('Name required');return}
    await actions.updateEmployee(editEmp.id,{name:editEmp.name.trim(),role:editEmp.role,phone:editEmp.phone,monthly_salary:parseFloat(editEmp.monthly_salary)||0,join_date:editEmp.join_date||null,active:editEmp.active})
    setEditEmp(null)
  }
  
  // ATTENDANCE VIEW
  if(view==='attendance'){
    const dayAtt={};att.filter(a=>a.date===attDate).forEach(a=>{dayAtt[a.employee_id]=a.status})
    return(<div>
      <button onClick={()=>setView('list')} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer',marginBottom:12,fontWeight:600}}>← Back to employees</button>
      <SecL>📋 Daily Attendance</SecL>
      <div style={{display:'flex',gap:8,marginBottom:10}}>
        <input type="date" value={attDate} onChange={e=>setAttDate(e.target.value)} style={{flex:1,padding:'9px 12px',border:'1.5px solid #cbd5e1',borderRadius:8,fontSize:13,outline:'none'}}/>
        <GBtn onClick={()=>setAttDate(todayStr())}>Today</GBtn>
      </div>
      {emps.length>0&&<button onClick={async()=>{for(const emp of emps){if(dayAtt[emp.id]!=='present')await actions.markAttendance(emp.id,attDate,'present')}}} style={{width:'100%',padding:'11px',background:'#16a34a',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:800,cursor:'pointer',marginBottom:14}}>✓ Mark all Present ({emps.length})</button>}
      {emps.length===0&&<div style={{textAlign:'center',padding:'24px 0',color:'#ccc',fontSize:13}}>No active employees. Add some first.</div>}
      {emps.map(emp=>{
        const cur=dayAtt[emp.id]
        return(<Card key={emp.id} style={{marginBottom:8}}>
          <div style={{fontSize:14,fontWeight:700,color:'#1a1a2e',marginBottom:8}}>{emp.name}<span style={{fontSize:11,color:'#94a3b8',fontWeight:500,marginLeft:6}}>{emp.role}</span></div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:6}}>
            {Object.entries(ATT_STATUS).map(([k,s])=>(
              <button key={k} onClick={()=>actions.markAttendance(emp.id,attDate,k)} style={{padding:'8px 4px',border:cur===k?'2px solid '+s.c:'1.5px solid #e5e7eb',background:cur===k?s.bg:'#fff',color:cur===k?s.c:'#94a3b8',borderRadius:8,fontSize:11,fontWeight:700,cursor:'pointer'}}>{s.l}</button>
            ))}
          </div>
        </Card>)
      })}
    </div>)
  }
  
  // EMPLOYEE DETAIL VIEW
  if(view==='detail'&&selEmp){
    const emp=db.employees.find(e=>e.id===selEmp)
    if(!emp){setView('list');return null}
    const empAtt=att.filter(a=>a.employee_id===emp.id&&a.date?.startsWith(attMonth))
    const attCounts={present:0,absent:0,half:0,leave:0}
    empAtt.forEach(a=>{if(attCounts[a.status]!=null)attCounts[a.status]++})
    const empSals=sals.filter(s=>s.employee_id===emp.id).sort((a,b)=>(b.paid_date||'').localeCompare(a.paid_date||''))
    const curMonth=todayStr().slice(0,7)
    const paidThisMonth=sals.filter(s=>s.employee_id===emp.id&&s.month===curMonth).reduce((a,s)=>a+s.amount,0)
    return(<div>
      <button onClick={()=>setView('list')} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer',marginBottom:12,fontWeight:600}}>← Back to employees</button>
      <Card style={{marginBottom:14}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
          <div>
            <div style={{fontSize:20,fontWeight:800,color:'#1a1a2e'}}>{emp.name}</div>
            <div style={{fontSize:13,color:'#64748b',marginTop:2}}>{emp.role||'—'}</div>
            {emp.phone&&<div style={{fontSize:12,color:'#94a3b8',marginTop:4}}>📞 {emp.phone}</div>}
            {emp.join_date&&<div style={{fontSize:12,color:'#94a3b8',marginTop:2}}>Joined: {fmtD(emp.join_date)}</div>}
          </div>
          <button onClick={()=>setEditEmp({...emp})} style={{padding:'6px 12px',background:'#eff6ff',border:'1.5px solid #bfdbfe',borderRadius:8,fontSize:12,color:'#1d4ed8',cursor:'pointer',fontWeight:600}}>Edit</button>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginTop:14}}>
          <div style={{background:'#f8fafc',borderRadius:10,padding:'12px'}}><div style={{fontSize:10,color:'#64748b',fontWeight:700,textTransform:'uppercase'}}>Monthly Salary</div><div style={{fontSize:18,fontWeight:800,color:'#1a1a2e'}}>{fmt(emp.monthly_salary||0)}</div></div>
          <div style={{background:paidThisMonth>=( emp.monthly_salary||0)&&emp.monthly_salary>0?'#f0fdf4':'#fffbeb',borderRadius:10,padding:'12px'}}><div style={{fontSize:10,color:'#64748b',fontWeight:700,textTransform:'uppercase'}}>Paid ({curMonth})</div><div style={{fontSize:18,fontWeight:800,color:paidThisMonth>0?'#15803d':'#92400e'}}>{fmt(paidThisMonth)}</div></div>
        </div>
      </Card>
      
      <div style={{display:'flex',gap:8,marginBottom:14}}>
        <button onClick={()=>{setAttDate(todayStr());setView('attendance')}} style={{flex:1,padding:'11px',background:'#16a34a',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer'}}>📋 Mark Attendance</button>
        <button onClick={()=>{const ded=computeSalaryDeduction(emp,curMonth,att);setPayForm({emp,month:curMonth,amount:String(ded.payable),paid_date:todayStr(),payment:'cash',notes:''})}} style={{flex:1,padding:'11px',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:10,fontSize:13,fontWeight:700,cursor:'pointer'}}>💰 Pay Salary</button>
      </div>
      
      <SecL>📊 Attendance — {attMonth}</SecL>
      <input type="month" value={attMonth} onChange={e=>setAttMonth(e.target.value)} style={{width:'100%',padding:'8px 12px',border:'1.5px solid #cbd5e1',borderRadius:8,fontSize:13,marginBottom:10,outline:'none',boxSizing:'border-box'}}/>
      <Card style={{marginBottom:14}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
          {Object.entries(ATT_STATUS).map(([k,s])=>(<div key={k} style={{textAlign:'center',padding:'10px 4px',background:s.bg,borderRadius:10}}><div style={{fontSize:22,fontWeight:900,color:s.c}}>{attCounts[k]}</div><div style={{fontSize:10,color:s.c,fontWeight:700}}>{s.l}</div></div>))}
        </div>
        <div style={{fontSize:11,color:'#94a3b8',textAlign:'center',marginTop:10}}>Total marked: {empAtt.length} days</div>
        {(()=>{const ded=computeSalaryDeduction(emp,attMonth,att);if(ded.leaveUnits===0)return null;return(<div style={{marginTop:8,padding:'8px 12px',background:ded.deduction>0?'#fffbeb':'#f0fdf4',borderRadius:8,fontSize:11,textAlign:'center',color:ded.deduction>0?'#92400e':'#15803d',fontWeight:600}}>{ded.leaveUnits} leave/absent · {ded.excess>0?'Deduction: '+fmt(ded.deduction)+' ('+ded.excess+' over allowance)':'Within 2-day free allowance'}</div>)})()}
      </Card>
      
      <SecL>💰 Salary History</SecL>
      {empSals.length===0?<div style={{textAlign:'center',padding:'20px 0',color:'#ccc',fontSize:13}}>No salary payments yet</div>:
      <Card>
        {empSals.map(s=>(<div key={s.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f1f5f9'}}>
          <div><div style={{fontSize:13,fontWeight:700,color:'#1a1a2e'}}>{s.month}</div><div style={{fontSize:11,color:'#94a3b8'}}>Paid {fmtD(s.paid_date)} · {s.payment}{s.notes?' · '+s.notes:''}</div></div>
          <div style={{display:'flex',alignItems:'center',gap:6}}>
            <span style={{fontSize:15,fontWeight:800,color:'#15803d'}}>{fmt(s.amount)}</span>
            <button onClick={()=>genSalarySlip(emp,s.month,s.amount,s.paid_date,s.payment,s.notes)} style={{padding:'3px 10px',background:'#1a1a2e',border:'none',borderRadius:6,fontSize:10,color:'#c9a84c',cursor:'pointer',fontWeight:700}}>📄 Slip</button>
            <button onClick={()=>{if(window.confirm('Delete this salary payment record?\n\nNote: This does NOT delete the linked expense entry.'))actions.deleteSalaryPayment(s.id)}} style={{padding:'3px 8px',background:'#fef2f2',border:'1px solid #fecaca',borderRadius:6,fontSize:10,color:'#dc2626',cursor:'pointer',fontWeight:600}}>✕</button>
          </div>
        </div>))}
      </Card>}
      
      {/* Edit employee modal */}
      {editEmp&&<div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.6)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
        <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:460,padding:'20px 18px',maxHeight:'90vh',overflowY:'auto'}}>
          <div style={{fontSize:16,fontWeight:800,marginBottom:14}}>Edit Employee</div>
          <FInp label="Name" value={editEmp.name} onChange={e=>setEditEmp({...editEmp,name:e.target.value})}/>
          <FSel label="Role" value={editEmp.role||''} onChange={e=>setEditEmp({...editEmp,role:e.target.value})}><option value="">- Select -</option>{ROLES.map(r=><option key={r} value={r}>{r}</option>)}</FSel>
          <FInp label="Phone" value={editEmp.phone||''} onChange={e=>setEditEmp({...editEmp,phone:e.target.value})}/>
          <FInp label="Monthly Salary (Rs)" type="number" value={editEmp.monthly_salary||''} onChange={e=>setEditEmp({...editEmp,monthly_salary:e.target.value})}/>
          <FInp label="Join Date" type="date" value={editEmp.join_date||''} onChange={e=>setEditEmp({...editEmp,join_date:e.target.value})}/>
          <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,cursor:'pointer',margin:'10px 0'}}><input type="checkbox" checked={editEmp.active!==false} onChange={e=>setEditEmp({...editEmp,active:e.target.checked})} style={{width:18,height:18}}/>Active employee</label>
          <div style={{display:'flex',gap:8,marginTop:8}}>
            <button onClick={()=>setEditEmp(null)} style={{flex:1,padding:'11px',background:'#f3f4f6',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Cancel</button>
            <button onClick={saveEdit} style={{flex:2,padding:'11px',background:'#1d4ed8',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Save</button>
          </div>
        </div>
      </div>}
      
      {/* Pay salary modal */}
      {payForm&&<div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.6)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
        <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:460,padding:'20px 18px',maxHeight:'90vh',overflowY:'auto'}}>
          <div style={{fontSize:16,fontWeight:800,marginBottom:4}}>💰 Pay Salary — {payForm.emp.name}</div>
          <div style={{fontSize:11,color:'#94a3b8',marginBottom:14}}>This creates a salary record AND a matching expense entry.</div>
          <FInp label="Month (YYYY-MM)" type="month" value={payForm.month} onChange={e=>{const ded=computeSalaryDeduction(payForm.emp,e.target.value,att);setPayForm({...payForm,month:e.target.value,amount:String(ded.payable)})}}/>
          {(()=>{
            const ded=computeSalaryDeduction(payForm.emp,payForm.month,att)
            return(<div style={{background:ded.deduction>0?'#fffbeb':'#f0fdf4',border:'1px solid '+(ded.deduction>0?'#fde68a':'#bbf7d0'),borderRadius:10,padding:'12px 14px',marginBottom:12,fontSize:12}}>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4}}><span style={{color:'#475569'}}>Base salary</span><span style={{fontWeight:700,color:'#1a1a2e'}}>{fmt(payForm.emp.monthly_salary||0)}</span></div>
              <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,color:'#64748b'}}><span>Leave/absent taken</span><span>{ded.leaveUnits} {ded.leaveUnits===1?'day':'days'} (2 free)</span></div>
              {ded.excess>0?<>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:4,color:'#64748b'}}><span>Excess (deductible)</span><span>{ded.excess} {ded.excess===1?'day':'days'} × {fmt(ded.perDay)}/day</span></div>
                <div style={{display:'flex',justifyContent:'space-between',paddingTop:6,borderTop:'1px dashed '+(ded.deduction>0?'#fde68a':'#bbf7d0'),color:'#dc2626',fontWeight:700}}><span>Deduction</span><span>−{fmt(ded.deduction)}</span></div>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:4,fontWeight:800,fontSize:13}}><span style={{color:'#15803d'}}>Suggested payable</span><span style={{color:'#15803d'}}>{fmt(ded.payable)}</span></div>
              </>:<div style={{display:'flex',justifyContent:'space-between',paddingTop:6,borderTop:'1px dashed #bbf7d0',color:'#15803d',fontWeight:700}}><span>✓ Within 2-day allowance</span><span>No deduction</span></div>}
              <div style={{fontSize:10,color:'#94a3b8',marginTop:6,fontStyle:'italic'}}>Per-day = salary ÷ {ded.daysInMonth} days. You can override the amount below.</div>
            </div>)
          })()}
          <FInp label="Amount to pay (Rs) — editable" type="number" value={payForm.amount} onChange={e=>setPayForm({...payForm,amount:e.target.value})}/>
          <FInp label="Paid date" type="date" value={payForm.paid_date} onChange={e=>setPayForm({...payForm,paid_date:e.target.value})}/>
          <FSel label="Payment mode" value={payForm.payment} onChange={e=>setPayForm({...payForm,payment:e.target.value})}>{['cash','upi','bank','card'].map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}</FSel>
          <FInp label="Notes (optional)" value={payForm.notes} onChange={e=>setPayForm({...payForm,notes:e.target.value})}/>
          <div style={{display:'flex',gap:8,marginTop:14}}>
            <button onClick={()=>setPayForm(null)} style={{flex:1,padding:'11px',background:'#f3f4f6',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Cancel</button>
            <button onClick={async()=>{const amt=parseFloat(payForm.amount);if(!amt||amt<=0){alert('Enter amount');return}const ok=await actions.paySalary(payForm.emp,payForm.month,amt,payForm.paid_date,payForm.payment,payForm.notes);if(ok!==false){const pf=payForm;setPayForm(null);if(window.confirm('✅ Salary paid + expense recorded.\n\nGenerate salary slip now?'))genSalarySlip(pf.emp,pf.month,amt,pf.paid_date,pf.payment,pf.notes)}}} style={{flex:2,padding:'11px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Pay & Record</button>
          </div>
        </div>
      </div>}
    </div>)
  }
  
  // LIST VIEW (default)
  const curMonth=todayStr().slice(0,7)
  const totalSalary=emps.reduce((a,e)=>a+(e.monthly_salary||0),0)
  const paidThisMonth=sals.filter(s=>s.month===curMonth).reduce((a,s)=>a+s.amount,0)
  return(<div>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
      <SecL>👥 Employees ({emps.length})</SecL>
      <button onClick={()=>setShowAdd(true)} style={{padding:'7px 14px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:12,fontWeight:700,cursor:'pointer'}}>+ Add</button>
    </div>
    
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:14}}>
      <div style={{background:'#eff6ff',border:'1px solid #bfdbfe',borderRadius:12,padding:'14px'}}><div style={{fontSize:10,color:'#1d4ed8',fontWeight:700,textTransform:'uppercase'}}>Monthly Payroll</div><div style={{fontSize:20,fontWeight:800,color:'#1d4ed8'}}>{fmt(totalSalary)}</div></div>
      <div style={{background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:12,padding:'14px'}}><div style={{fontSize:10,color:'#15803d',fontWeight:700,textTransform:'uppercase'}}>Paid ({curMonth})</div><div style={{fontSize:20,fontWeight:800,color:'#15803d'}}>{fmt(paidThisMonth)}</div></div>
    </div>
    
    <button onClick={()=>{setAttDate(todayStr());setView('attendance')}} style={{width:'100%',padding:'12px',background:'linear-gradient(135deg,#1a1a2e,#16213e)',color:'#c9a84c',border:'none',borderRadius:12,fontSize:14,fontWeight:800,cursor:'pointer',marginBottom:14}}>📋 Mark Today's Attendance</button>
    
    {emps.length===0&&<div style={{textAlign:'center',padding:'32px 0',color:'#ccc',fontSize:14}}>No employees yet. Tap "+ Add" to start.</div>}
    {emps.map(emp=>{
      const paidM=sals.filter(s=>s.employee_id===emp.id&&s.month===curMonth).reduce((a,s)=>a+s.amount,0)
      const todayAtt=att.find(a=>a.employee_id===emp.id&&a.date===todayStr())
      const ATT_C={present:'#16a34a',absent:'#dc2626',half:'#d97706',leave:'#7c3aed'}
      return(<Card key={emp.id} style={{marginBottom:8}}>
        <div onClick={()=>{setSelEmp(emp.id);setView('detail')}} style={{cursor:'pointer',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:15,fontWeight:700,color:'#1d4ed8',textDecoration:'underline'}}>{emp.name}</div>
            <div style={{fontSize:11,color:'#94a3b8',marginTop:2}}>{emp.role||'—'}{emp.monthly_salary?' · '+fmt(emp.monthly_salary)+'/mo':''}</div>
          </div>
          <div style={{textAlign:'right'}}>
            {todayAtt&&<div style={{fontSize:10,fontWeight:700,color:ATT_C[todayAtt.status]||'#94a3b8',marginBottom:2}}>● {todayAtt.status}</div>}
            <div style={{fontSize:12,fontWeight:700,color:paidM>0?'#15803d':'#94a3b8'}}>{paidM>0?fmt(paidM)+' paid':'unpaid'}</div>
          </div>
        </div>
      </Card>)
    })}
    
    {inactiveEmps.length>0&&<><SecL>Inactive ({inactiveEmps.length})</SecL>
    {inactiveEmps.map(emp=>(<Card key={emp.id} style={{marginBottom:6,opacity:.6}}><div onClick={()=>{setSelEmp(emp.id);setView('detail')}} style={{cursor:'pointer',fontSize:14,fontWeight:600,color:'#64748b'}}>{emp.name} <span style={{fontSize:11}}>({emp.role})</span></div></Card>))}</>}
    
    {/* Add employee modal */}
    {showAdd&&<div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,.6)',zIndex:300,display:'flex',alignItems:'center',justifyContent:'center',padding:14}}>
      <div style={{background:'#fff',borderRadius:14,width:'100%',maxWidth:460,padding:'20px 18px',maxHeight:'90vh',overflowY:'auto'}}>
        <div style={{fontSize:16,fontWeight:800,marginBottom:14}}>+ Add Employee</div>
        <FInp label="Name *" value={addF.name} onChange={e=>setAddF({...addF,name:e.target.value})}/>
        <FSel label="Role" value={addF.role} onChange={e=>setAddF({...addF,role:e.target.value})}><option value="">- Select -</option>{ROLES.map(r=><option key={r} value={r}>{r}</option>)}</FSel>
        <FInp label="Phone" value={addF.phone} onChange={e=>setAddF({...addF,phone:e.target.value})}/>
        <FInp label="Monthly Salary (Rs)" type="number" value={addF.monthly_salary} onChange={e=>setAddF({...addF,monthly_salary:e.target.value})}/>
        <FInp label="Join Date" type="date" value={addF.join_date} onChange={e=>setAddF({...addF,join_date:e.target.value})}/>
        <div style={{display:'flex',gap:8,marginTop:14}}>
          <button onClick={()=>setShowAdd(false)} style={{flex:1,padding:'11px',background:'#f3f4f6',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Cancel</button>
          <button onClick={saveAdd} style={{flex:2,padding:'11px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:700,cursor:'pointer'}}>Add Employee</button>
        </div>
      </div>
    </div>}
  </div>)
}

const ConsultantsTab=({db,actions})=>{
  const [showAdd,setShowAdd]=useState(false)
  const [payDocC,setPayDocC]=useState(null)
  const [editId,setEditId]=useState(null)
  const [busy,setBusy]=useState(false)
  const blank={name:'',phone:'',fee_share_pct:0,op_p_pct:0,op_l_pct:0,op_r_pct:0}
  const [form,setForm]=useState(blank)
  const save=async()=>{
    if(!form.name.trim()){alert('Consultant name required');return}
    const pct=parseFloat(form.fee_share_pct)||0
    if(pct>100){alert('Fee share % cannot exceed 100.\n\nYou entered '+pct+' — this looks like a rupee amount, not a percentage.\nE.g. if the doctor gets half the fee, enter 50.');return}
    const safeForm={...form,fee_share_pct:pct}
    setBusy(true)
    if(editId){await actions.updateConsultant(editId,safeForm);setEditId(null)}
    else{await actions.addConsultant(safeForm)}
    setForm(blank);setShowAdd(false);setBusy(false)
  }
  const startEdit=d=>{setForm({name:d.name,phone:d.phone||'',fee_share_pct:d.fee_share_pct||0,op_p_pct:d.op_p_pct||0,op_l_pct:d.op_l_pct||0,op_r_pct:d.op_r_pct||0});setEditId(d.id);setShowAdd(true);setTimeout(()=>window.scrollTo({top:0,behavior:'smooth'}),50)}
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
        <div style={{marginTop:12}}>
          <label style={{display:'block',fontSize:10,color:'#0f766e',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>OP Procedure commission %</label>
          <div style={{position:'relative'}}>
            <input style={{...S.inp,paddingRight:28,borderColor:'#99f6e4'}} type="number" inputMode="numeric" min="0" max="100" value={form.op_p_pct} onChange={e=>setForm({...form,op_p_pct:Math.min(100,parseFloat(e.target.value)||0)})}/>
            <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'#aaa',fontWeight:700}}>%</span>
          </div>
          <div style={{fontSize:11,color:'#94a3b8',marginTop:4}}>Commission the consultant gets on OP Procedure entries</div>
        </div>
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
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:6}}>
        {[{l:'Fee share',v:d.fee_share_pct+'%',c:'#7e22ce',sub:'of consultation'},{l:'OP Proc comm',v:(d.op_p_pct||0)+'%',c:(d.op_p_pct||0)>0?'#0f766e':'#ccc'},{l:'Lab comm',v:d.op_l_pct+'%',c:d.op_l_pct>0?'#7e22ce':'#ccc'},{l:'Pharmacy comm',v:d.op_r_pct+'%',c:d.op_r_pct>0?'#c2410c':'#ccc'}].map((m,i)=>(
          <div key={i} style={{background:'#f9f9f9',borderRadius:8,padding:'8px',textAlign:'center'}}>
            <div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase',marginBottom:2}}>{m.l}</div>
            <div style={{fontSize:16,fontWeight:800,color:m.c}}>{m.v}</div>
            {m.sub&&<div style={{fontSize:9,color:'#aaa'}}>{m.sub}</div>}
          </div>
        ))}
      </div>
      {(()=>{
        const fEnts=(db.income||[]).filter(e=>e.consultant_name===d.name&&(e.consultant_fee||0)>0)
        const earned=fEnts.reduce((a,e)=>a+(e.consultant_fee||0),0)
        if(earned<=0)return null
        const cf=fEnts.filter(e=>e.type!=='op_p').reduce((a,e)=>a+(e.consultant_fee||0),0)
        const pc=fEnts.filter(e=>e.type==='op_p').reduce((a,e)=>a+(e.consultant_fee||0),0)
        const cfPaid=(db.expenses||[]).filter(e=>e.category==='consultant_fee'&&(e.description||'').toLowerCase().includes(d.name.toLowerCase())).reduce((a,e)=>a+e.amount,0)
        const pcPaid=(db.expenses||[]).filter(e=>e.category==='consultant_proc_comm'&&(e.description||'').toLowerCase().includes(d.name.toLowerCase())).reduce((a,e)=>a+e.amount,0)
        const paid=cfPaid+pcPaid
        const bal=earned-paid,cfBal=cf-cfPaid,pcBal=pc-pcPaid
        return(<div style={{marginTop:8,padding:'8px 0',borderTop:'1px solid #f5f5f5'}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:6,marginBottom:(cfBal>0||pcBal>0)?8:0}}>
          <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Fees earned</div><div style={{fontSize:13,fontWeight:700,color:'#7e22ce'}}>{fmt(earned)}</div></div>
          <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Paid</div><div style={{fontSize:13,fontWeight:700,color:'#16a34a'}}>{fmt(paid)}</div></div>
          <div style={{textAlign:'center'}}><div style={{fontSize:9,color:'#aaa',fontWeight:700,textTransform:'uppercase'}}>Balance</div><div style={{fontSize:13,fontWeight:700,color:bal>0?'#ef4444':'#16a34a'}}>{fmt(bal)}</div></div>
          </div>
          {cfBal>0&&(payDocC==='CF:'+d.name?<CommPayForm docName={d.name} balance={cfBal} onCancel={()=>setPayDocC(null)} onSave={async(amt,date,pay)=>{await actions.addExpense({id:uid(),date,category:'consultant_fee',amount:amt,description:'Dr. '+d.name,payment:pay,is_monthly:false});setPayDocC(null)}}/>:<button onClick={()=>setPayDocC('CF:'+d.name)} style={{width:'100%',padding:'8px',background:'#7e22ce',color:'#fff',border:'none',borderRadius:10,fontSize:12,fontWeight:600,cursor:'pointer',marginBottom:6}}>+ Pay consultation fee ({fmt(cfBal)})</button>)}
          {pcBal>0&&(payDocC==='PC:'+d.name?<CommPayForm docName={d.name} balance={pcBal} onCancel={()=>setPayDocC(null)} onSave={async(amt,date,pay)=>{await actions.addExpense({id:uid(),date,category:'consultant_proc_comm',amount:amt,description:'Dr. '+d.name,payment:pay,is_monthly:false});setPayDocC(null)}}/>:<button onClick={()=>setPayDocC('PC:'+d.name)} style={{width:'100%',padding:'8px',background:'#0f766e',color:'#fff',border:'none',borderRadius:10,fontSize:12,fontWeight:600,cursor:'pointer'}}>+ Pay procedure commission ({fmt(pcBal)})</button>)}
        </div>)
      })()}
    </Card>))}
  </div>)
}

/*  PAYMENT PAGE  */

const PaymentPage=({onBack=null,session:passedSession=null})=>{
  const [plan,setPlan]=useState('pro')
  const [billing,setBilling]=useState('monthly')
  const [busy,setBusy]=useState(false)
  const [err,setErr]=useState('')
  const [currentPlan,setCurrentPlan]=useState(null)
  const [currentBilling,setCurrentBilling]=useState(null)
  const SUPABASE_URL='https://wlgbhrmycequuiabpwqf.supabase.co'
  const RZP_KEY='rzp_live_Sk2iKfvRngPIJH'
  const PLANS={
    starter:{label:'Starter',monthly:600,yearly:6000,desc:'Unlimited patients, IP & OP, Referral commissions, 5 staff'},
    pro:{label:'Pro',monthly:900,yearly:9000,desc:'Everything + Area reports, Consultant module, All reports, Unlimited staff',popular:true},
    enterprise:{label:'Enterprise',monthly:1900,yearly:19000,desc:'Everything + Multi-hospital, Dedicated support, Phone support'},
  }
  // Load hospital's current plan on mount
  useEffect(()=>{
    const loadPlan=async()=>{
      let session=passedSession
      if(!session){const r=await supabase.auth.getSession();session=r.data?.session}
      if(!session)return
      const {data:prof}=await supabase.from('profiles').select('hospital_id').eq('id',session.user.id).single()
      if(!prof?.hospital_id)return
      const {data:hosp}=await supabase.from('hospitals').select('plan').eq('id',prof.hospital_id).single()
      if(hosp?.plan&&hosp.plan!=='trial'){
        setCurrentPlan(hosp.plan)
        // Auto-select next tier up
        const tiers=['starter','pro','enterprise']
        const idx=tiers.indexOf(hosp.plan)
        if(idx<tiers.length-1)setPlan(tiers[idx+1])
        else setPlan(hosp.plan)
      }
    }
    loadPlan()
  },[])

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
    let session=passedSession
    if(!session){const r=await supabase.auth.getSession();session=r.data?.session}
    if(!session){window.location.href=window.location.pathname+'?upgrade=true';setErr('Please login first.');setBusy(false);return}
    const {data:prof}=await supabase.from('profiles').select('*').eq('id',session.user.id).single()
    const hid=prof?.hospital_id
    if(!hid){setErr('Hospital not found. Please register your hospital first.');setBusy(false);return}
    const {data:hosp}=await supabase.from('hospitals').select('*').eq('id',hid).single()
    const p=PLANS[plan]
    const amt=(billing==='monthly'?p.monthly:p.yearly)*100
    // Create Razorpay Subscription
    const res=await fetch(SUPABASE_URL+'/functions/v1/create-subscription',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':'sb_publishable_1I_V4RUqeSpzu7d0NXlhVg_z4rs0UbZ'},
      body:JSON.stringify({hospital_id:hid,plan,billing})
    })
    const subData=await res.json()
    if(!res.ok||subData.error){setErr(subData.error||'Could not create subscription');setBusy(false);return}
    const rzp=new window.Razorpay({
      key:RZP_KEY,
      subscription_id:subData.subscription_id,
      name:'EasyMedical Solutions',
      description:p.label+' - Auto-renews '+billing,
      prefill:{name:hosp?.name||'',email:session.user.email||'',contact:hosp?.phone||''},
      theme:{color:'#16a34a'},
      handler:async(response)=>{
        const vres=await fetch(SUPABASE_URL+'/functions/v1/verify-subscription',{
          method:'POST',
          headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':'sb_publishable_1I_V4RUqeSpzu7d0NXlhVg_z4rs0UbZ'},
          body:JSON.stringify({...response,hospital_id:hid,plan,billing,subscription_id:subData.subscription_id})
        })
        const vdata=await vres.json()
        if(vdata.success){
          alert('Subscription activated! '+p.label+' plan auto-renews every '+(billing==='monthly'?'month':'year')+'. Active until '+vdata.plan_end)
          window.location.reload()
        } else {
          setErr('Activation failed. Contact support@easymedicalsolutions.in')
        }
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
          {Object.entries(PLANS).map(([k,pl])=>{
              const tiers=['starter','pro','enterprise']
              const currentIdx=tiers.indexOf(currentPlan)
              const thisIdx=tiers.indexOf(k)
              const isLocked=currentPlan&&thisIdx<currentIdx  // only lock LOWER tiers
              const isCurrent=currentPlan===k
              return(<div key={k} onClick={()=>!isLocked&&setPlan(k)} style={{background:isCurrent?'rgba(255,255,255,0.05)':plan===k?'rgba(0,192,107,0.08)':'rgba(255,255,255,0.03)',border:isCurrent?'1px solid rgba(255,255,255,0.15)':plan===k?'2px solid rgba(0,192,107,0.5)':'1px solid rgba(255,255,255,0.08)',borderRadius:16,padding:'16px',cursor:isLocked?'not-allowed':'pointer',opacity:isLocked?0.5:1,transition:'all .2s',position:'relative'}}>
              {isCurrent&&<div style={{position:'absolute',top:-10,right:16,background:'rgba(255,255,255,0.2)',color:'#fff',fontSize:9,fontWeight:800,padding:'3px 12px',borderRadius:100}}>CURRENT PLAN</div>}
              {!isCurrent&&pl.popular&&!isLocked&&<div style={{position:'absolute',top:-10,right:16,background:'linear-gradient(135deg,#16a34a,#22c55e)',color:'#0a1628',fontSize:9,fontWeight:800,padding:'3px 12px',borderRadius:100}}>POPULAR</div>}
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
            </div>)
          })}
        </div>
        {err&&<div style={{background:'rgba(220,38,38,0.12)',border:'1px solid rgba(220,38,38,0.25)',borderRadius:10,padding:'10px 14px',color:'#fca5a5',fontSize:13,textAlign:'center',marginBottom:12}}>{err}</div>}
        <button onClick={pay} disabled={busy} style={{width:'100%',padding:'15px',background:busy?'rgba(0,192,107,0.3)':'linear-gradient(135deg,#00c06b,#00e87f)',color:busy?'rgba(255,255,255,0.4)':'#0a1628',border:'none',borderRadius:14,fontSize:16,fontWeight:800,cursor:busy?'not-allowed':'pointer',letterSpacing:'-0.3px',boxShadow:busy?'none':'0 8px 24px rgba(0,192,107,0.3)'}}>
          {busy?'Setting up...':((currentPlan&&currentPlan!==plan?'Upgrade to '+PLANS[plan].label+' - ':'')+' Rs '+(billing==='monthly'?PLANS[plan].monthly:PLANS[plan].yearly).toLocaleString('en-IN')+'/'+(billing==='monthly'?'mo':'yr'))}
        </button>
        <div style={{textAlign:'center',marginTop:14,fontSize:11,color:'rgba(255,255,255,0.25)'}}>
          Auto-renewing subscription via Razorpay &nbsp;&nbsp; UPI Autopay, Cards
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
    const srToday=todayStr()
    const srThisMonth=srToday.slice(0,7)
    const srLastMonth=(()=>{const d=new Date();d.setMonth(d.getMonth()-1);return d.toISOString().slice(0,7)})()
    const srInc=db.income||[]
    const srExps=(db.expenses||[]).filter(e=>e.category!=='ref_paid')
    
    // Low revenue alert — this month vs last month
    const thisMonthInc=srInc.filter(e=>e.date?.startsWith(srThisMonth)).reduce((a,e)=>a+(e.amount||0),0)
    const lastMonthInc=srInc.filter(e=>e.date?.startsWith(srLastMonth)).reduce((a,e)=>a+(e.amount||0),0)
    const revDrop=lastMonthInc>0&&thisMonthInc<lastMonthInc*0.7  // 30% drop
    
    // High expenses alert — expenses > 60% of income this month
    const thisMonthExp=srExps.filter(e=>e.date?.startsWith(srThisMonth)).reduce((a,e)=>a+(e.amount||0),0)
    const expHigh=thisMonthInc>0&&thisMonthExp>thisMonthInc*0.6
    
    // Today low revenue — today income < 30% of daily average
    const daysInMonth=new Date().getDate()
    const dailyAvg=thisMonthInc/Math.max(daysInMonth,1)
    const todayInc=srInc.filter(e=>e.date===srToday).reduce((a,e)=>a+(e.amount||0),0)
    const todayLow=daysInMonth>5&&todayInc<dailyAvg*0.3&&new Date().getHours()>14
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
const QuickAttendance=({db,actions})=>{
  const [collapsed,setCollapsed]=useState(false)
  const today=todayStr()
  const [attD,setAttD]=useState(today)
  const monthStart=today.slice(0,8)+'01'
  const emps=(db.employees||[]).filter(e=>e.active!==false)
  const att=db.attendance||[]
  if(emps.length===0)return null
  const dayAtt={};att.filter(a=>a.date===attD).forEach(a=>{dayAtt[a.employee_id]=a.status})
  const markedCount=Object.keys(dayAtt).length
  const isToday=attD===today
  const ATT={present:{l:'P',c:'#16a34a',bg:'#dcfce7'},absent:{l:'A',c:'#dc2626',bg:'#fee2e2'},half:{l:'½',c:'#d97706',bg:'#fef3c7'},leave:{l:'L',c:'#7c3aed',bg:'#ede9fe'}}
  return(<div style={{background:'#fff',border:'2px solid #e0e7ff',borderRadius:16,padding:'14px 16px',marginBottom:14}}>
    <div onClick={()=>setCollapsed(!collapsed)} style={{display:'flex',justifyContent:'space-between',alignItems:'center',cursor:'pointer',marginBottom:collapsed?0:12}}>
      <div style={{fontSize:14,fontWeight:800,color:'#1a1a2e'}}>📋 {isToday?"Today's Attendance":'Attendance — '+fmtD(attD)} <span style={{fontSize:11,fontWeight:600,color:markedCount===emps.length?'#16a34a':'#f59e0b',marginLeft:6}}>{markedCount}/{emps.length} marked</span></div>
      <span style={{fontSize:13,color:'#94a3b8'}}>{collapsed?'▶':'▼'}</span>
    </div>
    {!collapsed&&<div style={{display:'flex',flexDirection:'column',gap:8}}>
      <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:2}}>
        <span style={{fontSize:11,color:'#64748b',fontWeight:700,whiteSpace:'nowrap'}}>Date:</span>
        <input type="date" value={attD} min={monthStart} max={today} onChange={e=>{const v=e.target.value;if(v>=monthStart&&v<=today)setAttD(v)}} style={{flex:1,padding:'8px 10px',border:'1.5px solid #cbd5e1',borderRadius:8,fontSize:13,outline:'none'}}/>
        {!isToday&&<button onClick={()=>setAttD(today)} style={{padding:'8px 12px',background:'#eef2ff',border:'1px solid #c7d2fe',borderRadius:8,fontSize:11,fontWeight:700,color:'#4338ca',cursor:'pointer',whiteSpace:'nowrap'}}>Today</button>}
      </div>
      {!isToday&&<div style={{fontSize:11,color:'#d97706',fontWeight:600,background:'#fffbeb',border:'1px solid #fde68a',borderRadius:8,padding:'6px 10px'}}>⏪ Back-filling attendance for {fmtD(attD)}</div>}
      <button onClick={async()=>{for(const emp of emps){if(dayAtt[emp.id]!=='present')await actions.markAttendance(emp.id,attD,'present')}}} style={{padding:'10px',background:'#16a34a',color:'#fff',border:'none',borderRadius:8,fontSize:13,fontWeight:800,cursor:'pointer',marginBottom:2}}>✓ Mark all Present ({emps.length})</button>
      {emps.map(emp=>{
        const cur=dayAtt[emp.id]
        return(<div key={emp.id} style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{flex:1,minWidth:0,fontSize:13,fontWeight:600,color:'#1a1a2e',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{emp.name}<span style={{fontSize:10,color:'#94a3b8',fontWeight:500,marginLeft:4}}>{emp.role}</span></div>
          <div style={{display:'flex',gap:4}}>
            {Object.entries(ATT).map(([k,s])=>(
              <button key={k} onClick={()=>actions.markAttendance(emp.id,attD,k)} title={k} style={{width:34,height:34,borderRadius:8,border:cur===k?'2px solid '+s.c:'1.5px solid #e5e7eb',background:cur===k?s.bg:'#fff',color:cur===k?s.c:'#cbd5e1',fontSize:13,fontWeight:800,cursor:'pointer',padding:0}}>{s.l}</button>
            ))}
          </div>
        </div>)
      })}
      <div style={{fontSize:10,color:'#94a3b8',textAlign:'center',marginTop:2}}>P=Present · A=Absent · ½=Half day · L=Leave</div>
    </div>}
  </div>)
}

const AnalyticsDash=({db,actions})=>{
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
      <QuickAttendance db={db} actions={actions}/>
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

      {/* DAILY REAL & ACTUAL INCOME */}
      <SecL>Today's income</SecL>
      <div style={{borderRadius:18,overflow:'hidden',marginBottom:16}}>
        <div style={{background:'linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%)',padding:'18px 20px'}}>
          <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.1em',marginBottom:12}}>{new Date(today+'T00:00:00').toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'short'})}</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
            <div style={{background:'rgba(255,255,255,0.07)',borderRadius:12,padding:'12px'}}>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Real income</div>
              <div style={{fontSize:22,fontWeight:900,color:'#4ade80'}}>{fmt(todayTotal-todayComm)}</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.35)',marginTop:3}}>After ref commissions</div>
            </div>
            <div style={{background:'rgba(255,255,255,0.07)',borderRadius:12,padding:'12px'}}>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.5)',fontWeight:700,textTransform:'uppercase',marginBottom:4}}>Actual income</div>
              <div style={{fontSize:22,fontWeight:900,color:'#34d399'}}>{fmt(todayTotal-todayComm-todayExpTotal)}</div>
              <div style={{fontSize:10,color:'rgba(255,255,255,0.35)',marginTop:3}}>After all expenses</div>
            </div>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11}}><span style={{color:'rgba(255,255,255,0.4)'}}>Gross collected</span><span style={{color:'rgba(255,255,255,0.8)',fontWeight:600}}>{fmt(todayTotal)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11}}><span style={{color:'rgba(255,255,255,0.4)'}}>Commissions</span><span style={{color:'#fbbf24',fontWeight:600}}>- {fmt(todayComm)}</span></div>
            <div style={{display:'flex',justifyContent:'space-between',fontSize:11}}><span style={{color:'rgba(255,255,255,0.4)'}}>Expenses</span><span style={{color:'#f87171',fontWeight:600}}>- {fmt(todayExpTotal)}</span></div>
          </div>
        </div>
      </div>

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
