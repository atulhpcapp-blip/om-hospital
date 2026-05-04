import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
const supabase = createClient('https://wlgbhrmycequuiabpwqf.supabase.co','eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndsZ2Jocm15Y2VxdXVpYWJwd3FmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcxODIwMjAsImV4cCI6MjA5Mjc1ODAyMH0.9cDZdZufK0EcWWjIpqp3gLPlwfKVvs5LEOLnw8wM4dw')

export default function App(){
  const [msg,setMsg]=useState('Loading...')
  useEffect(()=>{
    supabase.auth.getSession().then(({data:{session}})=>{
      if(!session){setMsg('No session - please login');return}
      supabase.from('profiles').select('*').eq('id',session.user.id).single().then(({data,error})=>{
        if(error)setMsg('Profile error: '+error.message+' | User: '+session.user.id)
        else if(data)setMsg('Profile loaded! Name: '+data.name+' | Role: '+data.role)
        else setMsg('Profile is null | User: '+session.user.id)
      })
    })
  },[])
  return(<div style={{padding:40,fontFamily:'Arial',fontSize:16}}>
    <h2>EasyMedical Diagnostic</h2>
    <p>{msg}</p>
    <button onClick={()=>supabase.auth.signOut().then(()=>setMsg('Signed out'))}>Sign Out</button>
  </div>)
}
