import React, { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./supabaseClient.js";
import {
  MessageCircle, Compass, Shield, User, ArrowLeft, Send, Plus, LogOut, Lock,
  Pin, Trash2, Settings, IndianRupee, Crown, Smile, Paperclip, Camera, X, Users, Phone, Zap
} from "lucide-react";

const W = { teal: "#008069", sent: "#D9FDD3", recv: "#fff", wall: "#EAE2D8", ink: "#111B21", soft: "#667781", line: "#E9EDEF", blue: "#53BDEB", pink: "#D81B7A", bg: "#F0F2F5" };
const WALL = "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='80' height='80'><g fill='none' stroke='%23000' stroke-opacity='0.03' stroke-width='2'><circle cx='20' cy='20' r='6'/><path d='M50 14 l8 8 M58 14 l-8 8'/><rect x='48' y='48' width='14' height='14' rx='3'/><path d='M14 54 q8 -10 16 0'/></g></svg>`);

async function uploadPhoto(userId, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${userId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

async function uploadChatFile(roomId, file) {
  const ext = (file.name.split(".").pop() || "bin").toLowerCase();
  const path = `${roomId}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from("chat").upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("chat").getPublicUrl(path).data.publicUrl;
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return <Shell>{loading ? <Splash /> : session ? <Main user={session.user} /> : <Auth />}</Shell>;
}

function Shell({ children }) {
  return (
    <div style={{ fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif", background: "#d9d9d9", display: "flex", justifyContent: "center", minHeight: "100vh", width: "100%", overflowX: "hidden" }}>
      <style>{`html,body,#root{margin:0;padding:0;width:100%;max-width:100%;overflow-x:hidden;}*{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}input,button{font-family:inherit;}::-webkit-scrollbar{width:0;}.chatscreen{height:100vh;height:100dvh;}`}</style>
      <div style={{ width: "100%", maxWidth: 430, minHeight: "100vh", background: W.bg, boxShadow: "0 0 60px rgba(0,0,0,.15)", position: "relative", overflowX: "hidden" }}>{children}</div>
    </div>
  );
}
function Splash() { return <div style={{ height: "100vh", background: W.teal, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 28, fontWeight: 700 }}>Glasswings</div>; }

/* ---------------- auth ---------------- */
function Auth() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState(""), [email, setEmail] = useState(""), [pass, setPass] = useState(""), [gender, setGender] = useState("male");
  const [err, setErr] = useState(""), [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const go = async () => {
    setErr(""); setNote("");
    if (!email || !pass || (mode === "signup" && !name)) return setErr("Please fill in all fields.");
    setBusy(true);
    if (mode === "signup") {
      const { error } = await supabase.auth.signUp({ email, password: pass, options: { data: { full_name: name, gender } } });
      if (error) setErr(error.message); else setNote("Account created! If login doesn't happen automatically, just log in.");
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
      if (error) setErr(error.message);
    }
    setBusy(false);
  };
  const inp = (ph, v, s, t = "text") => <input value={v} onChange={e => s(e.target.value)} placeholder={ph} type={t} style={{ width: "100%", padding: "13px 15px", borderRadius: 10, border: `1px solid ${W.line}`, fontSize: 15, outline: "none", color: W.ink }} />;
  return (
    <div style={{ minHeight: "100vh", background: W.bg, padding: "0 22px", display: "flex", flexDirection: "column" }}>
      <div style={{ textAlign: "center", paddingTop: 64 }}>
        <div style={{ width: 74, height: 74, borderRadius: "50%", background: W.teal, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "center" }}><MessageCircle size={36} color="#fff" /></div>
        <div style={{ fontSize: 28, fontWeight: 700, color: W.ink, marginTop: 14 }}>Glasswings</div>
        <div style={{ color: W.soft, marginTop: 5, fontSize: 14 }}>Your events. Your community. Your chat.</div>
      </div>
      <div style={{ background: "#fff", borderRadius: 18, padding: 20, marginTop: 34, border: `1px solid ${W.line}` }}>
        <div style={{ display: "flex", background: W.bg, borderRadius: 10, padding: 4, marginBottom: 16 }}>
          {["login", "signup"].map(m => <button key={m} onClick={() => { setMode(m); setErr(""); setNote(""); }} style={{ flex: 1, padding: 9, border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, fontSize: 14, background: mode === m ? W.teal : "transparent", color: mode === m ? "#fff" : W.soft }}>{m === "login" ? "Log in" : "Sign up"}</button>)}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {mode === "signup" && inp("Full name", name, setName)}
          {inp("Email", email, setEmail, "email")}
          {inp("Password (min 6 characters)", pass, setPass, "password")}
          {mode === "signup" && (
            <div>
              <div style={{ fontSize: 13, color: W.soft, marginBottom: 7, fontWeight: 600 }}>I am</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[["male", "Man"], ["female", "Woman"], ["other", "Other"]].map(([v, l]) => <button key={v} onClick={() => setGender(v)} style={{ flex: 1, padding: "10px 0", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${gender === v ? W.teal : W.line}`, background: gender === v ? "#E7F6EF" : "#fff", color: W.ink, fontWeight: 600, fontSize: 14 }}>{l}</button>)}
              </div>
            </div>
          )}
          {err && <div style={{ color: "#C0392B", fontSize: 13 }}>{err}</div>}
          {note && <div style={{ color: W.teal, fontSize: 13 }}>{note}</div>}
          <button onClick={go} disabled={busy} style={{ padding: 14, borderRadius: 10, border: "none", cursor: "pointer", background: W.teal, color: "#fff", fontWeight: 700, fontSize: 15, opacity: busy ? .6 : 1 }}>{busy ? "Please wait…" : mode === "login" ? "Log in" : "Create account"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- profile completion (with photo) ---------------- */
function ProfileGate({ user, profile, reload }) {
  const [name, setName] = useState(profile.full_name || "");
  const [phone, setPhone] = useState(""), [age, setAge] = useState(""), [area, setArea] = useState(""), [prof, setProf] = useState("");
  const [avatar, setAvatar] = useState(profile.avatar_url || "");
  const [busy, setBusy] = useState(false), [uploading, setUploading] = useState(false), [err, setErr] = useState("");
  const fileRef = useRef(null);
  useEffect(() => {
    supabase.from("member_details").select("*").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => { if (data) { setPhone(data.phone || ""); setAge(data.age || ""); setArea(data.area || ""); setProf(data.profession || ""); } });
  }, [user.id]);
  const pick = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setErr(""); setUploading(true);
    try { setAvatar(await uploadPhoto(user.id, file)); } catch (x) { setErr("Photo upload failed: " + x.message); }
    setUploading(false);
  };
  const save = async () => {
    setErr(""); if (!name || !phone || !age || !area || !prof) return setErr("Please complete every field.");
    if (!avatar) return setErr("Please add a profile photo.");
    setBusy(true);
    const { error: e1 } = await supabase.from("member_details").upsert({ user_id: user.id, phone, age: Number(age) || null, area, profession: prof });
    const { error: e2 } = await supabase.from("profiles").update({ full_name: name, avatar_url: avatar, profile_completed: true }).eq("id", user.id);
    setBusy(false);
    if (e1 || e2) return setErr((e1 || e2).message);
    reload();
  };
  const inp = (ph, v, s, t = "text") => <input value={v} onChange={e => s(e.target.value)} placeholder={ph} type={t} style={{ width: "100%", padding: "13px 15px", borderRadius: 10, border: `1px solid ${W.line}`, fontSize: 15, outline: "none", color: W.ink }} />;
  return (
    <div style={{ minHeight: "100vh", background: W.bg }}>
      <TopBar title="Complete your profile" />
      <div style={{ padding: 18 }}>
        <div style={{ color: W.soft, fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>Welcome to Glasswings! Add your photo and details to join rooms and events. Your phone number stays private — only the organiser can see it.</div>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
          <div onClick={() => fileRef.current?.click()} style={{ position: "relative", cursor: "pointer" }}>
            <PersonAvatar url={avatar} name={name} size={96} />
            <div style={{ position: "absolute", bottom: 0, right: 0, width: 30, height: 30, borderRadius: "50%", background: W.teal, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}><Camera size={16} /></div>
            {uploading && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "rgba(0,0,0,.4)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>…</div>}
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {inp("Full name", name, setName)}
          {inp("Phone number", phone, setPhone, "tel")}
          {inp("Age", age, setAge, "number")}
          {inp("Area / locality", area, setArea)}
          {inp("Profession", prof, setProf)}
          {err && <div style={{ color: "#C0392B", fontSize: 13 }}>{err}</div>}
          <button onClick={save} disabled={busy || uploading} style={{ padding: 14, borderRadius: 10, border: "none", cursor: "pointer", background: W.teal, color: "#fff", fontWeight: 700, fontSize: 15, opacity: (busy || uploading) ? .6 : 1 }}>{busy ? "Saving…" : "Save & continue"}</button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- main ---------------- */
function Main({ user }) {
  const [profile, setProfile] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [subs, setSubs] = useState([]);
  const [mods, setMods] = useState([]);
  const [counts, setCounts] = useState({});
  const [tab, setTab] = useState("chats");
  const [openId, setOpenId] = useState(null);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [{ data: prof }, { data: rm }, { data: sb }, { data: md }, { data: cnt }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("rooms").select("*").order("created_at", { ascending: true }),
      supabase.from("room_subscriptions").select("room_id").eq("user_id", user.id),
      supabase.from("room_moderators").select("room_id").eq("user_id", user.id),
      supabase.rpc("room_member_counts"),
    ]);
    setProfile(prof); setRooms(rm || []); setSubs((sb || []).map(x => x.room_id)); setMods((md || []).map(x => x.room_id));
    const cm = {}; (cnt || []).forEach(x => { cm[x.room_id] = Number(x.members); }); setCounts(cm);
    setReady(true);
  }, [user.id]);
  useEffect(() => { load(); }, [load]);

  const isAdmin = profile?.role === "admin";
  const canAccess = (r) => isAdmin || subs.includes(r.id) || mods.includes(r.id);
  const freeForUser = (r) => r.price_monthly === 0 || profile?.gender !== "male" || profile?.founding_member;
  const joinRoom = async (r) => {
    if (canAccess(r)) return setOpenId(r.id);
    if (!freeForUser(r)) return setNotice("Online payments are being set up — paid subscriptions for men are coming next.");
    const { error } = await supabase.from("room_subscriptions").insert({ room_id: r.id, user_id: user.id });
    if (error) return setNotice(error.message);
    setSubs(p => [...p, r.id]); setCounts(c => ({ ...c, [r.id]: (c[r.id] || 0) + 1 })); setOpenId(r.id);
  };
  const createRoom = async (d) => { const { error } = await supabase.from("rooms").insert(d); if (error) return setNotice(error.message); await load(); };
  const updateRoom = async (id, p) => { const { error } = await supabase.from("rooms").update(p).eq("id", id); if (error) return setNotice(error.message); setRooms(prev => prev.map(r => r.id === id ? { ...r, ...p } : r)); };
  const deleteRoom = async (id) => { const { error } = await supabase.from("rooms").delete().eq("id", id); if (error) return setNotice(error.message); setRooms(prev => prev.filter(r => r.id !== id)); setOpenId(null); };

  if (!ready) return <Splash />;
  if (profile && !profile.profile_completed) return <ProfileGate user={user} profile={profile} reload={load} />;

  const open = openId ? rooms.find(r => r.id === openId) : null;
  if (open) return <RoomChat room={open} user={user} profile={profile} isAdmin={isAdmin} memberCount={counts[open.id] || 0} onBack={() => setOpenId(null)} onUpdateRoom={updateRoom} />;
  const myChats = rooms.filter(canAccess);

  return (
    <>
      {notice && <Notice text={notice} onClose={() => setNotice("")} />}
      <div style={{ paddingBottom: 64, minHeight: "100vh", background: W.bg }}>
        {tab === "chats" && <Chats rooms={myChats} counts={counts} onOpen={setOpenId} onExplore={() => setTab("explore")} />}
        {tab === "explore" && <Explore rooms={rooms} profile={profile} counts={counts} canAccess={canAccess} freeForUser={freeForUser} onJoin={joinRoom} />}
        {tab === "admin" && isAdmin && <Admin rooms={rooms} counts={counts} onCreate={createRoom} onUpdate={updateRoom} onDelete={deleteRoom} />}
        {tab === "profile" && <Profile user={user} profile={profile} reload={load} />}
      </div>
      <Nav tab={tab} setTab={setTab} isAdmin={isAdmin} />
    </>
  );
}

function Notice({ text, onClose }) {
  return (
    <div style={{ position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", width: "92%", maxWidth: 400, zIndex: 60, background: W.ink, color: "#fff", borderRadius: 12, padding: "12px 14px", display: "flex", gap: 10, alignItems: "flex-start", boxShadow: "0 8px 24px rgba(0,0,0,.25)" }}>
      <div style={{ flex: 1, fontSize: 13.5, lineHeight: 1.45 }}>{text}</div>
      <X size={18} style={{ cursor: "pointer", flexShrink: 0 }} onClick={onClose} />
    </div>
  );
}

/* ---------------- chats ---------------- */
function Chats({ rooms, counts, onOpen, onExplore }) {
  return (
    <div>
      <TopBar title="Glasswings" />
      {rooms.length === 0 ? (
        <div style={{ textAlign: "center", padding: "80px 30px", color: W.soft }}>
          <MessageCircle size={42} color={W.teal} style={{ marginBottom: 14 }} />
          <div style={{ fontWeight: 700, color: W.ink, fontSize: 17 }}>No chats yet</div>
          <div style={{ fontSize: 14, marginTop: 6 }}>Join a room to start chatting.</div>
          <button onClick={onExplore} style={{ marginTop: 16, padding: "11px 20px", border: "none", borderRadius: 22, background: W.teal, color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Explore rooms</button>
        </div>
      ) : rooms.map(r => (
        <div key={r.id} onClick={() => onOpen(r.id)} style={{ display: "flex", gap: 13, alignItems: "center", padding: "12px 16px", background: "#fff", cursor: "pointer", borderBottom: `1px solid ${W.line}` }}>
          <Avatar room={r} size={52} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 16, color: W.ink }}>{r.name}</div>
            <div style={{ color: W.soft, fontSize: 13.5, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{(counts[r.id] || 0)} members · tap to open</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------------- explore ---------------- */
function Explore({ rooms, profile, counts, canAccess, freeForUser, onJoin }) {
  return (
    <div>
      <TopBar title="Explore Rooms" />
      <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {rooms.length === 0 && <Center>No rooms yet. Create one from the Admin tab.</Center>}
        {rooms.map(r => {
          const has = canAccess(r);
          const womenFree = r.price_monthly > 0 && profile?.gender !== "male";
          return (
            <div key={r.id} style={{ background: "#fff", borderRadius: 16, border: `1px solid ${W.line}`, padding: 16 }}>
              <div style={{ display: "flex", gap: 13 }}>
                <Avatar room={r} size={50} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: W.ink }}>{r.name}</div>
                  <div style={{ color: W.soft, fontSize: 13.5, marginTop: 3, lineHeight: 1.4 }}>{r.description}</div>
                  <div style={{ color: W.soft, fontSize: 12.5, marginTop: 5, display: "flex", alignItems: "center", gap: 5 }}><Users size={13} />{counts[r.id] || 0} members</div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {r.price_monthly === 0 ? <span style={{ fontWeight: 700, color: W.teal, fontSize: 15 }}>Free</span>
                    : womenFree ? <><span style={{ textDecoration: "line-through", color: W.soft, fontSize: 14, display: "flex", alignItems: "center" }}><IndianRupee size={13} />{r.price_monthly}</span><span style={{ background: "#FCE7F1", color: W.pink, fontWeight: 700, fontSize: 12, padding: "3px 9px", borderRadius: 20 }}>Free for women</span></>
                      : <span style={{ fontWeight: 700, color: W.ink, fontSize: 15, display: "flex", alignItems: "center" }}><IndianRupee size={14} />{r.price_monthly}<span style={{ color: W.soft, fontWeight: 500, fontSize: 13 }}>/mo</span></span>}
                </div>
                {has ? <button onClick={() => onJoin(r)} style={btn(W.teal, "#fff")}><MessageCircle size={15} />Open</button>
                  : freeForUser(r) ? <button onClick={() => onJoin(r)} style={btn(W.teal, "#fff")}>Join free</button>
                    : <button onClick={() => onJoin(r)} style={btn(W.ink, "#fff")}><Lock size={14} />Subscribe</button>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- chat room ---------------- */
function RoomChat({ room, user, profile, isAdmin, memberCount, onBack, onUpdateRoom }) {
  const [msgs, setMsgs] = useState(null);
  const [senders, setSenders] = useState({});
  const [text, setText] = useState("");
  const [editPin, setEditPin] = useState(false);
  const [pinText, setPinText] = useState(room.pinned || "");
  const endRef = useRef(null);
  const sRef = useRef({});
  const headRef = useRef(null);
  const [headPad, setHeadPad] = useState(112);
  const camRef = useRef(null);
  const fileRef = useRef(null);
  const [qrs, setQrs] = useState([]);
  const [showQR, setShowQR] = useState(false);
  const [newQR, setNewQR] = useState("");

  useEffect(() => {
    let channel;
    (async () => {
      const { data } = await supabase.from("messages")
        .select("id, body, media_url, media_type, file_name, sender_id, created_at, sender:profiles(full_name, avatar_url)")
        .eq("group_type", "room").eq("group_id", room.id)
        .order("created_at", { ascending: true });
      const sm = {}; (data || []).forEach(m => { if (m.sender) sm[m.sender_id] = { name: m.sender.full_name, avatar: m.sender.avatar_url || sm[m.sender_id]?.avatar }; });
      sm[user.id] = { name: profile.full_name, avatar: profile.avatar_url || sm[user.id]?.avatar }; sRef.current = sm; setSenders(sm);
      setMsgs((data || []).map(m => ({ id: m.id, body: m.body, media_url: m.media_url, media_type: m.media_type, file_name: m.file_name, sender_id: m.sender_id, created_at: m.created_at })));
      channel = supabase.channel("room-" + room.id)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${room.id}` }, async (payload) => {
          const m = payload.new;
          if (!sRef.current[m.sender_id]) {
            const { data: p } = await supabase.from("profiles").select("full_name, avatar_url").eq("id", m.sender_id).single();
            sRef.current = { ...sRef.current, [m.sender_id]: { name: p?.full_name || "Member", avatar: p?.avatar_url } }; setSenders(sRef.current);
          }
          setMsgs(prev => (prev && prev.some(x => x.id === m.id)) ? prev : [...(prev || []), { id: m.id, body: m.body, media_url: m.media_url, media_type: m.media_type, file_name: m.file_name, sender_id: m.sender_id, created_at: m.created_at }]);
        }).subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [room.id]);
  useEffect(() => { endRef.current?.scrollIntoView(); }, [msgs]);
  useEffect(() => { if (headRef.current) setHeadPad(headRef.current.offsetHeight); }, [room.pinned, isAdmin, editPin, msgs === null]);
  useEffect(() => { supabase.from("quick_replies").select("*").eq("owner_id", user.id).order("created_at", { ascending: true }).then(({ data }) => setQrs(data || [])); }, [user.id]);

  const send = async () => {
    const body = text.trim(); if (!body) return; setText("");
    const { data, error } = await supabase.from("messages").insert({ group_type: "room", group_id: room.id, sender_id: user.id, body }).select("id, body, media_url, media_type, file_name, sender_id, created_at").single();
    if (error) { setText(body); return; }
    setMsgs(prev => prev.some(x => x.id === data.id) ? prev : [...prev, data]);
  };
  const sendFile = async (file, kind) => {
    if (!file) return;
    try {
      const url = await uploadChatFile(room.id, file);
      const { data, error } = await supabase.from("messages").insert({ group_type: "room", group_id: room.id, sender_id: user.id, body: "", media_url: url, media_type: kind, file_name: file.name }).select("id, body, media_url, media_type, file_name, sender_id, created_at").single();
      if (error) throw error;
      setMsgs(prev => prev.some(x => x.id === data.id) ? prev : [...prev, data]);
    } catch (x) { alert("Upload failed: " + x.message); }
  };
  const addQR = async () => { const t = newQR.trim(); if (!t) return; const { data, error } = await supabase.from("quick_replies").insert({ owner_id: user.id, text: t }).select().single(); if (!error) { setQrs(p => [...p, data]); setNewQR(""); } };
  const delQR = async (id) => { await supabase.from("quick_replies").delete().eq("id", id); setQrs(p => p.filter(q => q.id !== id)); };
  const savePin = async () => { await onUpdateRoom(room.id, { pinned: pinText.trim() }); room.pinned = pinText.trim(); setEditPin(false); };

  return (
    <div style={{ minHeight: "100dvh", background: W.wall, backgroundImage: `url("${WALL}")`, paddingBottom: 72 }}>
      <div ref={headRef} style={{ position: "fixed", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, zIndex: 30 }}>
        <div style={{ background: W.teal, color: "#fff", display: "flex", alignItems: "center", gap: 10, padding: "12px" }}>
          <ArrowLeft size={22} onClick={onBack} style={{ cursor: "pointer", flexShrink: 0 }} />
          <Avatar room={room} size={38} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 16.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{room.name}</div>
            <div style={{ fontSize: 12, opacity: .85 }}>{memberCount} members</div>
          </div>
        </div>
        {(room.pinned || isAdmin) && (
          <div style={{ background: "#fff", borderBottom: `1px solid ${W.line}`, padding: "8px 14px", display: "flex", alignItems: "center", gap: 9 }}>
            <Pin size={15} color={W.teal} style={{ flexShrink: 0 }} />
            {editPin ? (<>
              <input value={pinText} onChange={e => setPinText(e.target.value)} placeholder="Pin an announcement…" style={{ flex: 1, minWidth: 0, border: `1px solid ${W.line}`, borderRadius: 8, padding: "6px 10px", fontSize: 13, outline: "none" }} />
              <button onClick={savePin} style={{ ...btn(W.teal, "#fff"), padding: "6px 12px" }}>Save</button>
            </>) : (<>
              <div style={{ flex: 1, minWidth: 0, fontSize: 13.5, color: room.pinned ? W.ink : W.soft }}>{room.pinned || "No announcement pinned"}</div>
              {isAdmin && <Settings size={16} color={W.soft} style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => { setPinText(room.pinned || ""); setEditPin(true); }} />}
            </>)}
          </div>
        )}
      </div>
      <div style={{ paddingTop: headPad + 8, paddingLeft: 8, paddingRight: 8, paddingBottom: 8 }}>
        <div style={{ textAlign: "center", margin: "0 0 16px" }}><span style={{ background: "#FBF1C7", color: "#54656F", fontSize: 12, padding: "5px 12px", borderRadius: 8 }}>🔒 Only members can see these messages</span></div>
        {msgs === null ? <Center>loading…</Center> : msgs.length === 0 ? <Center>No messages yet — say hello 👋</Center> :
          msgs.map((m, i) => {
            const mine = m.sender_id === user.id;
            const first = (i === 0 || msgs[i - 1].sender_id !== m.sender_id);
            const s = senders[m.sender_id] || {};
            return (
              <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", alignItems: "flex-start", gap: 6, margin: "2px 4px" }}>
                {!mine && (first ? <PersonAvatar url={s.avatar} name={s.name} size={28} /> : <div style={{ width: 28, flexShrink: 0 }} />)}
                <div style={{ maxWidth: "78%", background: mine ? W.sent : W.recv, padding: "6px 9px 5px", borderRadius: 8, borderTopRightRadius: mine ? 2 : 8, borderTopLeftRadius: mine ? 8 : 2, boxShadow: "0 1px 1px rgba(0,0,0,.12)" }}>
                  {!mine && first && <div style={{ fontSize: 12.5, fontWeight: 700, color: W.teal, marginBottom: 1 }}>{s.name || "Member"}</div>}
                  {m.media_url && m.media_type === "image" && <img src={m.media_url} alt="" style={{ maxWidth: "100%", borderRadius: 6, display: "block", marginBottom: m.body ? 4 : 0 }} />}
                  {m.media_url && m.media_type === "file" && <a href={m.media_url} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none", color: W.ink, background: "#F0F2F5", borderRadius: 8, padding: "8px 10px", marginBottom: m.body ? 4 : 0 }}><Paperclip size={16} color={W.teal} /><span style={{ fontSize: 13.5, wordBreak: "break-all" }}>{m.file_name || "file"}</span></a>}
                  {m.body && <div style={{ fontSize: 14.5, color: W.ink, lineHeight: 1.35 }}>{m.body}</div>}
                  <div style={{ fontSize: 11, color: W.soft, textAlign: "right", marginTop: 2 }}>{fmtTime(m.created_at)}</div>
                </div>
                {mine && (first ? <PersonAvatar url={s.avatar} name={s.name} size={28} /> : <div style={{ width: 28, flexShrink: 0 }} />)}
              </div>
            );
          })}
        <div ref={endRef} />
      </div>
      {showQR && (
        <div style={{ position: "fixed", bottom: 63, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, zIndex: 25, background: "#fff", borderTop: `1px solid ${W.line}`, boxShadow: "0 -4px 16px rgba(0,0,0,.08)", maxHeight: "45vh", overflowY: "auto", padding: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontWeight: 700, color: W.ink, fontSize: 14 }}>Quick replies</span>
            <X size={18} style={{ cursor: "pointer" }} onClick={() => setShowQR(false)} />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input value={newQR} onChange={e => setNewQR(e.target.value)} placeholder="Save a new quick reply…" style={{ flex: 1, minWidth: 0, border: `1px solid ${W.line}`, borderRadius: 9, padding: "9px 12px", fontSize: 14, outline: "none" }} />
            <button onClick={addQR} style={btn(W.teal, "#fff")}>Save</button>
          </div>
          {qrs.length === 0 ? <div style={{ color: W.soft, fontSize: 13, padding: "6px 0" }}>No saved replies yet. Type one above and Save.</div> :
            qrs.map(q => (
              <div key={q.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 0", borderTop: `1px solid ${W.line}` }}>
                <div onClick={() => { setText(q.text); setShowQR(false); }} style={{ flex: 1, minWidth: 0, fontSize: 14, color: W.ink, cursor: "pointer" }}>{q.text}</div>
                <Trash2 size={16} color="#C0392B" style={{ cursor: "pointer", flexShrink: 0 }} onClick={() => delQR(q.id)} />
              </div>
            ))}
        </div>
      )}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, zIndex: 20, background: W.bg, padding: "8px 9px", display: "flex", alignItems: "flex-end", gap: 7 }}>
        <div style={{ flex: 1, minWidth: 0, background: "#fff", borderRadius: 24, display: "flex", alignItems: "center", gap: 8, padding: "9px 12px" }}>
          <Zap size={21} color={showQR ? W.teal : W.soft} style={{ flexShrink: 0, cursor: "pointer" }} onClick={() => setShowQR(v => !v)} />
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="Message" style={{ flex: 1, minWidth: 0, border: "none", outline: "none", fontSize: 15.5, color: W.ink }} />
          <Paperclip size={20} color={W.soft} style={{ flexShrink: 0, cursor: "pointer" }} onClick={() => fileRef.current?.click()} />
          <Camera size={20} color={W.soft} style={{ flexShrink: 0, cursor: "pointer" }} onClick={() => camRef.current?.click()} />
        </div>
        <button onClick={send} style={{ width: 47, height: 47, borderRadius: "50%", border: "none", background: W.teal, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Send size={20} /></button>
        <input ref={camRef} type="file" accept="image/*" capture="environment" onChange={e => { sendFile(e.target.files?.[0], "image"); e.target.value = ""; }} style={{ display: "none" }} />
        <input ref={fileRef} type="file" onChange={e => { const f = e.target.files?.[0]; sendFile(f, f && f.type.startsWith("image/") ? "image" : "file"); e.target.value = ""; }} style={{ display: "none" }} />
      </div>
    </div>
  );
}

/* ---------------- admin ---------------- */
function Admin({ rooms, counts, onCreate, onUpdate, onDelete }) {
  const [seg, setSeg] = useState("rooms");
  return (
    <div>
      <TopBar title="Admin Panel" />
      <div style={{ display: "flex", background: "#fff", borderBottom: `1px solid ${W.line}`, position: "sticky", top: 53, zIndex: 9 }}>
        {[["rooms", "Rooms"], ["members", "Members"]].map(([v, l]) => (
          <button key={v} onClick={() => setSeg(v)} style={{ flex: 1, padding: "13px 0", border: "none", background: "none", cursor: "pointer", fontWeight: 700, fontSize: 14, color: seg === v ? W.teal : W.soft, borderBottom: `3px solid ${seg === v ? W.teal : "transparent"}` }}>{l}</button>
        ))}
      </div>
      {seg === "rooms" ? <AdminRooms rooms={rooms} onCreate={onCreate} onUpdate={onUpdate} onDelete={onDelete} /> : <AdminMembers />}
    </div>
  );
}
function AdminRooms({ rooms, onCreate, onUpdate, onDelete }) {
  const [creating, setCreating] = useState(false), [manage, setManage] = useState(null);
  const [f, setF] = useState({ emoji: "💬", name: "", price: "", desc: "" });
  const reset = () => setF({ emoji: "💬", name: "", price: "", desc: "" });
  const create = async () => { if (!f.name) return; await onCreate({ name: f.name, emoji: f.emoji || "💬", price_monthly: Number(f.price) || 0, description: f.desc }); reset(); setCreating(false); };
  return (
    <div style={{ padding: 14 }}>
      {creating ? (
        <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${W.line}`, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, marginBottom: 12, color: W.ink }}>New subscription room</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <input value={f.emoji} onChange={e => setF({ ...f, emoji: e.target.value })} maxLength={2} style={{ width: 56, textAlign: "center", fontSize: 22, border: `1px solid ${W.line}`, borderRadius: 10, padding: 8 }} />
            <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Room name" style={{ flex: 1, minWidth: 0, border: `1px solid ${W.line}`, borderRadius: 10, padding: "11px 13px", fontSize: 15, outline: "none" }} />
          </div>
          <input value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} placeholder="Short description" style={{ width: "100%", border: `1px solid ${W.line}`, borderRadius: 10, padding: "11px 13px", fontSize: 15, outline: "none", marginBottom: 10 }} />
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <span style={{ color: W.soft, fontSize: 14 }}>₹</span>
            <input value={f.price} onChange={e => setF({ ...f, price: e.target.value.replace(/\D/g, "") })} placeholder="0 (free)" inputMode="numeric" style={{ flex: 1, minWidth: 0, border: `1px solid ${W.line}`, borderRadius: 10, padding: "11px 13px", fontSize: 15, outline: "none" }} />
            <span style={{ color: W.soft, fontSize: 14 }}>per month</span>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { setCreating(false); reset(); }} style={{ ...btn("#fff", W.ink), border: `1px solid ${W.line}`, flex: 1, justifyContent: "center" }}>Cancel</button>
            <button onClick={create} style={{ ...btn(W.teal, "#fff"), flex: 1, justifyContent: "center" }}>Create</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setCreating(true)} style={{ width: "100%", padding: 14, border: `1.5px dashed ${W.teal}`, borderRadius: 14, background: "#fff", color: W.teal, fontWeight: 700, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 16 }}><Plus size={18} />Create subscription room</button>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rooms.map(r => (
          <div key={r.id} style={{ background: "#fff", borderRadius: 14, border: `1px solid ${W.line}`, padding: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar room={r} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 700, color: W.ink }}>{r.name}</div><div style={{ fontSize: 13, color: W.soft }}>{r.price_monthly === 0 ? "Free" : `₹${r.price_monthly}/mo`}</div></div>
              <Settings size={19} color={W.soft} style={{ cursor: "pointer" }} onClick={() => setManage(manage === r.id ? null : r.id)} />
            </div>
            {manage === r.id && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${W.line}`, paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
                <RoomPhoto room={r} onUpdate={onUpdate} />
                <PinEditor room={r} onUpdate={onUpdate} />
                <button onClick={() => { if (confirm("Delete this room and all its messages?")) onDelete(r.id); }} style={{ ...btn("#fff", "#C0392B"), border: "1px solid #F2C4C0", justifyContent: "center" }}><Trash2 size={15} />Delete room</button>
              </div>
            )}
          </div>
        ))}
        {rooms.length === 0 && <Center>No rooms yet.</Center>}
      </div>
    </div>
  );
}
function PinEditor({ room, onUpdate }) {
  const [pin, setPin] = useState(room.pinned || "");
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: W.soft }}>Pinned announcement</label>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <input value={pin} onChange={e => setPin(e.target.value)} placeholder="e.g. Next meetup Friday 7PM" style={{ flex: 1, minWidth: 0, border: `1px solid ${W.line}`, borderRadius: 9, padding: "9px 12px", fontSize: 14, outline: "none" }} />
        <button onClick={() => onUpdate(room.id, { pinned: pin.trim() })} style={btn(W.teal, "#fff")}>Pin</button>
      </div>
    </div>
  );
}
function RoomPhoto({ room, onUpdate }) {
  const ref = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const f = e.target.files?.[0]; if (!f) return;
    setBusy(true);
    try { const url = await uploadPhoto(room.id, f); await onUpdate(room.id, { logo_url: url }); }
    catch (x) { alert("Upload failed: " + x.message); }
    setBusy(false);
  };
  return (
    <div>
      <label style={{ fontSize: 13, fontWeight: 600, color: W.soft }}>Room photo / icon</label>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6 }}>
        <Avatar room={room} size={48} />
        <button onClick={() => ref.current?.click()} style={btn(W.teal, "#fff")}><Camera size={15} />{busy ? "Uploading…" : "Change photo"}</button>
        <input ref={ref} type="file" accept="image/*" onChange={pick} style={{ display: "none" }} />
      </div>
    </div>
  );
}
function AdminMembers() {
  const [list, setList] = useState(null);
  useEffect(() => {
    supabase.from("profiles").select("id, full_name, gender, role, avatar_url, member_details(phone, age, area, profession)").order("created_at", { ascending: false })
      .then(({ data }) => setList(data || []));
  }, []);
  if (list === null) return <Center>loading members…</Center>;
  return (
    <div style={{ padding: 14 }}>
      <div style={{ fontSize: 13.5, color: W.soft, marginBottom: 12 }}>{list.length} total members · only you can see these details</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {list.map(m => {
          const d = m.member_details || {};
          return (
            <div key={m.id} style={{ background: "#fff", borderRadius: 14, border: `1px solid ${W.line}`, padding: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
                <PersonAvatar url={m.avatar_url} name={m.full_name} size={42} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: W.ink }}>{m.full_name || "—"} {m.role !== "member" && <span style={{ fontSize: 11, color: W.teal }}>· {m.role}</span>}</div>
                  <div style={{ fontSize: 13, color: W.soft, display: "flex", alignItems: "center", gap: 5 }}><Phone size={12} />{d.phone || "no phone"}</div>
                </div>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 14px", marginTop: 10, fontSize: 13, color: W.soft }}>
                <span>Sex: {{ male: "M", female: "F", other: "—" }[m.gender] || "—"}</span>
                <span>Age: {d.age || "—"}</span>
                <span>Area: {d.area || "—"}</span>
                <span>Work: {d.profession || "—"}</span>
              </div>
            </div>
          );
        })}
        {list.length === 0 && <Center>No members yet.</Center>}
      </div>
    </div>
  );
}

/* ---------------- profile ---------------- */
function Profile({ user, profile, reload }) {
  const roleLabel = { admin: "Admin (Owner)", subadmin: "Sub-admin", member: "Member" }[profile?.role] || "Member";
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const change = async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true);
    try { const url = await uploadPhoto(user.id, file); await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id); reload(); } catch (x) { alert("Upload failed: " + x.message); }
    setBusy(false);
  };
  return (
    <div>
      <TopBar title="Profile" />
      <div style={{ padding: 16 }}>
        <div style={{ background: "#fff", borderRadius: 16, border: `1px solid ${W.line}`, padding: 20, display: "flex", alignItems: "center", gap: 16 }}>
          <div onClick={() => fileRef.current?.click()} style={{ position: "relative", cursor: "pointer", flexShrink: 0 }}>
            <PersonAvatar url={profile?.avatar_url} name={profile?.full_name} size={64} />
            <div style={{ position: "absolute", bottom: -2, right: -2, width: 24, height: 24, borderRadius: "50%", background: W.teal, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>{busy ? "…" : <Camera size={12} />}</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" onChange={change} style={{ display: "none" }} />
          <div>
            <div style={{ fontSize: 21, fontWeight: 700, color: W.ink }}>{profile?.full_name || "—"}</div>
            <div style={{ color: W.soft, fontSize: 14 }}>{user.email}</div>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, marginTop: 7, background: "#E7F6EF", color: W.teal, fontSize: 12.5, fontWeight: 700, padding: "4px 10px", borderRadius: 20 }}>{profile?.role !== "member" && <Crown size={13} />}{roleLabel}</span>
          </div>
        </div>
        <button onClick={() => supabase.auth.signOut()} style={{ marginTop: 16, width: "100%", padding: 14, borderRadius: 12, border: `1px solid ${W.line}`, background: "#fff", color: "#C0392B", fontWeight: 700, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><LogOut size={18} />Log out</button>
      </div>
    </div>
  );
}

/* ---------------- shared ---------------- */
function TopBar({ title }) { return <div style={{ background: W.teal, color: "#fff", padding: "16px 18px", fontSize: 21, fontWeight: 700, position: "sticky", top: 0, zIndex: 10 }}>{title}</div>; }
function Avatar({ room, size }) {
  if (room?.logo_url) return <img src={room.logo_url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return <div style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0, fontSize: size * .5, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#7AD6C0,#008069)" }}>{room?.emoji || "💬"}</div>;
}
function PersonAvatar({ url, name, size }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return <div style={{ width: size, height: size, borderRadius: "50%", background: "#9DB2AC", color: "#fff", fontWeight: 700, fontSize: size * .42, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{(name || "?")[0].toUpperCase()}</div>;
}
const Center = ({ children }) => <div style={{ textAlign: "center", color: W.soft, fontSize: 14, padding: "26px 0" }}>{children}</div>;
const btn = (bg, fg) => ({ background: bg, color: fg, border: "none", borderRadius: 9, padding: "9px 16px", fontWeight: 700, fontSize: 13.5, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 });
function fmtTime(t) { return new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
function Nav({ tab, setTab, isAdmin }) {
  const items = [{ id: "chats", icon: MessageCircle, label: "Chats" }, { id: "explore", icon: Compass, label: "Explore" }, ...(isAdmin ? [{ id: "admin", icon: Shield, label: "Admin" }] : []), { id: "profile", icon: User, label: "Profile" }];
  return (
    <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#fff", borderTop: `1px solid ${W.line}`, display: "flex", padding: "8px 0 11px" }}>
      {items.map(it => { const on = tab === it.id; const I = it.icon; return <button key={it.id} onClick={() => setTab(it.id)} style={{ flex: 1, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, color: on ? W.teal : W.soft }}><I size={23} strokeWidth={on ? 2.4 : 2} /><span style={{ fontSize: 11, fontWeight: on ? 700 : 500 }}>{it.label}</span></button>; })}
    </div>
  );
}
