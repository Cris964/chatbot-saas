import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../lib/supabase'
import { useAuth } from './_app'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, CartesianGrid, PieChart, Pie, Cell
} from 'recharts'

/* ──────────────────────────────────────────────
   ICONS
────────────────────────────────────────────── */
const I = {
  grid: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>,
  msg:  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  box:  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>,
  users:<svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  cog:  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  out:  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  sun:  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>,
  moon: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  send: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  refresh:<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>,
  plus: <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  search:<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
  edit: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  save: <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>,
  close:<svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  trend:<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg>,
  arrow:<svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
}

/* ──────────────────────────────────────────────
   HELPERS
────────────────────────────────────────────── */
const timeAgo = d => {
  const s = (Date.now() - new Date(d)) / 1000
  if (s < 60) return 'ahora'
  if (s < 3600) return `${Math.floor(s/60)}m`
  if (s < 86400) return `${Math.floor(s/3600)}h`
  return `${Math.floor(s/86400)}d`
}

const avatarColor = name => {
  const colors = ['#7c3aed','#0ea5e9','#10b981','#f59e0b','#ef4444','#ec4899','#8b5cf6','#06b6d4']
  let h = 0; for (let c of (name||'?')) h = c.charCodeAt(0) + ((h<<5)-h)
  return colors[Math.abs(h) % colors.length]
}

const Avatar = ({ name, size = 36 }) => {
  const bg = avatarColor(name)
  return (
    <div style={{width:size, height:size, minWidth:size, background:`${bg}22`, color:bg, border:`1.5px solid ${bg}44`, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:size*0.38}}>
      {(name||'?').charAt(0).toUpperCase()}
    </div>
  )
}

/* ──────────────────────────────────────────────
   CUSTOM TOOLTIP FOR CHARTS
────────────────────────────────────────────── */
const ChartTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{background:'rgba(22,22,42,0.98)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:12, padding:'10px 14px', fontSize:12, color:'#d0d0e8', boxShadow:'0 8px 32px rgba(0,0,0,0.5)'}}>
      <p style={{color:'#8888b0', marginBottom:4, fontWeight:700}}>{label}</p>
      {payload.map((p,i) => <p key={i} style={{color:p.color}}>{p.name}: <b>{p.value}</b></p>)}
    </div>
  )
}

/* ──────────────────────────────────────────────
   STAT CARD
────────────────────────────────────────────── */
const StatCard = ({ label, value, icon, color, trend, sub }) => (
  <div className="card relative rounded-2xl p-5 overflow-hidden noise-overlay"
    style={{background:'linear-gradient(145deg, rgba(22,22,42,0.9), rgba(17,17,32,0.95))', border:'1px solid rgba(255,255,255,0.06)', boxShadow:'0 4px 24px rgba(0,0,0,0.4)'}}>
    {/* Glow blob */}
    <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none" style={{background:`radial-gradient(circle, ${color}30 0%, transparent 70%)`}} />
    {/* Top border accent */}
    <div className="absolute top-0 left-4 right-4 h-[1.5px] rounded-full" style={{background:`linear-gradient(90deg, transparent, ${color}80, transparent)`}} />

    <div className="relative">
      <div className="flex items-start justify-between mb-4">
        <div className="p-2.5 rounded-xl" style={{background:`${color}15`, border:`1px solid ${color}25`}}>
          <span style={{color}}>{icon}</span>
        </div>
        {trend !== undefined && (
          <div className="flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg" style={{background:'rgba(16,185,129,0.1)', color:'#34d399'}}>
            {I.trend} +{trend}%
          </div>
        )}
      </div>
      <div className="text-3xl font-black text-white tracking-tight mb-1" style={{fontFamily:'Lato'}}>
        {value ?? <div className="skeleton w-16 h-8" />}
      </div>
      <div className="text-xs text-ink-400 font-light">{label}</div>
      {sub && <div className="text-[11px] text-ink-600 mt-0.5">{sub}</div>}
    </div>
  </div>
)

/* ──────────────────────────────────────────────
   SIDEBAR
────────────────────────────────────────────── */
function Sidebar({ active, setActive, user, clients, selectedClient, setSelectedClient, toggleTheme, dark, onLogout }) {
  const isAdmin = user?.role === 'admin'
  const nav = [
    { id:'dashboard',      label:'Dashboard',       icon:I.grid  },
    { id:'conversations',  label:'Conversaciones',  icon:I.msg   },
    { id:'orders',         label:'Pedidos',          icon:I.box   },
    ...(isAdmin ? [{ id:'clients', label:'Clientes Bot', icon:I.users }] : []),
    { id:'settings',       label:'Configuración',   icon:I.cog   },
  ]

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 flex flex-col z-50 dark-sidebar"
      style={{background:'var(--sidebar-bg, rgba(13,13,24,0.97))', borderRight:'1px solid var(--border)', backdropFilter:'blur(20px)'}}>

      {/* Logo */}
      <div className="p-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-lg relative"
            style={{background:'linear-gradient(135deg,#7c3aed,#4c1d95)', boxShadow:'0 4px 16px rgba(124,58,237,0.4)'}}>
            B
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border border-ink-950" />
          </div>
          <div>
            <div className="font-black text-white text-sm tracking-tight">Bot<span className="grad-text">CRM</span></div>
            <div className="text-[10px] text-ink-600 font-light uppercase tracking-widest">v2.0</div>
          </div>
        </div>
      </div>

      {/* User pill */}
      <div className="mx-3 mb-3 px-3 py-2.5 rounded-xl flex items-center gap-2.5"
        style={{background:'rgba(28,28,52,0.8)', border:'1px solid rgba(255,255,255,0.05)'}}>
        <Avatar name={user?.name} size={30} />
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-white truncate">{user?.name}</div>
          <div className="text-[10px] text-ink-500 truncate">{user?.role === 'admin' ? '🛡 Admin' : '🏢 Cliente'}</div>
        </div>
      </div>

      {/* Client filter (admin only) */}
      {isAdmin && (
        <div className="mx-3 mb-3">
          <div className="text-[9px] text-ink-600 uppercase tracking-widest mb-1.5 px-1">Vista del cliente</div>
          <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)}
            className="inp w-full px-3 py-2 rounded-lg text-xs cursor-pointer">
            <option value="">Todos los clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}

      {/* Divider */}
      <div className="mx-3 mb-3 h-px" style={{background:'rgba(255,255,255,0.04)'}} />

      {/* Nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        {nav.map(item => (
          <button key={item.id} onClick={() => setActive(item.id)}
            className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm transition-all duration-150 text-left ${
              active === item.id
                ? 'text-white font-bold'
                : 'text-ink-400 hover:text-ink-100 hover:bg-white/4'
            }`}
            style={active === item.id ? {background:'rgba(139,92,246,0.15)', border:'1px solid rgba(139,92,246,0.2)', color:'#a78bfa'} : {border:'1px solid transparent'}}>
            <span style={active === item.id ? {color:'#a78bfa'} : {}}>{item.icon}</span>
            {item.label}
            {active === item.id && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400" />}
          </button>
        ))}
      </nav>

      {/* Bottom */}
      <div className="p-3 space-y-1" style={{borderTop:'1px solid rgba(255,255,255,0.04)'}}>
        <button onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs text-ink-500 hover:text-ink-200 hover:bg-white/4 transition">
          {dark ? I.sun : I.moon}
          {dark ? 'Modo claro' : 'Modo oscuro'}
        </button>
        <button onClick={onLogout}
          className="w-full flex items-center gap-3 px-3.5 py-2 rounded-xl text-xs text-rose-500/70 hover:text-rose-400 hover:bg-rose-500/8 transition">
          {I.out} Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

/* ──────────────────────────────────────────────
   DASHBOARD PAGE
────────────────────────────────────────────── */
function DashboardPage({ clientId }) {
  const [data, setData] = useState({ convs:null, orders:null, msgs:null, users:null })
  const [chart, setChart] = useState([])
  const [pie, setPie] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    let cq = supabase.from('conversations').select('id,messages,updated_at,client_id')
    let oq = supabase.from('orders').select('id,status,created_at,client_id,payment_method')
    if (clientId) { cq=cq.eq('client_id',clientId); oq=oq.eq('client_id',clientId) }
    const [{ data:convs }, { data:orders }] = await Promise.all([cq, oq])

    const today = new Date().toDateString()
    const todayConvs = (convs||[]).filter(c => new Date(c.updated_at).toDateString()===today)
    const totalMsgs = (convs||[]).reduce((a,c) => a+(c.messages?.length||0), 0)

    setData({ convs:todayConvs.length, orders:(orders||[]).length, msgs:totalMsgs, users:(convs||[]).length })

    // 7-day chart
    const days = []
    for (let i=6; i>=0; i--) {
      const d = new Date(); d.setDate(d.getDate()-i)
      const ds = d.toDateString()
      const dc = (convs||[]).filter(c => new Date(c.updated_at).toDateString()===ds).length
      const dm = (convs||[]).filter(c => new Date(c.updated_at).toDateString()===ds).reduce((a,c)=>a+(c.messages?.length||0),0)
      days.push({ day:['Do','Lu','Ma','Mi','Ju','Vi','Sa'][d.getDay()], convs:dc, msgs:dm })
    }
    setChart(days)

    // Pie: payment methods
    const pm = {}
    ;(orders||[]).forEach(o => { if (o.payment_method) pm[o.payment_method]=(pm[o.payment_method]||0)+1 })
    setPie(Object.entries(pm).map(([name,val])=>({name,value:val})))

    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])
  useEffect(() => { const t=setInterval(load,30000); return ()=>clearInterval(t) }, [load])

  const PIE_COLORS = ['#8b5cf6','#10b981','#f59e0b','#ef4444']

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between fade-up">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Dashboard</h1>
          <p className="text-ink-400 text-sm mt-0.5">Resumen en tiempo real de tu operación</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold text-emerald-400" style={{background:'rgba(16,185,129,0.1)', border:'1px solid rgba(16,185,129,0.2)'}}>
            <div className="w-2 h-2 rounded-full bg-emerald-400 relative live-ring" />
            En vivo · Auto-refresh 30s
          </div>
          <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-ink-400 hover:text-white transition" style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)'}}>
            {I.refresh} Actualizar
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 stagger fade-up">
        <div className="fade-up stagger-1"><StatCard label="Conversaciones hoy" value={data.convs} icon={I.msg} color="#8b5cf6" trend={12} sub="vs ayer" /></div>
        <div className="fade-up stagger-2"><StatCard label="Pedidos registrados" value={data.orders} icon={I.box} color="#10b981" trend={8} sub="este mes" /></div>
        <div className="fade-up stagger-3"><StatCard label="Total conversaciones" value={data.users} icon={I.users} color="#0ea5e9" sub="historial completo" /></div>
        <div className="fade-up stagger-4"><StatCard label="Mensajes procesados" value={data.msgs} icon={I.trend} color="#f59e0b" sub="por la IA" /></div>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-3 gap-4 fade-up stagger-2">
        {/* Area chart */}
        <div className="col-span-2 rounded-2xl p-5" style={{background:'linear-gradient(145deg,rgba(22,22,42,0.9),rgba(17,17,32,0.95))', border:'1px solid rgba(255,255,255,0.06)', boxShadow:'0 4px 24px rgba(0,0,0,0.4)'}}>
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="font-bold text-white text-sm">Actividad semanal</div>
              <div className="text-xs text-ink-500">Conversaciones y mensajes · últimos 7 días</div>
            </div>
            <div className="flex items-center gap-3 text-xs text-ink-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{background:'#8b5cf6'}}/>Conversaciones</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{background:'#10b981'}}/>Mensajes</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chart} margin={{top:0,right:0,left:-20,bottom:0}}>
              <defs>
                <linearGradient id="gv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="ge" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="day" tick={{fontSize:11,fill:'#5c5c8a'}} axisLine={false} tickLine={false} />
              <YAxis tick={{fontSize:11,fill:'#5c5c8a'}} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="convs" name="Conversaciones" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#gv)" dot={{r:3,fill:'#8b5cf6',strokeWidth:0}} activeDot={{r:5,fill:'#a78bfa'}} />
              <Area type="monotone" dataKey="msgs" name="Mensajes" stroke="#10b981" strokeWidth={2} fill="url(#ge)" dot={{r:3,fill:'#10b981',strokeWidth:0}} activeDot={{r:5,fill:'#34d399'}} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Pie chart */}
        <div className="rounded-2xl p-5" style={{background:'linear-gradient(145deg,rgba(22,22,42,0.9),rgba(17,17,32,0.95))', border:'1px solid rgba(255,255,255,0.06)', boxShadow:'0 4px 24px rgba(0,0,0,0.4)'}}>
          <div className="font-bold text-white text-sm mb-1">Métodos de pago</div>
          <div className="text-xs text-ink-500 mb-4">Distribución de pedidos</div>
          {pie.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-ink-600 text-xs">
              <div className="text-3xl mb-2">🥧</div>Sin datos aún
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={pie} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {pie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip content={<ChartTip />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {pie.map((p,i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{background:PIE_COLORS[i%PIE_COLORS.length]}} />
                      <span className="text-ink-400">{p.name}</span>
                    </div>
                    <span className="font-bold text-white">{p.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bar chart */}
      <div className="rounded-2xl p-5 fade-up stagger-3" style={{background:'linear-gradient(145deg,rgba(22,22,42,0.9),rgba(17,17,32,0.95))', border:'1px solid rgba(255,255,255,0.06)', boxShadow:'0 4px 24px rgba(0,0,0,0.4)'}}>
        <div className="font-bold text-white text-sm mb-1">Volumen de mensajes</div>
        <div className="text-xs text-ink-500 mb-4">Distribución diaria de mensajes procesados</div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={chart} margin={{top:0,right:0,left:-20,bottom:0}}>
            <defs>
              <linearGradient id="gb" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.9}/>
                <stop offset="100%" stopColor="#5b21b6" stopOpacity={0.4}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
            <XAxis dataKey="day" tick={{fontSize:11,fill:'#5c5c8a'}} axisLine={false} tickLine={false} />
            <YAxis tick={{fontSize:11,fill:'#5c5c8a'}} axisLine={false} tickLine={false} />
            <Tooltip content={<ChartTip />} />
            <Bar dataKey="msgs" name="Mensajes" fill="url(#gb)" radius={[6,6,0,0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   CONVERSATIONS PAGE
────────────────────────────────────────────── */
// Keywords that trigger human agent alert
const HUMAN_TRIGGERS = ['asesor','humano','persona real','hablar con alguien','no entiendo','no me ayuda','quiero hablar','agente','representante','ayuda real','no funciona','me puedes comunicar']

function needsHuman(messages) {
  if (!messages?.length) return false
  const last3 = messages.slice(-3).map(m => m.content?.toLowerCase()||'')
  return last3.some(txt => HUMAN_TRIGGERS.some(t => txt.includes(t)))
}

function ConversationsPage({ clientId }) {
  const [convs, setConvs] = useState([])
  const [selected, setSelected] = useState(null)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [readIds, setReadIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem('crm_read')||'[]') } catch { return [] }
  })
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [alerts, setAlerts] = useState([])
  const bottomRef = useRef(null)

  const markRead = (id) => {
    setReadIds(prev => {
      const next = [...new Set([...prev, id])]
      localStorage.setItem('crm_read', JSON.stringify(next))
      return next
    })
  }

  const load = useCallback(async () => {
    let q = supabase.from('conversations').select('*').order('updated_at',{ascending:false}).limit(60)
    if (clientId) q = q.eq('client_id', clientId)
    const { data } = await q
    const list = data||[]
    setConvs(list)
    setLoading(false)
    // Detect human agent alerts
    const newAlerts = list.filter(c => needsHuman(c.messages) && !readIds.includes('alert_'+c.id))
    setAlerts(newAlerts)
    // Update selected if open
    if (selected) {
      const updated = list.find(c => c.id===selected.id)
      if (updated) setSelected(updated)
    }
  }, [clientId, readIds, selected?.id])

  useEffect(() => { load() }, [clientId])
  useEffect(() => { const t=setInterval(load,12000); return ()=>clearInterval(t) }, [clientId])
  useEffect(() => { bottomRef.current?.scrollIntoView({behavior:'smooth'}) }, [selected?.messages?.length])

  const openConv = (c) => {
    setSelected(c)
    markRead(c.id)
    // dismiss alert for this conv
    setAlerts(prev => prev.filter(a => a.id !== c.id))
  }

  const dismissAlert = (id) => {
    setAlerts(prev => prev.filter(a => a.id !== id))
    setReadIds(prev => {
      const next = [...new Set([...prev, 'alert_'+id])]
      localStorage.setItem('crm_read', JSON.stringify(next))
      return next
    })
  }

  const sendReply = async () => {
    if (!reply.trim() || !selected) return
    setSending(true)
    const text = reply.trim()
    const newMsg = { role: 'assistant', content: `[Asesor]: ${text}` }
    const updated = [...(selected.messages||[]), newMsg]

    // 1. Guardar en Supabase
    await supabase.from('conversations')
      .update({ messages: updated, updated_at: new Date().toISOString() })
      .eq('id', selected.id)

    // 2. Enviar a WhatsApp via Railway
    try {
      const res = await fetch('https://chatbot-saas-production-d1b7.up.railway.app/send-advisor-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: selected.client_id,
          userPhone: selected.user_phone,
          message: text,
          advisorName: 'Asesor'
        })
      })
      if (!res.ok) console.error('Error enviando a WhatsApp:', await res.text())
      else console.log('✅ Mensaje enviado a WhatsApp')
    } catch (err) {
      console.error('Error conectando con Railway:', err.message)
      alert('⚠️ Mensaje guardado pero no se pudo enviar a WhatsApp. Verifica la conexión.')
    }

    setSelected({...selected, messages: updated})
    setReply('')
    setSending(false)
    load()
  }

  const isUnread = (c) => !readIds.includes(c.id)

  const filtered = convs.filter(c =>
    (c.user_name||c.user_phone||'').toLowerCase().includes(search.toLowerCase())
  )

  const cardBg = 'linear-gradient(145deg,rgba(22,22,42,0.9),rgba(17,17,32,0.95))'
  const cardBorder = '1px solid rgba(255,255,255,0.06)'

  return (
    <div style={{height:'calc(100vh - 80px)'}} className="flex flex-col gap-3 fade-up">

      {/* 🚨 Human Agent Alerts */}
      {alerts.length > 0 && (
        <div className="space-y-2 scale-in">
          {alerts.map(a => (
            <div key={a.id} className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
              style={{background:'rgba(251,113,133,0.08)', border:'1px solid rgba(251,113,133,0.25)', boxShadow:'0 0 20px rgba(251,113,133,0.08)'}}>
              <div className="text-xl flex-shrink-0 floating">🚨</div>
              <div className="flex-1">
                <div className="text-sm font-bold text-rose-300">Intervención humana solicitada</div>
                <div className="text-xs text-rose-400/70">
                  <span className="font-bold">{a.user_name||a.user_phone}</span> necesita hablar con un asesor real
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={() => openConv(a)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold text-white transition"
                  style={{background:'linear-gradient(135deg,#f43f5e,#e11d48)'}}>
                  Ver chat
                </button>
                <button onClick={() => dismissAlert(a.id)}
                  className="px-3 py-1.5 rounded-lg text-xs text-rose-400 transition hover:bg-rose-500/10">
                  {I.close}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-4 flex-1 min-h-0">
        {/* Conversation list */}
        <div className="w-72 flex flex-col rounded-2xl overflow-hidden" style={{background:cardBg, border:cardBorder}}>
          <div className="p-4" style={{borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-white text-sm">Conversaciones</span>
              <div className="flex items-center gap-2">
                {alerts.length > 0 && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full text-white" style={{background:'#f43f5e'}}>
                    🚨 {alerts.length}
                  </span>
                )}
                <span className="text-[10px] text-ink-500">{filtered.length} total</span>
              </div>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-600">{I.search}</span>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar persona..."
                className="inp w-full pl-8 pr-3 py-2.5 rounded-xl text-xs" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-3 space-y-2">{[1,2,3,4,5].map(i=><div key={i} className="skeleton h-14 rounded-xl"/>)}</div>
            ) : filtered.length===0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-ink-600 text-xs">
                <div className="text-3xl mb-2">💬</div>Sin conversaciones
              </div>
            ) : filtered.map(c => {
              const name = c.user_name||c.user_phone
              const last = c.messages?.slice(-1)[0]?.content||''
              const unread = isUnread(c)
              const isSelected = selected?.id===c.id
              const hasAlert = alerts.some(a=>a.id===c.id)
              const msgCount = c.messages?.length||0

              return (
                <button key={c.id} onClick={()=>openConv(c)}
                  className="w-full flex items-center gap-3 p-3 text-left transition-all duration-150"
                  style={{
                    borderBottom:'1px solid rgba(255,255,255,0.03)',
                    background: isSelected ? 'rgba(139,92,246,0.12)' : hasAlert ? 'rgba(244,63,94,0.05)' : 'transparent',
                    borderLeft: isSelected ? '2px solid #8b5cf6' : hasAlert ? '2px solid #f43f5e' : '2px solid transparent'
                  }}>
                  <div className="relative">
                    <Avatar name={name} />
                    {unread && !isSelected && (
                      <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-violet-400 border-2 border-ink-900" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs truncate ${unread && !isSelected ? 'font-black text-white' : 'font-bold text-white/80'}`}>{name}</div>
                    <div className="text-[11px] text-ink-500 truncate mt-0.5">{last.substring(0,38)}{last.length>38&&'...'}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-ink-600">{timeAgo(c.updated_at)}</span>
                    {hasAlert && <span className="text-[9px]">🚨</span>}
                    {unread && !isSelected && msgCount > 0 && (
                      <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full text-white" style={{background:'#7c3aed'}}>{msgCount}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Chat panel */}
        <div className="flex-1 flex flex-col rounded-2xl overflow-hidden min-h-0" style={{background:cardBg, border:cardBorder}}>
          {!selected ? (
            <div className="flex-1 flex flex-col items-center justify-center text-ink-600">
              <div className="text-6xl mb-3 floating">💬</div>
              <div className="text-sm font-light">Selecciona una conversación para ver el historial</div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="px-5 py-3.5 flex items-center justify-between flex-shrink-0"
                style={{borderBottom:'1px solid rgba(255,255,255,0.05)', background:'rgba(28,28,52,0.5)'}}>
                <div className="flex items-center gap-3">
                  <Avatar name={selected.user_name||selected.user_phone} size={36} />
                  <div>
                    <div className="font-bold text-white text-sm">{selected.user_name||selected.user_phone}</div>
                    <div className="text-xs text-ink-500">{selected.user_phone} · {selected.messages?.length||0} mensajes</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {needsHuman(selected.messages) && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold" style={{background:'rgba(244,63,94,0.1)', color:'#fb7185', border:'1px solid rgba(244,63,94,0.2)'}}>
                      🚨 Requiere asesor
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold" style={{background:'rgba(16,185,129,0.1)', color:'#34d399', border:'1px solid rgba(16,185,129,0.2)'}}>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 relative live-ring" />
                    Activo
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
                {(selected.messages||[]).map((m,i) => {
                  const isAdvisor = m.content?.startsWith('[Asesor]:')
                  const displayContent = isAdvisor ? m.content.replace('[Asesor]: ','') : m.content
                  return (
                    <div key={i} className={`flex ${m.role==='user'?'justify-end':'justify-start'} fade-in`}>
                      {m.role!=='user' && (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] mr-2 flex-shrink-0 self-end"
                          style={{background: isAdvisor ? 'rgba(251,191,36,0.2)' : 'rgba(139,92,246,0.2)'}}>
                          {isAdvisor ? '👨‍💼' : '🤖'}
                        </div>
                      )}
                      <div className="max-w-[70%]">
                        <div className={`px-4 py-2.5 rounded-2xl text-[13px] leading-relaxed`}
                          style={m.role==='user'
                            ? {background:'linear-gradient(135deg,#7c3aed,#5b21b6)', color:'white', borderBottomRightRadius:4, boxShadow:'0 4px 16px rgba(124,58,237,0.3)'}
                            : isAdvisor
                              ? {background:'rgba(251,191,36,0.12)', border:'1px solid rgba(251,191,36,0.2)', color:'#fef3c7', borderBottomLeftRadius:4}
                              : {background:'rgba(34,34,62,0.8)', border:'1px solid rgba(255,255,255,0.06)', color:'#d0d0e8', borderBottomLeftRadius:4}}>
                          {displayContent}
                        </div>
                        <div className={`text-[10px] text-ink-600 mt-1 ${m.role==='user'?'text-right':'text-left'}`}>
                          {m.role==='user' ? '👤 Cliente' : isAdvisor ? '👨‍💼 Asesor' : '🤖 Bot'}
                        </div>
                      </div>
                      {m.role==='user' && (
                        <div className="w-6 h-6 rounded-full bg-sky-500/20 flex items-center justify-center text-[10px] ml-2 flex-shrink-0 self-end">👤</div>
                      )}
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Reply box */}
              <div className="p-3 flex-shrink-0" style={{borderTop:'1px solid rgba(255,255,255,0.05)', background:'rgba(17,17,30,0.6)'}}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] text-ink-500 font-bold uppercase tracking-widest">👨‍💼 Responder como asesor</span>
                </div>
                <div className="flex gap-2">
                  <input
                    value={reply}
                    onChange={e=>setReply(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendReply() }}}
                    placeholder="Escribe tu respuesta... (Enter para enviar)"
                    className="inp flex-1 px-4 py-3 rounded-xl text-sm"
                  />
                  <button onClick={sendReply} disabled={!reply.trim()||sending}
                    className="px-4 py-3 rounded-xl font-bold text-white transition flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{background:'linear-gradient(135deg,#7c3aed,#5b21b6)', boxShadow:'0 4px 16px rgba(124,58,237,0.3)'}}>
                    {sending ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spinning"/> : I.send}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   ORDERS PAGE
────────────────────────────────────────────── */
function OrdersPage({ clientId }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todos')

  const load = useCallback(async () => {
    let q = supabase.from('orders').select('*').order('created_at',{ascending:false})
    if (clientId) q = q.eq('client_id', clientId)
    const { data } = await q
    setOrders(data||[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  const update = async (id, status) => {
    await supabase.from('orders').update({status}).eq('id',id)
    load()
  }

  const filters = ['todos','pendiente','enviado','entregado','cancelado']
  const filtered = filter==='todos' ? orders : orders.filter(o=>o.status===filter)

  const statusCls = { pendiente:'badge-pending', enviado:'badge-sent', entregado:'badge-done', cancelado:'badge-cancel' }
  const counts = { pendiente:0, enviado:0, entregado:0, cancelado:0 }
  orders.forEach(o => { if(counts[o.status]!==undefined) counts[o.status]++ })

  return (
    <div className="space-y-5 fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Pedidos</h1>
          <p className="text-ink-400 text-sm">{orders.length} pedidos registrados</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-ink-400 hover:text-white transition" style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)'}}>
          {I.refresh} Actualizar
        </button>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-4 gap-3">
        {[['pendiente','#fbbf24','⏳'],['enviado','#38bdf8','🚚'],['entregado','#34d399','✅'],['cancelado','#fb7185','❌']].map(([s,c,e]) => (
          <div key={s} className="rounded-xl p-3 text-center cursor-pointer transition-all" onClick={()=>setFilter(f=>f===s?'todos':s)}
            style={{background: filter===s ? `${c}15` : 'rgba(22,22,42,0.6)', border:`1px solid ${filter===s?c+'40':'rgba(255,255,255,0.05)'}`, boxShadow: filter===s ? `0 0 20px ${c}20` : 'none'}}>
            <div className="text-2xl mb-1">{e}</div>
            <div className="font-black text-white text-xl">{counts[s]}</div>
            <div className="text-[10px] capitalize mt-0.5" style={{color:c}}>{s}</div>
          </div>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={{background:'linear-gradient(145deg,rgba(22,22,42,0.9),rgba(17,17,32,0.95))', border:'1px solid rgba(255,255,255,0.06)', boxShadow:'0 4px 24px rgba(0,0,0,0.4)'}}>
        {loading ? (
          <div className="p-5 space-y-3">{[1,2,3].map(i=><div key={i} className="skeleton h-12 rounded-xl"/>)}</div>
        ) : filtered.length===0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-ink-600">
            <div className="text-5xl mb-3">📦</div>
            <div className="text-sm">Sin pedidos {filter!=='todos'&&`con estado "${filter}"`}</div>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr style={{borderBottom:'1px solid rgba(255,255,255,0.05)', background:'rgba(28,28,52,0.5)'}}>
                {['Cliente','Producto','Ciudad','Pago','Estado','Fecha','Acción'].map(h => (
                  <th key={h} className="text-left text-[10px] font-bold uppercase tracking-widest text-ink-500 px-4 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(o => (
                <tr key={o.id} className="transition-colors hover:bg-white/2" style={{borderBottom:'1px solid rgba(255,255,255,0.03)'}}>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <Avatar name={o.user_name||o.user_phone} size={28} />
                      <span className="text-xs font-bold text-white">{o.user_name||o.user_phone}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ink-300">{o.product||'—'}</td>
                  <td className="px-4 py-3.5 text-xs text-ink-400">{o.city||'—'}</td>
                  <td className="px-4 py-3.5 text-xs text-ink-400">{o.payment_method||'—'}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${statusCls[o.status]||'badge-pending'}`}>{o.status}</span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-ink-500">{new Date(o.created_at).toLocaleDateString('es-CO')}</td>
                  <td className="px-4 py-3.5">
                    <select value={o.status} onChange={e=>update(o.id,e.target.value)}
                      className="inp px-2.5 py-1.5 rounded-lg text-[11px] cursor-pointer">
                      <option>pendiente</option><option>enviado</option><option>entregado</option><option>cancelado</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   CLIENTS PAGE (admin only)
────────────────────────────────────────────── */
function ClientsPage({ onRefresh }) {
  const [clients, setClients] = useState([])
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [showNew, setShowNew] = useState(false)
  const [newForm, setNewForm] = useState({ name:'',email:'',client_password:'',phone_number_id:'',whatsapp_token:'',prompt:'',model:'openai/gpt-3.5-turbo',active:true })
  const [saving, setSaving] = useState(false)

  const load = async () => {
    const { data } = await supabase.from('clients').select('*').order('created_at')
    setClients(data||[])
  }
  useEffect(() => { load() }, [])

  const save = async () => {
    setSaving(true)
    await supabase.from('clients').update({name:form.name,prompt:form.prompt,faq:form.faq,catalog:form.catalog,whatsapp_token:form.whatsapp_token,model:form.model,active:form.active,email:form.email,client_password:form.client_password}).eq('id',editing)
    setSaving(false); setEditing(null); load(); onRefresh()
  }
  const saveNew = async () => {
    setSaving(true)
    await supabase.from('clients').insert(newForm)
    setSaving(false); setShowNew(false); load(); onRefresh()
    setNewForm({ name:'',email:'',client_password:'',phone_number_id:'',whatsapp_token:'',prompt:'',model:'openai/gpt-3.5-turbo',active:true })
  }

  return (
    <div className="space-y-5 fade-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Clientes Bot</h1>
          <p className="text-ink-400 text-sm">{clients.length} negocios configurados</p>
        </div>
        <button onClick={() => setShowNew(true)} className="grad-btn flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white">
          {I.plus} Nuevo cliente
        </button>
      </div>

      {showNew && (
        <div className="rounded-2xl p-6 scale-in" style={{background:'linear-gradient(145deg,rgba(22,22,42,0.95),rgba(17,17,32,0.98))', border:'1px solid rgba(139,92,246,0.2)', boxShadow:'0 0 40px rgba(139,92,246,0.08)'}}>
          <h3 className="font-black text-white mb-5">➕ Nuevo cliente</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            {[{k:'name',l:'Nombre del negocio',p:'Mi Negocio SAS'},{k:'email',l:'Email de acceso',p:'cliente@negocio.com'},{k:'client_password',l:'Contraseña',p:'••••••••'},{k:'phone_number_id',l:'Phone Number ID',p:'107495...'},{k:'whatsapp_token',l:'WhatsApp Token',p:'EAAht...'},{k:'model',l:'Modelo IA',p:'openai/gpt-3.5-turbo'}].map(f=>(
              <div key={f.k}>
                <label className="block text-[10px] font-bold uppercase tracking-widest text-ink-400 mb-1.5">{f.l}</label>
                <input value={newForm[f.k]||''} onChange={e=>setNewForm({...newForm,[f.k]:e.target.value})} placeholder={f.p}
                  type={f.k==='client_password'?'password':'text'}
                  className="inp w-full px-3 py-2.5 rounded-xl text-xs" />
              </div>
            ))}
          </div>
          <div className="mb-4">
            <label className="block text-[10px] font-bold uppercase tracking-widest text-ink-400 mb-1.5">Prompt del bot</label>
            <textarea value={newForm.prompt} onChange={e=>setNewForm({...newForm,prompt:e.target.value})} rows={4} placeholder="Eres [nombre], asistente de [negocio]..."
              className="inp w-full px-3 py-2.5 rounded-xl text-xs resize-none" style={{fontFamily:'monospace'}} />
          </div>
          <div className="flex items-center gap-3 justify-end">
            <button onClick={()=>setShowNew(false)} className="px-4 py-2 rounded-xl text-xs text-ink-400 hover:text-white transition" style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)'}}>Cancelar</button>
            <button onClick={saveNew} disabled={saving} className="grad-btn px-5 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2">
              {saving ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full spinning"/>Guardando...</> : <>{I.save} Guardar cliente</>}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {clients.map(c => (
          <div key={c.id} className="rounded-2xl overflow-hidden" style={{background:'linear-gradient(145deg,rgba(22,22,42,0.9),rgba(17,17,32,0.95))', border:`1px solid ${editing===c.id?'rgba(139,92,246,0.3)':'rgba(255,255,255,0.06)'}`, boxShadow: editing===c.id ? '0 0 30px rgba(139,92,246,0.1)' : '0 4px 24px rgba(0,0,0,0.4)'}}>
            {editing===c.id ? (
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-violet-300 text-sm">✏️ Editando: {c.name}</h3>
                  <div className="flex gap-2">
                    <button onClick={()=>setEditing(null)} className="px-3 py-1.5 rounded-lg text-xs text-ink-400" style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)'}}>Cancelar</button>
                    <button onClick={save} disabled={saving} className="grad-btn px-4 py-1.5 rounded-lg text-xs font-bold text-white flex items-center gap-1.5">
                      {saving?<div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full spinning"/>:I.save} Guardar
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[{k:'name',l:'Nombre'},{k:'email',l:'Email login'},{k:'client_password',l:'Contraseña'},{k:'whatsapp_token',l:'Token WhatsApp'},{k:'model',l:'Modelo IA'}].map(f=>(
                    <div key={f.k}>
                      <label className="block text-[10px] font-bold uppercase tracking-widest text-ink-500 mb-1">{f.l}</label>
                      <input value={form[f.k]||''} onChange={e=>setForm({...form,[f.k]:e.target.value})}
                        type={f.k==='client_password'?'password':'text'}
                        className="inp w-full px-3 py-2.5 rounded-xl text-xs" />
                    </div>
                  ))}
                  <div className="flex items-center gap-3 pt-4">
                    <input type="checkbox" id={`a-${c.id}`} checked={form.active||false} onChange={e=>setForm({...form,active:e.target.checked})} className="w-4 h-4 accent-violet-500" />
                    <label htmlFor={`a-${c.id}`} className="text-xs text-ink-400">Bot activo</label>
                  </div>
                </div>
                {[{k:'prompt',l:'Prompt del bot',r:5},{k:'faq',l:'Preguntas frecuentes',r:3},{k:'catalog',l:'Catálogo / Menú',r:3}].map(f=>(
                  <div key={f.k}>
                    <label className="block text-[10px] font-bold uppercase tracking-widest text-ink-500 mb-1">{f.l}</label>
                    <textarea value={form[f.k]||''} onChange={e=>setForm({...form,[f.k]:e.target.value})} rows={f.r}
                      className="inp w-full px-3 py-2.5 rounded-xl text-xs resize-none" style={{fontFamily:'monospace'}} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-5 flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center font-black text-lg relative" style={{background:'linear-gradient(135deg,rgba(139,92,246,0.2),rgba(91,33,182,0.1))', border:'1px solid rgba(139,92,246,0.2)', color:'#a78bfa'}}>
                    {c.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 mb-1">
                      <span className="font-bold text-white text-sm">{c.name}</span>
                      <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${c.active?'badge-done':'badge-cancel'}`}>{c.active?'ACTIVO':'INACTIVO'}</span>
                    </div>
                    <div className="text-xs text-ink-500 mb-0.5">📧 {c.email||'Sin email'} · 🤖 {c.model||'gpt-3.5-turbo'}</div>
                    <div className="text-xs text-ink-600">ID: {c.phone_number_id}</div>
                    <div className="text-xs text-ink-600 mt-2 max-w-xl line-clamp-2 font-light" style={{fontFamily:'monospace'}}>{c.prompt?.substring(0,100)}...</div>
                  </div>
                </div>
                <button onClick={()=>{setEditing(c.id);setForm({...c})}} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs text-ink-400 hover:text-violet-300 transition" style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)'}}>
                  {I.edit} Editar
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────
   SETTINGS PAGE
────────────────────────────────────────────── */
function SettingsPage({ user, clientId }) {
  const [client, setClient] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!clientId) return
    supabase.from('clients').select('*').eq('id',clientId).single().then(({data})=>{
      setClient(data); setForm(data||{})
    })
  }, [clientId])

  const save = async () => {
    setSaving(true)
    await supabase.from('clients').update({prompt:form.prompt,faq:form.faq,catalog:form.catalog,model:form.model}).eq('id',clientId)
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),3000)
  }

  return (
    <div className="max-w-3xl space-y-6 fade-up">
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Configuración</h1>
        <p className="text-ink-400 text-sm">Personaliza tu bot y sus respuestas</p>
      </div>

      {user?.role==='admin' && !clientId ? (
        <div className="rounded-2xl p-8 text-center" style={{background:'rgba(22,22,42,0.6)', border:'1px solid rgba(255,255,255,0.06)'}}>
          <div className="text-4xl mb-3">🛡️</div>
          <div className="text-sm text-ink-400">Selecciona un cliente en el panel izquierdo para editar su configuración</div>
        </div>
      ) : !clientId ? null : (
        <>
          {[{k:'prompt',l:'Prompt del bot',h:'Define la personalidad y comportamiento del bot',r:10},{k:'faq',l:'Preguntas frecuentes',h:'Preguntas y respuestas que el bot debe conocer',r:6},{k:'catalog',l:'Catálogo / Menú',h:'Lista de productos o servicios disponibles',r:6}].map(f=>(
            <div key={f.k} className="rounded-2xl p-5" style={{background:'linear-gradient(145deg,rgba(22,22,42,0.9),rgba(17,17,32,0.95))', border:'1px solid rgba(255,255,255,0.06)'}}>
              <div className="mb-3">
                <div className="font-bold text-white text-sm mb-0.5">{f.l}</div>
                <div className="text-xs text-ink-500">{f.h}</div>
              </div>
              <textarea value={form[f.k]||''} onChange={e=>setForm({...form,[f.k]:e.target.value})} rows={f.r}
                className="inp w-full px-4 py-3 rounded-xl text-sm resize-none" style={{fontFamily:'monospace', fontSize:12}} />
            </div>
          ))}

          <div className="rounded-2xl p-5" style={{background:'linear-gradient(145deg,rgba(22,22,42,0.9),rgba(17,17,32,0.95))', border:'1px solid rgba(255,255,255,0.06)'}}>
            <div className="font-bold text-white text-sm mb-3">Modelo de IA</div>
            <select value={form.model||'openai/gpt-3.5-turbo'} onChange={e=>setForm({...form,model:e.target.value})}
              className="inp px-4 py-3 rounded-xl text-sm cursor-pointer">
              <option value="openai/gpt-3.5-turbo">GPT-3.5 Turbo · Rápido y económico</option>
              <option value="openai/gpt-4o">GPT-4o · Más inteligente</option>
              <option value="anthropic/claude-3-sonnet">Claude 3 Sonnet · Conversacional</option>
              <option value="anthropic/claude-3-opus">Claude 3 Opus · Máxima calidad</option>
            </select>
          </div>

          <div className="flex items-center justify-between">
            {saved && (
              <div className="flex items-center gap-2 text-sm text-emerald-400 fade-in">
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                Cambios guardados
              </div>
            )}
            <button onClick={save} disabled={saving} className="grad-btn ml-auto px-6 py-3 rounded-xl text-sm font-bold text-white flex items-center gap-2">
              {saving?<><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full spinning"/>Guardando...</>:<>{I.save} Guardar cambios</>}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/* ──────────────────────────────────────────────
   MAIN
────────────────────────────────────────────── */
export default function Dashboard({ toggleTheme, dark }) {
  const { user, logout } = useAuth()
  const router = useRouter()
  const [active, setActive] = useState('dashboard')
  const [clients, setClients] = useState([])
  const [selectedClient, setSelectedClient] = useState('')

  useEffect(() => {
    if (!user) { router.replace('/'); return }
    // Non-admin sees only their own data
    if (user.role !== 'admin' && user.clientId) setSelectedClient(user.clientId)
  }, [user])

  const loadClients = useCallback(async () => {
    const { data } = await supabase.from('clients').select('id,name').order('name')
    setClients(data||[])
  }, [])

  useEffect(() => { if (user?.role==='admin') loadClients() }, [user])

  if (!user) return null

  const clientId = user.role==='admin' ? selectedClient : user.clientId

  const pages = {
    dashboard:     <DashboardPage clientId={clientId} />,
    conversations: <ConversationsPage clientId={clientId} />,
    orders:        <OrdersPage clientId={clientId} />,
    clients:       <ClientsPage onRefresh={loadClients} />,
    settings:      <SettingsPage user={user} clientId={clientId} />,
  }

  return (
    <div className="min-h-screen bg-ink-950 font-lato">
      {/* Ambient background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-40 -left-40 w-80 h-80 rounded-full opacity-10" style={{background:'radial-gradient(circle,#7c3aed,transparent)', filter:'blur(80px)'}} />
        <div className="absolute -bottom-40 -right-40 w-80 h-80 rounded-full opacity-8" style={{background:'radial-gradient(circle,#10b981,transparent)', filter:'blur(80px)'}} />
      </div>

      <Sidebar
        active={active} setActive={setActive}
        user={user} clients={clients}
        selectedClient={selectedClient} setSelectedClient={setSelectedClient}
        toggleTheme={toggleTheme} dark={dark}
        onLogout={() => { logout(); router.push('/') }}
      />

      <main className="ml-60 p-7 relative z-10">
        {pages[active] || pages.dashboard}
      </main>
    </div>
  )
}
