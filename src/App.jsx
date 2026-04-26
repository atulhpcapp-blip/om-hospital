import { useState, useEffect, useCallback } from 'react'
import { supabase } from './supabase.js'

/* ── constants ── */
const ITYPES = [
  {key:'op',  label:'OP',   full:'OP Consultation'},
  {key:'ip',  label:'IP',   full:'IP Charges'},
  {key:'op_r',label:'OP-R', full:'OP Pharmacy'},
  {key:'ip_r',label:'IP-R', full:'IP Pharmacy'},
  {key:'op_l',label:'OP-L', full:'OP Lab'},
  {key:'ip_l',label:'IP-L', full:'IP Lab'},
]
const ECATS = [
  {key:'ip_ref',label:'IP Referral commission'},
  {key:'op_ref',label:'OP Referral commission'},
  {key:'rent',label:'Hospital rent'},
  {key:'electricity',label:'Electricity'},
  {key:'water',label:'Water'},
  {key:'salary',label:'Staff salary'},
  {key:'supplies',label:'Medical supplies'},
  {key:'misc',label:'Miscellaneous'},
]
const PMODES  = ['cash','upi','card','credit','other']
const MOS     = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MOFULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const COMM    = {op:0,ip:0.40,op_r:0.40,ip_r:0.40,op_l:0.50,ip_l:0.50}
const CLBL    = {op:'None',ip:'40%',op_r:'40%',ip_r:'40%',op_l:'50%',ip_l:'50%'}
const TC      = {op:['#dbeafe','#1d4ed8'],ip:['#dcfce7','#16a34a'],op_r:['#fef3c7','#b45309'],ip_r:['#ffedd5','#c2410c'],op_l:['#fce7f3','#9d174d'],ip_l:['#f3e8ff','#7e22ce']}
const ROLES   = ['admin','management','accounts','staff']

// convert username → fake email for Supabase auth
const toEmail = u => `${u.toLowerCase().replace(/\s+/g,'')}@omhospital.app`

/* ── helpers ── */
const todayStr  = () => new Date().toISOString().split('T')[0]
const uid       = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6)
const fmt       = n  => '₹'+(Math.round(n)||0).toLocaleString('en-IN')
const fmtD      = d  => {if(!d)return '—';const x=new Date(d+'T00:00:00');return `${x.getDate()} ${MOS[x.getMonth()]} ${x.getFullYear()}`}
const getRefDoc = (e,pats) => e.ref_doctor||pats.find(p=>p.id===e.patient_id)?.ref_doctor||null
const getComm   = e  => e.amount*(COMM[e.type]||0)
const sumInc    = list=>{const r={};ITYPES.forEach(t=>{r[t.key]=list.filter(e=>e.type===t.key).reduce((a,e)=>a+e.amount,0)});r.total=Object.values(r).reduce((a,b)=>a+b,0);return r}
const sumExp    = list=>{const r={};ECATS.forEach(c=>{r[c.key]=list.filter(e=>e.category===c.key).reduce((a,e)=>a+e.amount,0)});r.total=Object.values(r).reduce((a,b)=>a+b,0);return r}
const totalRef  = (list,pats) => list.reduce((a,e)=>a+(getRefDoc(e,pats)?getComm(e):0),0)
const buildRef  = (income,pats) => {
  const docs={}
  income.forEach(e=>{
    const doc=getRefDoc(e,pats);const comm=getComm(e)
    if(!doc||!comm)return
    if(!docs[doc])docs[doc]={name:doc,total_income:0,total_commission:0,by_type:{}}
    docs[doc].total_income+=e.amount;docs[doc].total_commission+=comm
    if(!docs[doc].by_type[e.type])docs[doc].by_type[e.type]={income:0,commission:0}
    docs[doc].by_type[e.type].income+=e.amount;docs[doc].by_type[e.type].commission+=comm
  })
  return Object.values(docs).sort((a,b)=>b.total_commission-a.total_commission)
}

/* ── styles ── */
const S = {
  inp:{width:'100%',padding:'11px 14px',border:'1px solid #e5e7eb',borderRadius:12,fontSize:16,background:'#fff',color:'#111',boxSizing:'border-box',fontFamily:'inherit',WebkitAppearance:'none',outline:'none'},
  sel:{width:'100%',padding:'11px 14px',border:'1px solid #e5e7eb',borderRadius:12,fontSize:16,background:'#fff',color:'#111',boxSizing:'border-box',fontFamily:'inherit',outline:'none'},
  lbl:{display:'block',fontSize:11,color:'#888',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:5,fontWeight:700},
  card:{background:'#fff',border:'1px solid #f0f0f0',borderRadius:14,padding:'14px 16px',marginBottom:12},
  sec:{fontSize:10,fontWeight:700,color:'#aaa',textTransform:'uppercase',letterSpacing:'.06em',marginTop:16,marginBottom:8},
  pbtn:{width:'100%',padding:'13px',background:'#111',color:'#fff',border:'none',borderRadius:12,fontSize:15,fontWeight:700,cursor:'pointer',marginTop:4},
  gbtn:{padding:'9px 14px',background:'none',border:'1px solid #e5e7eb',borderRadius:10,fontSize:14,color:'#555',cursor:'pointer'},
  dbtn:{padding:'4px 10px',background:'none',border:'1px solid #fca5a5',borderRadius:6,fontSize:12,color:'#ef4444',cursor:'pointer'},
}

/* ── UI primitives ── */
const Lbl  = ({c})               => <label style={S.lbl}>{c}</label>
const Card = ({children,style={}}) => <div style={{...S.card,...style}}>{children}</div>
const SecL = ({children})        => <div style={S.sec}>{children}</div>
const PBtn = ({children,onClick,disabled,style={}}) => <button style={{...S.pbtn,opacity:disabled?.5:1,...style}} onClick={onClick} disabled={disabled}>{children}</button>
const GBtn = ({children,onClick,style={}}) => <button style={{...S.gbtn,...style}} onClick={onClick}>{children}</button>
const DBtn = ({children,onClick}) => <button style={S.dbtn} onClick={onClick}>{children}</button>
const Pill = ({label,bg='#e5e7eb',tx='#555'}) => <span style={{fontSize:10,padding:'2px 7px',borderRadius:20,background:bg,color:tx,fontWeight:700,marginLeft:4}}>{label}</span>
const TypeTag = ({t}) => {const [bg,tx]=TC[t]||['#f0f0f0','#555'];const it=ITYPES.find(x=>x.key===t);return <span style={{fontSize:10,padding:'2px 8px',borderRadius:20,background:bg,color:tx,fontWeight:700}}>{it?.label||t}</span>}
const Row = ({left,sub,right,onClick}) => (
  <div onClick={onClick} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0',borderBottom:'1px solid #f5f5f5',cursor:onClick?'pointer':'default'}}>
    <div style={{flex:1,minWidth:0,paddingRight:8}}>
      <div style={{fontSize:13,fontWeight:500,color:'#111'}}>{left}</div>
      {sub&&<div style={{fontSize:11,color:'#aaa',marginTop:2}}>{sub}</div>}
    </div>
    <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>{right}</div>
  </div>
)
const MetGrid = ({items}) => (
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
const FInp = ({label,value,onChange,...rest}) => (
  <div style={{marginBottom:10}}>
    {label&&<Lbl c={label}/>}
    <input style={S.inp} value={value} onChange={onChange} {...rest}/>
  </div>
)
const FSel = ({label,value,onChange,children}) => (
  <div style={{marginBottom:10}}>
    {label&&<Lbl c={label}/>}
    <select style={S.sel} value={value} onChange={onChange}>{children}</select>
  </div>
)

/* ══════════════════════════════════════════
   LOGIN PAGE — username + password only
══════════════════════════════════════════ */
const LoginPage = () => {
  const [username,setUsername] = useState('')
  const [pass,setPass]         = useState('')
  const [err,setErr]           = useState('')
  const [busy,setBusy]         = useState(false)
  const [showPass,setShowPass] = useState(false)

  const go = async () => {
    if(!username.trim()||!pass){setErr('Enter username and password');return}
    setBusy(true);setErr('')
    const {error}=await supabase.auth.signInWithPassword({email:toEmail(username),password:pass})
    if(error)setErr('Wrong username or password. Please try again.')
    setBusy(false)
  }

  return (
    <div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg,#f0f9ff 0%,#f7f7f7 100%)',padding:20}}>
      <div style={{width:'100%',maxWidth:380}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:56,marginBottom:12}}>🏥</div>
          <div style={{fontSize:26,fontWeight:800,color:'#111'}}>Om Hospital</div>
          <div style={{fontSize:14,color:'#aaa',marginTop:6}}>Accounts & Finance System</div>
        </div>
        <Card style={{boxShadow:'0 4px 24px rgba(0,0,0,0.06)'}}>
          <div style={{fontSize:16,fontWeight:700,color:'#111',marginBottom:16,textAlign:'center'}}>Staff Login</div>
          <FInp
            label="Username"
            type="text"
            placeholder="Enter your username"
            value={username}
            onChange={e=>setUsername(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <div style={{marginBottom:10}}>
            <Lbl c="Password"/>
            <div style={{position:'relative'}}>
              <input
                style={{...S.inp,paddingRight:50}}
                type={showPass?'text':'password'}
                placeholder="Enter your password"
                value={pass}
                onChange={e=>setPass(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&go()}
              />
              <button onClick={()=>setShowPass(!showPass)} style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',fontSize:18,cursor:'pointer',color:'#aaa'}}>
                {showPass?'🙈':'👁️'}
              </button>
            </div>
          </div>
          {err&&<div style={{fontSize:13,color:'#dc2626',marginBottom:10,padding:'8px 12px',borderRadius:8,background:'#fef2f2',textAlign:'center'}}>{err}</div>}
          <PBtn onClick={go} disabled={busy||!username||!pass} style={{marginTop:8}}>
            {busy?'Logging in…':'Login'}
          </PBtn>
        </Card>
        <div style={{textAlign:'center',fontSize:12,color:'#ccc',marginTop:20}}>
          Contact your admin if you forgot your password
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   ADMIN TAB — manage users
══════════════════════════════════════════ */
const AdminTab = ({currentUser}) => {
  const [users,setUsers]   = useState([])
  const [loading,setLoading]= useState(true)
  const [showAdd,setShowAdd]= useState(false)
  const [nF,setNF]         = useState({name:'',username:'',pass:'',role:'staff'})
  const [busy,setBusy]     = useState(false)
  const [msg,setMsg]       = useState(null)

  useEffect(()=>{
    supabase.from('profiles').select('*').order('name').then(({data})=>{setUsers(data||[]);setLoading(false)})
  },[])

  const createUser = async () => {
    if(!nF.name.trim()||!nF.username.trim()||!nF.pass.trim()){setMsg({ok:false,t:'Fill in all fields'});return}
    if(nF.pass.length<6){setMsg({ok:false,t:'Password must be at least 6 characters'});return}
    setBusy(true);setMsg(null)
    const email=toEmail(nF.username)
    const {data,error}=await supabase.auth.signUp({email,password:nF.pass,options:{data:{name:nF.name}}})
    if(error){setMsg({ok:false,t:error.message});setBusy(false);return}
    if(data.user){
      await supabase.from('profiles').upsert({id:data.user.id,name:nF.name,username:nF.username.toLowerCase(),role:nF.role})
      setMsg({ok:true,t:`✅ Account created for ${nF.name}! Username: ${nF.username}`})
      setNF({name:'',username:'',pass:'',role:'staff'})
      setShowAdd(false)
      const {data:ud}=await supabase.from('profiles').select('*').order('name')
      setUsers(ud||[])
    }
    setBusy(false)
  }

  const ROLE_COLORS = {admin:['#fee2e2','#dc2626'],management:['#fef3c7','#d97706'],accounts:['#dbeafe','#2563eb'],staff:['#f0fdf4','#16a34a']}

  return (
    <div>
      <div style={{background:'linear-gradient(135deg,#111 0%,#374151 100%)',borderRadius:16,padding:'20px 16px',marginBottom:16,color:'#fff'}}>
        <div style={{fontSize:12,color:'#9ca3af',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Logged in as</div>
        <div style={{fontSize:18,fontWeight:700}}>{currentUser.name||'Admin'}</div>
        <div style={{fontSize:12,color:'#9ca3af',marginTop:2}}>Administrator · Om Hospital</div>
      </div>

      <PBtn onClick={()=>setShowAdd(!showAdd)} style={{marginBottom:16,background:showAdd?'#6b7280':'#111'}}>
        {showAdd?'Cancel':'+ Add new staff account'}
      </PBtn>

      {showAdd&&(
        <Card style={{border:'1px solid #e5e7eb',marginBottom:16}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:14,color:'#111'}}>Create new account</div>
          <FInp label="Full name" type="text" placeholder="e.g. Manasa" value={nF.name} onChange={e=>setNF({...nF,name:e.target.value})}/>
          <FInp label="Username (for login)" type="text" placeholder="e.g. manasa" value={nF.username} onChange={e=>setNF({...nF,username:e.target.value.toLowerCase().replace(/\s+/g,'')})} autoCapitalize="none"/>
          <FInp label="Password" type="text" placeholder="Set a password (min 6 characters)" value={nF.pass} onChange={e=>setNF({...nF,pass:e.target.value})}/>
          <FSel label="Role" value={nF.role} onChange={e=>setNF({...nF,role:e.target.value})}>
            {ROLES.map(r=><option key={r} value={r}>{r[0].toUpperCase()+r.slice(1)}</option>)}
          </FSel>
          {msg&&<div style={{fontSize:13,color:msg.ok?'#16a34a':'#dc2626',marginBottom:10,padding:'8px 12px',borderRadius:8,background:msg.ok?'#f0fdf4':'#fef2f2'}}>{msg.t}</div>}
          <PBtn onClick={createUser} disabled={busy}>{busy?'Creating…':'Create account'}</PBtn>
          {msg?.ok&&(
            <div style={{marginTop:12,background:'#f0fdf4',border:'1px solid #bbf7d0',borderRadius:10,padding:'12px 14px'}}>
              <div style={{fontSize:12,fontWeight:700,color:'#15803d',marginBottom:6}}>Share these login details:</div>
              <div style={{fontSize:14,color:'#111'}}>🌐 App link: <strong>om-hospital-git-main-atulhpcapp-6198s-projects.vercel.app</strong></div>
              <div style={{fontSize:14,color:'#111',marginTop:4}}>👤 Username: <strong>{nF.username||msg.t.split('Username: ')[1]}</strong></div>
              <div style={{fontSize:14,color:'#111',marginTop:4}}>🔑 Password: <strong>(what you just set)</strong></div>
            </div>
          )}
        </Card>
      )}

      {msg&&!showAdd&&<div style={{fontSize:13,color:msg.ok?'#16a34a':'#dc2626',marginBottom:12,padding:'10px 14px',borderRadius:10,background:msg.ok?'#f0fdf4':'#fef2f2'}}>{msg.t}</div>}

      <SecL>All staff accounts ({users.length})</SecL>
      {loading?<div style={{textAlign:'center',padding:24,color:'#ccc'}}>Loading…</div>:(
        <Card>
          {users.map(u=>{
            const [bg,tx]=(ROLE_COLORS[u.role]||ROLE_COLORS.staff)
            return(
              <Row key={u.id}
                left={<span style={{fontSize:14,fontWeight:600}}>{u.name||'—'}</span>}
                sub={`@${u.username||'—'}`}
                right={<span style={{fontSize:11,padding:'3px 9px',borderRadius:20,background:bg,color:tx,fontWeight:700}}>{u.role||'staff'}</span>}
              />
            )
          })}
        </Card>
      )}

      <div style={{marginTop:24,padding:'14px 16px',background:'#f9f9f9',borderRadius:12,fontSize:13,color:'#888'}}>
        <strong style={{color:'#555'}}>How to share the app with staff:</strong>
        <div style={{marginTop:8,lineHeight:1.7}}>
          1. Send the app link on WhatsApp<br/>
          2. Share their username and password<br/>
          3. They open the link, enter username + password<br/>
          4. Done — they are logged in!
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════
   DAILY ENTRY TAB
══════════════════════════════════════════ */
const EntryTab = ({db,actions,eDate,setEDate,itype,setItype,iF,setIF}) => {
  const di   = db.income.filter(e=>e.date===eDate)
  const tots = {};ITYPES.forEach(t=>{tots[t.key]=di.filter(e=>e.type===t.key).reduce((a,e)=>a+e.amount,0)})
  const tot  = Object.values(tots).reduce((a,b)=>a+b,0)
  const isIP = ['ip','ip_r','ip_l'].includes(itype)
  const aps  = db.ip_patients.filter(p=>!p.discharge_date)
  const prev = iF.amount&&COMM[itype]?parseFloat(iF.amount)*COMM[itype]:0

  const go = async () => {
    const amt=parseFloat(iF.amount);if(!amt||amt<=0){alert('Enter a valid amount');return}
    let pid=null,pname=''
    if(isIP){pid=iF.pid||null;if(pid){pname=db.ip_patients.find(p=>p.id===pid)?.name||''}}
    else pname=iF.pname
    await actions.addIncome({id:uid(),date:eDate,type:itype,amount:amt,patient_id:pid,patient_name:pname,payment:iF.pay,ref_doctor:isIP?'':iF.ref,notes:iF.notes})
    setIF({amount:'',pid:'',pname:'',ref:'',pay:'cash',notes:''})
  }

  return (
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
        {isIP
          ?<FSel label="IP Patient" value={iF.pid} onChange={e=>setIF({...iF,pid:e.target.value})}>
            <option value="">— select admitted patient —</option>
            {aps.map(p=><option key={p.id} value={p.id}>{p.name}{p.ref_doctor?' (Ref: '+p.ref_doctor+')':''}</option>)}
          </FSel>
          :<>
            <FInp label="Patient name" type="text" placeholder="Optional" value={iF.pname} onChange={e=>setIF({...iF,pname:e.target.value})}/>
            {COMM[itype]>0&&<FInp label="Referring doctor" type="text" placeholder="Doctor name" value={iF.ref} onChange={e=>setIF({...iF,ref:e.target.value})}/>}
          </>
        }
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <FSel label="Payment" value={iF.pay} onChange={e=>setIF({...iF,pay:e.target.value})}>{PMODES.map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}</FSel>
          <FInp label="Notes" type="text" placeholder="Optional" value={iF.notes} onChange={e=>setIF({...iF,notes:e.target.value})}/>
        </div>
        <PBtn onClick={go}>Save income entry</PBtn>
      </Card>
      <SecL>Income for {fmtD(eDate)} — {fmt(tot)}</SecL>
      {di.length===0&&<div style={{textAlign:'center',padding:'24px 0',color:'#ccc',fontSize:13}}>No entries yet</div>}
      {ITYPES.map(t=>{
        const ents=di.filter(e=>e.type===t.key);if(!ents.length)return null
        return(<div key={t.key}>
          <SecL>{t.full} — {fmt(tots[t.key])}</SecL>
          <Card>{ents.map(e=>{const doc=getRefDoc(e,db.ip_patients);const comm=getComm(e);return(
            <Row key={e.id}
              left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={t.key}/>{e.patient_name||'—'}</span>}
              sub={`${e.payment}${doc?' · Ref: '+doc:''}${comm?' · Comm: '+fmt(comm):''}${e.notes?' · '+e.notes:''}`}
              right={<><span style={{color:'#16a34a',fontWeight:600,fontSize:13}}>{fmt(e.amount)}</span><DBtn onClick={()=>actions.delIncome(e.id)}>✕</DBtn></>}
            />
          )})}</Card>
        </div>)
      })}
    </div>
  )
}

/* ══════════════════════════════════════════
   IP PATIENTS TAB
══════════════════════════════════════════ */
const IPTab = ({db,actions,ipv,setIpv,ipid,setIpid,pF,setPF,cF,setCF,pyF,setPyF,gotoIP}) => {
  const getBill = pid => {
    const en=db.income.filter(e=>e.patient_id===pid)
    const total=en.reduce((a,e)=>a+e.amount,0)
    const comm=en.reduce((a,e)=>a+getComm(e),0)
    const paid=(db.ip_patients.find(p=>p.id===pid)?.payments||[]).reduce((a,e)=>a+e.amount,0)
    return{total,paid,balance:total-paid,commission:comm}
  }

  if(ipv==='detail'&&ipid){
    const p=db.ip_patients.find(p=>p.id===ipid)
    if(!p)return<button onClick={()=>setIpv('list')} style={{color:'#3b82f6',fontSize:14,background:'none',border:'none',cursor:'pointer'}}>← Back</button>
    const b=getBill(p.id)
    const ents=db.income.filter(e=>e.patient_id===p.id)
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
              {p.ref_doctor&&<div style={{fontSize:12,color:'#d97706',fontWeight:700,marginTop:6}}>Ref: Dr. {p.ref_doctor}</div>}
            </div>
            {!p.discharge_date&&<GBtn onClick={()=>actions.dischargePatient(p.id)}>Discharge</GBtn>}
          </div>
        </Card>
        <MetGrid items={[
          {label:'Total bill',value:fmt(b.total)},
          {label:'Paid',value:fmt(b.paid),color:'#16a34a'},
          {label:'Balance due',value:fmt(b.balance),color:b.balance>0?'#ef4444':'#111'},
          {label:'Commission due',value:fmt(b.commission),color:'#d97706',sub:p.ref_doctor?'to '+p.ref_doctor:''},
        ]}/>
        {p.ref_doctor&&ents.length>0&&(
          <><SecL>Commission breakdown</SecL>
          <Card style={{border:'1px solid #fed7aa',background:'#fffbf5'}}>
            {['ip','ip_r','ip_l'].map(tk=>{const te=ents.filter(e=>e.type===tk);if(!te.length)return null;const inc=te.reduce((a,e)=>a+e.amount,0);const cm=te.reduce((a,e)=>a+getComm(e),0);return(
              <Row key={tk} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={tk}/>{ITYPES.find(t=>t.key===tk)?.full}</span>} sub={`${fmt(inc)} × ${CLBL[tk]}`} right={<span style={{color:'#d97706',fontWeight:700}}>{fmt(cm)}</span>}/>
            )})}
            <div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #fed7aa',fontSize:14,fontWeight:700,color:'#c2410c'}}><span>Total to pay {p.ref_doctor}</span><span>{fmt(b.commission)}</span></div>
          </Card></>
        )}
        {!p.discharge_date&&(
          <><SecL>Add charge</SecL>
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
              <FSel label="Payment" value={cF.pay} onChange={e=>setCF({...cF,pay:e.target.value})}>{PMODES.map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}</FSel>
            </div>
            {cF.amt&&p.ref_doctor&&<div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:8,padding:'7px 10px',marginBottom:8,fontSize:13,color:'#92400e'}}>Commission to {p.ref_doctor}: <strong>{fmt(parseFloat(cF.amt)*(COMM[cF.type]||0))}</strong></div>}
            <FInp label="Notes" type="text" placeholder="e.g. Day 3 medicines" value={cF.notes} onChange={e=>setCF({...cF,notes:e.target.value})}/>
            <PBtn onClick={async()=>{const amt=parseFloat(cF.amt);if(!amt||amt<=0){alert('Enter amount');return}
              await actions.addIncome({id:uid(),date:cF.date,type:cF.type,amount:amt,patient_id:p.id,patient_name:p.name,payment:cF.pay,ref_doctor:'',notes:cF.notes})
              setCF({...cF,amt:'',notes:''})}}>Add charge</PBtn>
          </Card>
          <SecL>Record payment received</SecL>
          <Card>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              <FInp label="Date" type="date" value={pyF.date} onChange={e=>setPyF({...pyF,date:e.target.value})}/>
              <FInp label="Amount (₹)" type="number" inputMode="numeric" placeholder="0" value={pyF.amt} onChange={e=>setPyF({...pyF,amt:e.target.value})}/>
            </div>
            <FSel label="Payment mode" value={pyF.pay} onChange={e=>setPyF({...pyF,pay:e.target.value})}>{PMODES.map(m=><option key={m} value={m}>{m[0].toUpperCase()+m.slice(1)}</option>)}</FSel>
            <PBtn onClick={async()=>{const amt=parseFloat(pyF.amt);if(!amt||amt<=0){alert('Enter amount');return}
              await actions.addPayment(p.id,{id:uid(),date:pyF.date,amount:amt,payment:pyF.pay})
              setPyF({...pyF,amt:''})}}>Record payment</PBtn>
          </Card></>
        )}
        {['ip','ip_r','ip_l'].map(tk=>{const te=ents.filter(e=>e.type===tk);if(!te.length)return null;const it=ITYPES.find(t=>t.key===tk);return(
          <div key={tk}><SecL>{it.full} — {fmt(te.reduce((a,e)=>a+e.amount,0))}</SecL>
          <Card>{te.map(e=><Row key={e.id} left={fmtD(e.date)} sub={`${e.payment}${e.notes?' · '+e.notes:''} · Commission: ${fmt(getComm(e))}`} right={<><span style={{color:'#16a34a',fontWeight:600,fontSize:13}}>{fmt(e.amount)}</span><DBtn onClick={()=>actions.delIncome(e.id)}>✕</DBtn></>}/>)}</Card></div>
        )})}
        {p.payments?.length>0&&(<><SecL>Payments received</SecL><Card>{p.payments.map(py=><Row key={py.id} left={fmtD(py.date)} sub={py.payment} right={<span style={{color:'#16a34a',fontWeight:600,fontSize:13}}>{fmt(py.amount)}</span>}/>)}</Card></>)}
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
        <div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:12,padding:'12px 14px',marginBottom:8}}>
          <div style={{fontSize:11,fontWeight:700,color:'#92400e',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:8}}>Referral details</div>
          <FInp label="Referring doctor name" type="text" placeholder="Doctor name" value={pF.ref} onChange={e=>setPF({...pF,ref:e.target.value})}/>
          <div style={{fontSize:11,color:'#b45309'}}>Commission auto-calculated — IP 40% · Pharmacy 40% · Lab 50%</div>
        </div>
        <PBtn onClick={async()=>{
          if(!pF.name.trim()){alert('Name required');return}
          await actions.admitPatient({id:uid(),name:pF.name,admission_date:pF.adm,discharge_date:null,diagnosis:pF.dx,room:pF.room,ref_doctor:pF.ref,payments:[]})
          setIpv('list');setPF({name:'',adm:todayStr(),dx:'',room:'',ref:''})
        }}>Admit patient</PBtn>
      </Card>
    </div>
  )

  const active=db.ip_patients.filter(p=>!p.discharge_date)
  const disc=db.ip_patients.filter(p=>p.discharge_date)
  const qb=pid=>{const en=db.income.filter(e=>e.patient_id===pid);const t=en.reduce((a,e)=>a+e.amount,0);const pd=(db.ip_patients.find(p=>p.id===pid)?.payments||[]).reduce((a,e)=>a+e.amount,0);return{total:t,balance:t-pd}}
  return(
    <div>
      <PBtn onClick={()=>setIpv('add')} style={{marginBottom:16}}>+ Admit new patient</PBtn>
      {active.length>0&&(<><SecL>Active inpatients ({active.length})</SecL>
        <Card>{active.map(p=>{const b=qb(p.id);return<Row key={p.id} onClick={()=>{setIpid(p.id);setIpv('detail')}}
          left={<span style={{fontSize:14}}>{p.name}{p.ref_doctor&&<Pill label={'Ref: '+p.ref_doctor} bg="#fff7ed" tx="#b45309"/>}</span>}
          sub={`Since ${fmtD(p.admission_date)}`}
          right={<div style={{textAlign:'right'}}><div style={{fontWeight:600}}>{fmt(b.total)}</div>{b.balance>0&&<div style={{fontSize:11,color:'#ef4444'}}>due {fmt(b.balance)}</div>}</div>}
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

/* ══════════════════════════════════════════
   EXPENSES TAB
══════════════════════════════════════════ */
const ExpTab = ({db,actions,exD,setExD,exF,setExF}) => {
  const exp=db.expenses.filter(e=>e.date===exD)
  const etot=exp.reduce((a,e)=>a+e.amount,0)
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

/* ══════════════════════════════════════════
   REPORTS TAB
══════════════════════════════════════════ */
const RepTab = ({db,rv,setRv,rd,setRd,rm,setRm,ry,setRy,gotoIP}) => {
  const PLCards=({inc,exp,refComm})=>{const net=inc.total-exp.total-refComm;const mg=inc.total>0?((net/inc.total)*100).toFixed(1):'0.0';return<MetGrid items={[{label:'Gross revenue',value:fmt(inc.total)},{label:'Other expenses',value:fmt(exp.total),color:'#ef4444'},{label:'Ref commissions',value:fmt(refComm),color:'#d97706'},{label:net>=0?'Net profit':'Net loss',value:(net>=0?'+':'')+fmt(net),color:net>=0?'#16a34a':'#ef4444'}]}/>}
  const IncT=({inc})=>(<Card>{ITYPES.filter(t=>inc[t.key]>0).map(t=><Row key={t.key} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={t.key}/>{t.full}</span>} sub={COMM[t.key]>0?`Commission: ${CLBL[t.key]}`:'No commission'} right={<span style={{color:'#16a34a',fontWeight:600}}>{fmt(inc[t.key])}</span>}/>)}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total income</span><span>{fmt(inc.total)}</span></div></Card>)
  const ExpT=({exp})=>{if(exp.total===0)return<div style={{textAlign:'center',padding:'12px 0',color:'#ccc',fontSize:13}}>No expenses</div>;return<Card>{ECATS.filter(c=>exp[c.key]>0).map(c=><Row key={c.key} left={c.label} right={<span style={{color:'#ef4444',fontWeight:600}}>{fmt(exp[c.key])}</span>}/>)}<div style={{display:'flex',justifyContent:'space-between',paddingTop:8,marginTop:4,borderTop:'1px solid #f0f0f0',fontSize:14,fontWeight:700}}><span>Total expenses</span><span>{fmt(exp.total)}</span></div></Card>}
  const RefRep=({income})=>{
    const docs=buildRef(income,db.ip_patients);const tc=docs.reduce((a,r)=>a+r.total_commission,0)
    if(!docs.length)return<div style={{textAlign:'center',padding:'20px 0',color:'#ccc',fontSize:13}}>No referral data</div>
    return(<><div style={{background:'#fff7ed',border:'1px solid #fed7aa',borderRadius:12,padding:'14px 16px',marginBottom:12}}><div style={{fontSize:11,color:'#92400e',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>Total commission payable</div><div style={{fontSize:28,fontWeight:700,color:'#c2410c'}}>{fmt(tc)}</div><div style={{fontSize:11,color:'#b45309',marginTop:2}}>{docs.length} doctor{docs.length>1?'s':''}</div></div>
    {docs.map(doc=>(<Card key={doc.name}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:10}}><div><div style={{fontSize:15,fontWeight:700}}>Dr. {doc.name}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>Income generated: {fmt(doc.total_income)}</div></div><div style={{textAlign:'right'}}><div style={{fontSize:11,color:'#d97706',fontWeight:600}}>Commission due</div><div style={{fontSize:22,fontWeight:700,color:'#c2410c'}}>{fmt(doc.total_commission)}</div></div></div><div style={{borderTop:'1px solid #f5f5f5',paddingTop:8}}>{Object.entries(doc.by_type).map(([tk,v])=>(<Row key={tk} left={<span style={{display:'flex',alignItems:'center',gap:6}}><TypeTag t={tk}/>{ITYPES.find(t=>t.key===tk)?.full}</span>} sub={`${fmt(v.income)} × ${CLBL[tk]}`} right={<span style={{color:'#d97706',fontWeight:700}}>{fmt(v.commission)}</span>}/>))}</div></Card>))}</>)
  }
  const yrs=[...new Set([...db.income,...db.expenses].map(e=>e.date?.slice(0,4)))].filter(Boolean).sort().reverse()
  if(!yrs.includes(ry))yrs.unshift(ry)
  return(
    <div>
      <div style={{display:'flex',gap:6,marginBottom:16,flexWrap:'wrap'}}>
        {[{k:'daily',l:'Daily'},{k:'monthly',l:'Monthly'},{k:'yearly',l:'Yearly'},{k:'referrals',l:'Referrals 🏥'}].map(v=>(
          <button key={v.k} onClick={()=>setRv(v.k)} style={{padding:'7px 14px',borderRadius:20,border:rv===v.k?'none':'1px solid #e5e7eb',background:rv===v.k?'#111':'none',color:rv===v.k?'#fff':'#888',fontSize:12,fontWeight:600,cursor:'pointer'}}>{v.l}</button>
        ))}
      </div>
      {rv==='daily'&&(()=>{const inc=sumInc(db.income.filter(e=>e.date===rd));const exp=sumExp(db.expenses.filter(e=>e.date===rd));const rc=totalRef(db.income.filter(e=>e.date===rd),db.ip_patients);const ipd=db.ip_patients.filter(p=>db.income.some(e=>e.patient_id===p.id&&e.date===rd));return(<><div style={{display:'flex',gap:8,marginBottom:14}}><input style={{...S.inp,flex:1}} type="date" value={rd} onChange={e=>setRd(e.target.value)}/><GBtn onClick={()=>setRd(todayStr())}>Today</GBtn></div><PLCards inc={inc} exp={exp} refComm={rc}/>{ipd.length>0&&(<><SecL>IP activity</SecL><Card>{ipd.map(p=>{const t=db.income.filter(e=>e.patient_id===p.id&&e.date===rd).reduce((a,e)=>a+e.amount,0);const tot=db.income.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+e.amount,0);const pd=(p.payments||[]).reduce((a,e)=>a+e.amount,0);return<Row key={p.id} left={p.name} sub={`Today: ${fmt(t)} · Total: ${fmt(tot)}`} right={tot-pd>0?<span style={{color:'#ef4444',fontSize:11,fontWeight:600}}>due {fmt(tot-pd)}</span>:<span style={{color:'#16a34a',fontSize:11}}>settled</span>} onClick={()=>gotoIP(p.id)}/>})}</Card></>)}<SecL>Income by source</SecL><IncT inc={inc}/><SecL>Expenses</SecL><ExpT exp={exp}/></>)})()}
      {rv==='monthly'&&(()=>{const mI=db.income.filter(e=>e.date?.startsWith(rm));const mE=db.expenses.filter(e=>e.date?.startsWith(rm));const inc=sumInc(mI);const exp=sumExp(mE);const rc=totalRef(mI,db.ip_patients);const days=[...new Set(mI.map(e=>e.date))].sort();const [yr,mo]=rm.split('-');const mps=db.ip_patients.filter(p=>(p.admission_date||'')<=rm+'-31'&&(p.discharge_date||'9999-12-31')>=rm+'-01');return(<><input style={S.inp} type="month" value={rm} onChange={e=>setRm(e.target.value)}/><div style={{fontSize:14,fontWeight:600,color:'#555',margin:'8px 0 14px'}}>{MOFULL[parseInt(mo)-1]} {yr}</div><PLCards inc={inc} exp={exp} refComm={rc}/>{days.length>0&&(<><SecL>Day-wise</SecL><Card>{days.map(d=>{const di=db.income.filter(e=>e.date===d).reduce((a,e)=>a+e.amount,0);const de=db.expenses.filter(e=>e.date===d).reduce((a,e)=>a+e.amount,0);const dc=totalRef(db.income.filter(e=>e.date===d),db.ip_patients);return<Row key={d} left={fmtD(d)} right={<div style={{textAlign:'right'}}><span style={{color:'#16a34a',fontWeight:600}}>{fmt(di)}</span><span style={{fontSize:11,color:di-de-dc>=0?'#16a34a':'#ef4444',marginLeft:8}}>net {fmt(di-de-dc)}</span></div>} onClick={()=>{setRv('daily');setRd(d)}}/>})}</Card></>)}{mps.length>0&&(<><SecL>IP patients this month</SecL><Card>{mps.map(p=>{const t=db.income.filter(e=>e.patient_id===p.id).reduce((a,e)=>a+e.amount,0);const pd=(p.payments||[]).reduce((a,e)=>a+e.amount,0);return<Row key={p.id} left={<span>{p.name}{p.ref_doctor&&<Pill label={'Ref: '+p.ref_doctor} bg="#fff7ed" tx="#b45309"/>}</span>} sub={`${fmtD(p.admission_date)}${p.discharge_date?' → '+fmtD(p.discharge_date):' (active)'}`} right={<div style={{textAlign:'right'}}><div style={{fontWeight:600}}>{fmt(t)}</div>{t-pd>0&&<div style={{fontSize:11,color:'#ef4444'}}>due {fmt(t-pd)}</div>}</div>} onClick={()=>gotoIP(p.id)}/>})}</Card></>)}<SecL>Income by source</SecL><IncT inc={inc}/><SecL>Expenses</SecL><ExpT exp={exp}/><SecL>Doctor referral report — {MOFULL[parseInt(mo)-1]}</SecL><RefRep income={mI}/></>)})()}
      {rv==='yearly'&&(()=>{const yI=db.income.filter(e=>e.date?.startsWith(ry));const yE=db.expenses.filter(e=>e.date?.startsWith(ry));const inc=sumInc(yI);const exp=sumExp(yE);const rc=totalRef(yI,db.ip_patients);const mons=[...new Set(yI.map(e=>e.date?.slice(0,7)))].sort();return(<><select style={S.sel} value={ry} onChange={e=>setRy(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select><PLCards inc={inc} exp={exp} refComm={rc}/>{mons.length>0&&(<><SecL>Month-wise</SecL><Card><div style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr 1fr',marginBottom:4}}>{['Month','Revenue','Exp','Net'].map(h=><div key={h} style={{fontSize:10,color:'#aaa',fontWeight:700,textTransform:'uppercase',padding:'4px 4px 8px 0',borderBottom:'1px solid #f0f0f0'}}>{h}</div>)}</div>{mons.map(ym=>{const mi=db.income.filter(e=>e.date?.startsWith(ym)).reduce((a,e)=>a+e.amount,0);const me=db.expenses.filter(e=>e.date?.startsWith(ym)).reduce((a,e)=>a+e.amount,0);const mc=totalRef(db.income.filter(e=>e.date?.startsWith(ym)),db.ip_patients);const mn=mi-me-mc;const[,m]=ym.split('-');return(<div key={ym} onClick={()=>{setRv('monthly');setRm(ym)}} style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr 1fr',padding:'8px 0',borderBottom:'1px solid #f5f5f5',cursor:'pointer'}}><span style={{fontSize:13,paddingRight:8}}>{MOS[parseInt(m)-1]}</span><span style={{fontSize:13,color:'#16a34a',fontWeight:600}}>{fmt(mi)}</span><span style={{fontSize:13,color:'#ef4444'}}>{fmt(me)}</span><span style={{fontSize:13,color:mn>=0?'#16a34a':'#ef4444',fontWeight:600}}>{mn>=0?'+':''}{fmt(mn)}</span></div>)})}</Card></>)}<SecL>Income by source</SecL><IncT inc={inc}/><SecL>Doctor referral report — {ry}</SecL><RefRep income={yI}/></>)})()}
      {rv==='referrals'&&(()=>{const [rp,setRp]=useState('month');const fi=rp==='month'?db.income.filter(e=>e.date?.startsWith(rm)):db.income.filter(e=>e.date?.startsWith(ry));return(<><div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center'}}><span style={{fontSize:13,color:'#888',fontWeight:600}}>Show:</span>{[{k:'month',l:'This month'},{k:'year',l:'This year'}].map(v=>(<button key={v.k} onClick={()=>setRp(v.k)} style={{padding:'7px 14px',borderRadius:20,border:rp===v.k?'none':'1px solid #e5e7eb',background:rp===v.k?'#111':'none',color:rp===v.k?'#fff':'#888',fontSize:13,fontWeight:600,cursor:'pointer'}}>{v.l}</button>))}</div>{rp==='month'&&<input style={S.inp} type="month" value={rm} onChange={e=>setRm(e.target.value)}/>}{rp==='year'&&<select style={S.sel} value={ry} onChange={e=>setRy(e.target.value)}>{yrs.map(y=><option key={y} value={y}>{y}</option>)}</select>}<RefRep income={fi}/></>)})()}
    </div>
  )
}

/* ══════════════════════════════════════════
   MAIN APP
══════════════════════════════════════════ */
export default function App() {
  const [session,  setSession]   = useState(null)
  const [profile,  setProfile]   = useState(null)
  const [loading,  setLoading]   = useState(true)
  const [db,       setDb]        = useState({income:[],expenses:[],ip_patients:[]})
  const [dbLoading,setDbLoading] = useState(false)

  const [tab,  setTab]  = useState('entry')
  const [eDate,setEDate]= useState(todayStr())
  const [itype,setItype]= useState('op')
  const [iF,   setIF]   = useState({amount:'',pid:'',pname:'',ref:'',pay:'cash',notes:''})
  const [ipv,  setIpv]  = useState('list')
  const [ipid, setIpid] = useState(null)
  const [pF,   setPF]   = useState({name:'',adm:todayStr(),dx:'',room:'',ref:''})
  const [cF,   setCF]   = useState({date:todayStr(),type:'ip',amt:'',pay:'cash',notes:''})
  const [pyF,  setPyF]  = useState({date:todayStr(),amt:'',pay:'cash'})
  const [exD,  setExD]  = useState(todayStr())
  const [exF,  setExF]  = useState({cat:'water',amt:'',desc:'',pay:'cash',mon:false})
  const [rv,setRv]=useState('daily')
  const [rd,setRd]=useState(todayStr())
  const [rm,setRm]=useState(todayStr().slice(0,7))
  const [ry,setRy]=useState(todayStr().slice(0,4))

  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{setSession(session);setLoading(false)})
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_,session)=>{setSession(session);if(!session)setProfile(null);setLoading(false)})
    return()=>subscription.unsubscribe()
  },[])

  useEffect(()=>{
    if(!session)return
    // load profile
    supabase.from('profiles').select('*').eq('id',session.user.id).single().then(({data})=>setProfile(data))
    // load all data
    const loadAll=async()=>{
      setDbLoading(true)
      const [inc,exp,pts]=await Promise.all([
        supabase.from('income').select('*').order('date',{ascending:false}),
        supabase.from('expenses').select('*').order('date',{ascending:false}),
        supabase.from('ip_patients').select('*').order('admission_date',{ascending:false}),
      ])
      setDb({income:inc.data||[],expenses:exp.data||[],ip_patients:pts.data||[]})
      setDbLoading(false)
    }
    loadAll()
  },[session])

  const actions = {
    addIncome: async row=>{const {data}=await supabase.from('income').insert([row]).select();if(data)setDb(d=>({...d,income:[data[0],...d.income]}))},
    delIncome: async id=>{await supabase.from('income').delete().eq('id',id);setDb(d=>({...d,income:d.income.filter(e=>e.id!==id)}))},
    addExpense: async row=>{const {data}=await supabase.from('expenses').insert([row]).select();if(data)setDb(d=>({...d,expenses:[data[0],...d.expenses]}))},
    delExpense: async id=>{await supabase.from('expenses').delete().eq('id',id);setDb(d=>({...d,expenses:d.expenses.filter(e=>e.id!==id)}))},
    admitPatient: async row=>{const {data}=await supabase.from('ip_patients').insert([row]).select();if(data)setDb(d=>({...d,ip_patients:[data[0],...d.ip_patients]}))},
    dischargePatient: async id=>{const {data}=await supabase.from('ip_patients').update({discharge_date:todayStr()}).eq('id',id).select();if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(p=>p.id===id?data[0]:p)}))},
    addPayment: async(pid,payment)=>{const p=db.ip_patients.find(x=>x.id===pid);const np=[...(p.payments||[]),payment];const {data}=await supabase.from('ip_patients').update({payments:np}).eq('id',pid).select();if(data)setDb(d=>({...d,ip_patients:d.ip_patients.map(x=>x.id===pid?data[0]:x)}))},
  }

  const gotoIP=useCallback((pid)=>{setIpid(pid);setIpv('detail');setTab('ip')},[])

  const isAdmin = profile?.role==='admin'

  const TABS=[
    {k:'entry',l:'Daily Entry'},
    {k:'ip',   l:'IP Patients'},
    {k:'exp',  l:'Expenses'},
    {k:'rep',  l:'Reports'},
    ...(isAdmin?[{k:'admin',l:'👥 Users'}]:[]),
  ]

  if(loading)return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,color:'#aaa'}}>Loading…</div>
  if(!session)return<LoginPage/>

  return(
    <div style={{maxWidth:520,margin:'0 auto',background:'#f7f7f7',minHeight:'100vh'}}>
      <div style={{background:'#fff',borderBottom:'1px solid #f0f0f0',padding:'12px 16px 0',position:'sticky',top:0,zIndex:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:10}}>
          <div>
            <div style={{fontWeight:700,fontSize:15,color:'#111'}}>🏥 Om Hospital</div>
            {profile&&<div style={{fontSize:11,color:'#aaa',marginTop:1}}>{profile.name||'Staff'} · {profile.role||'staff'}</div>}
          </div>
          <button onClick={()=>supabase.auth.signOut()} style={{fontSize:12,color:'#aaa',background:'none',border:'1px solid #e5e7eb',borderRadius:8,padding:'5px 10px',cursor:'pointer'}}>Logout</button>
        </div>
        {dbLoading&&<div style={{fontSize:11,color:'#3b82f6',marginBottom:6,textAlign:'center'}}>Syncing data…</div>}
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
        {isAdmin&&<div style={{display:tab==='admin'?'block':'none'}}><AdminTab currentUser={profile}/></div>}
      </div>
    </div>
  )
}
