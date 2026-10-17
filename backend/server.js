require("dotenv").config();

const express = require("express");
const http = require("http");
const cors = require("cors");
const path = require("path");
const { Server } = require("socket.io");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !secretKey || !publishableKey) {
  console.error("Supabase sozlamalari .env faylida to‘liq emas.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const authClient = createClient(supabaseUrl, publishableKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

app.use(cors());
app.use(express.json({ limit: "20kb" }));
// Server kodi va maxfiy fayllar brauzerga berilmasin
app.use((req, res, next) => {
  let p;

  try {
    p = decodeURIComponent(req.path).replace(/[\\/]+/g, "/").toLowerCase();
  } catch {
    return res.status(400).end();
  }

  if (
    /^\/(backend|node_modules)(\/|$)/.test(p) ||
    p === "/package.json" ||
    p === "/package-lock.json"
  ) {
    return res.status(404).end();
  }

  next();
});

app.use(express.static(path.join(__dirname, ".."), { dotfiles: "deny" }));

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "KENZOX server ishlayapti!"
  });
});

function makeEmail(username) {
  return `${username}@kenzox.app`;
}

function validateInput(username, password) {
  if (
    typeof username !== "string" ||
    !/^[a-z0-9_]{3,24}$/.test(username)
  ) {
    return "Username 3–24 ta harf, raqam yoki _ dan iborat bo‘lsin.";
  }

  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 72
  ) {
    return "Parol 8–72 ta belgidan iborat bo‘lishi kerak.";
  }

  return null;
}

app.post("/api/auth/signup", async (req, res) => {
  let createdUserId = null;

  try {
    const username =
      typeof req.body.username === "string"
        ? req.body.username.trim().toLowerCase()
        : "";

    const password = req.body.password;
    const name =
      typeof req.body.name === "string"
        ? req.body.name.trim()
        : "";

    const invalid = validateInput(username, password);

    if (invalid) {
      return res.status(400).json({ error: invalid });
    }

    if (name.length > 80) {
      return res.status(400).json({
        error: "Ism 80 belgidan oshmasin."
      });
    }

    const displayName = name || username;

    const { data: existing, error: lookupError } = await admin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .maybeSingle();

    if (lookupError) throw lookupError;

    if (existing) {
      return res.status(409).json({
        error: "Bu username band. Boshqasini tanlang."
      });
    }

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email: makeEmail(username),
        password,
        email_confirm: true,
        user_metadata: {
          username,
          display_name: displayName
        }
      });

    if (createError) throw createError;

    createdUserId = created.user.id;

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(
        {
          id: createdUserId,
          username,
          display_name: displayName
        },
        { onConflict: "id" }
      );

    if (profileError) throw profileError;

    const { data: login, error: loginError } =
      await authClient.auth.signInWithPassword({
        email: makeEmail(username),
        password
      });

    if (loginError) throw loginError;

    return res.status(201).json({
      success: true,
      session: login.session,
      user: {
        id: createdUserId,
        username,
        name: displayName
      }
    });
  }
   catch (error) {
  console.error("SIGNUP ERROR:", error);
  console.error("ERROR MESSAGE:", error.message);
  console.error("ERROR CAUSE:", error.cause);
  console.error("ERROR CODE:", error.cause?.code);
    if (createdUserId) {
      const { error: cleanupError } =
        await admin.auth.admin.deleteUser(createdUserId);

      if (cleanupError) {
        console.error("CLEANUP ERROR:", cleanupError);
      }
    }

    if (/already (registered|exists)|duplicate key/i.test(error.message || "")) {
      return res.status(409).json({
        error: "Bu username band. Boshqasini tanlang."
      });
    }

    return res.status(500).json({
      error: error.message || "Ro‘yxatdan o‘tishda xatolik."
    });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const username =
      typeof req.body.username === "string"
        ? req.body.username.trim().toLowerCase()
        : "";

    const password = req.body.password;
    const invalid = validateInput(username, password);

    if (invalid) {
      return res.status(400).json({ error: invalid });
    }

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, username, display_name")
      .eq("username", username)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!profile) {
      return res.status(401).json({
        error: "Username yoki parol noto‘g‘ri."
      });
    }

    const { data: login, error: loginError } =
      await authClient.auth.signInWithPassword({
        email: makeEmail(username),
        password
      });

    if (loginError) {
      return res.status(401).json({
        error: "Username yoki parol noto‘g‘ri."
      });
    }

    return res.json({
      success: true,
      session: login.session,
      user: {
        id: profile.id,
        username: profile.username,
        name: profile.display_name
      }
    });
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return res.status(500).json({
      error: error.message || "Kirishda xatolik."
    });
  }
});


async function getAuthUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

app.get("/api/profile", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: "Avval tizimga kiring." });
    }

    const { data: profile, error } = await admin
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;
    if (!profile) {
      return res.status(404).json({ error: "Profil topilmadi. Qayta ro‘yxatdan o‘tish kerak bo‘lishi mumkin." });
    }

    return res.json({ success: true, profile });
  } catch (error) {
    console.error("PROFILE GET ERROR:", error);
    return res.status(500).json({ error: error.message || "Profilni olishda xatolik." });
  }
});

app.patch("/api/profile", async (req, res) => {
  try {
    const user = await getAuthUser(req);
    if (!user) {
      return res.status(401).json({ error: "Avval tizimga kiring." });
    }

    const { data: current, error: currentError } = await admin
      .from("profiles")
      .select("id, username, display_name")
      .eq("id", user.id)
      .maybeSingle();

    if (currentError) throw currentError;
    if (!current) {
      return res.status(404).json({ error: "Profil topilmadi." });
    }

    const displayName = typeof req.body.display_name === "string"
      ? req.body.display_name.trim()
      : current.display_name;
    const username = typeof req.body.username === "string"
      ? req.body.username.trim().toLowerCase()
      : current.username;

    if (!displayName || displayName.length > 80) {
      return res.status(400).json({ error: "Ism 1–80 belgidan iborat bo‘lsin." });
    }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      return res.status(400).json({ error: "Username 3–24 ta harf, raqam yoki _ dan iborat bo‘lsin." });
    }

    const usernameChanged = username !== current.username;
    if (usernameChanged) {
      const { data: taken, error: takenError } = await admin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();

      if (takenError) throw takenError;
      if (taken && taken.id !== user.id) {
        return res.status(409).json({ error: "Bu username band. Boshqasini tanlang." });
      }

      const { error: emailError } = await admin.auth.admin.updateUserById(user.id, {
        email: makeEmail(username),
        email_confirm: true
      });
      if (emailError) throw emailError;
    }

    const { data: updated, error: updateError } = await admin
      .from("profiles")
      .update({ username, display_name: displayName })
      .eq("id", user.id)
      .select("id, username, display_name")
      .single();

    if (updateError) {
      if (usernameChanged) {
        const { error: rollbackError } = await admin.auth.admin.updateUserById(user.id, {
          email: makeEmail(current.username),
          email_confirm: true
        });
        if (rollbackError) console.error("USERNAME ROLLBACK ERROR:", rollbackError);
      }
      throw updateError;
    }

    return res.json({ success: true, profile: updated });
  } catch (error) {
    console.error("PROFILE PATCH ERROR:", error);
    return res.status(500).json({ error: error.message || "Profilni saqlashda xatolik." });
  }
});


/* ===================== MESSENGER ===================== */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUser(req, res) {
  const user = await getAuthUser(req);

  if (!user) {
    res.status(401).json({ error: "Avval tizimga kiring." });
    return null;
  }

  return user;
}

const sendLog = new Map();

function tooFast(userId) {
  const now = Date.now();
  const list = (sendLog.get(userId) || []).filter((t) => now - t < 10000);

  list.push(now);
  sendLog.set(userId, list);

  return list.length > 20;
}

const PROFILE_FIELDS = "id, username, display_name";
const MESSAGE_FIELDS = "id, sender_id, receiver_id, content, created_at, read_at";

function formatMessage(row) {
  return {
    ...row,
    body: row.content
  };
}

app.get("/api/users/search", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const q = String(req.query.q || "")
      .trim()
      .toLowerCase()
      .replace(/^@/, "")
      .replace(/[^a-z0-9_]/g, "");

    if (q.length < 2) {
      return res.json({ success: true, users: [] });
    }

    const { data, error } = await admin
      .from("profiles")
      .select(PROFILE_FIELDS)
      .ilike("username", `%${q}%`)
      .neq("id", user.id)
      .order("username", { ascending: true })
      .limit(10);

    if (error) throw error;

    return res.json({ success: true, users: data || [] });
  } catch (error) {
    console.error("SEARCH ERROR:", error);
    return res.status(500).json({ error: "Qidirishda xatolik." });
  }
});

app.get("/api/conversations", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const { data: rows, error } = await admin
      .from("messages")
      .select(MESSAGE_FIELDS)
      .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
      .order("created_at", { ascending: false })
      .limit(1000);

    if (error) throw error;

    const byPartner = new Map();

    for (const original of rows || []) {
      const row = formatMessage(original);
      const partnerId =
        row.sender_id === user.id ? row.receiver_id : row.sender_id;

      let item = byPartner.get(partnerId);

      if (!item) {
        item = { partnerId, last: row, unread: 0 };
        byPartner.set(partnerId, item);
      }

      if (row.receiver_id === user.id && !row.read_at) {
        item.unread += 1;
      }
    }

    const ids = [...byPartner.keys()];
    let profiles = [];

    if (ids.length) {
      const { data, error: profilesError } = await admin
        .from("profiles")
        .select(PROFILE_FIELDS)
        .in("id", ids);

      if (profilesError) throw profilesError;
      profiles = data || [];
    }

    const profileById = new Map(profiles.map((p) => [p.id, p]));

    const conversations = [...byPartner.values()]
      .filter((item) => profileById.has(item.partnerId))
      .map((item) => ({
        partner: profileById.get(item.partnerId),
        last: item.last,
        unread: item.unread
      }));

    return res.json({ success: true, conversations });
  } catch (error) {
    console.error("CONVERSATIONS ERROR:", error);
    return res.status(500).json({
      error: "Suhbatlarni yuklashda xatolik."
    });
  }
});

app.get("/api/messages", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const other = String(req.query.with || "");

    if (!UUID_RE.test(other)) {
      return res.status(400).json({ error: "Suhbatdosh noto‘g‘ri." });
    }

    const { data, error } = await admin
      .from("messages")
      .select(MESSAGE_FIELDS)
      .or(
        `and(sender_id.eq.${user.id},receiver_id.eq.${other}),` +
        `and(sender_id.eq.${other},receiver_id.eq.${user.id})`
      )
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) throw error;

    return res.json({
      success: true,
      messages: (data || []).reverse().map(formatMessage)
    });
  } catch (error) {
    console.error("MESSAGES GET ERROR:", error);
    return res.status(500).json({
      error: "Xabarlarni yuklashda xatolik."
    });
  }
});

app.post("/api/messages", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const to = String(req.body.to || "");
    const body =
      typeof req.body.body === "string" ? req.body.body.trim() : "";

    if (!UUID_RE.test(to) || to === user.id) {
      return res.status(400).json({
        error: "Qabul qiluvchi noto‘g‘ri."
      });
    }

    if (!body || body.length > 2000) {
      return res.status(400).json({
        error: "Xabar 1–2000 belgidan iborat bo‘lsin."
      });
    }

    if (tooFast(user.id)) {
      return res.status(429).json({
        error: "Juda tez yozyapsiz. Bir oz kuting."
      });
    }

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select(PROFILE_FIELDS)
      .in("id", [user.id, to]);

    if (profilesError) throw profilesError;

    const sender = (profiles || []).find((p) => p.id === user.id);
    const receiver = (profiles || []).find((p) => p.id === to);

    if (!sender) {
      return res.status(404).json({
        error: "Profilingiz topilmadi."
      });
    }

    if (!receiver) {
      return res.status(404).json({
        error: "Foydalanuvchi topilmadi."
      });
    }

    const { data: inserted, error: insertError } = await admin
      .from("messages")
      .insert({
        sender_id: user.id,
        receiver_id: to,
        content: body
      })
      .select(MESSAGE_FIELDS)
      .single();

    if (insertError) throw insertError;

    const message = formatMessage(inserted);

    io.to(`user:${to}`).emit("message:new", {
      message,
      partner: sender
    });

    io.to(`user:${user.id}`).emit("message:new", {
      message,
      partner: receiver
    });

    return res.status(201).json({
      success: true,
      message
    });
  } catch (error) {
    console.error("MESSAGE SEND ERROR:", error);
    return res.status(500).json({
      error: "Xabar yuborilmadi."
    });
  }
});

app.post("/api/messages/read", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const other = String(req.body.with || "");

    if (!UUID_RE.test(other)) {
      return res.status(400).json({
        error: "Suhbatdosh noto‘g‘ri."
      });
    }

    const readAt = new Date().toISOString();

    const { data, error } = await admin
      .from("messages")
      .update({ read_at: readAt })
      .eq("sender_id", other)
      .eq("receiver_id", user.id)
      .is("read_at", null)
      .select("id");

    if (error) throw error;

    if (data && data.length) {
      io.to(`user:${other}`).emit("messages:read", {
        by: user.id,
        at: readAt
      });
    }

    return res.json({
      success: true,
      count: data ? data.length : 0
    });
  } catch (error) {
    console.error("MESSAGE READ ERROR:", error);
    return res.status(500).json({
      error: "Belgilashda xatolik."
    });
  }
});

// Socket.io: faqat tizimga kirgan foydalanuvchilar ulana oladi
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth?.token;

    if (!token) return next(new Error("unauthorized"));

    const { data, error } = await admin.auth.getUser(token);

    if (error || !data?.user) return next(new Error("unauthorized"));

    socket.data.userId = data.user.id;
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});

/* ===================== QO'NG'IROQLAR (WebRTC signali) ===================== */

// Ovoz va video serverdan o'tmaydi, faqat ulanish ma'lumotlari uzatiladi.

const calls = new Map(); // callId -> { id, caller, callee, kind, answered, timer }
const userCall = new Map(); // userId -> callId (band foydalanuvchilar)
const inviteLog = new Map();

const CALL_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const RING_TIMEOUT_MS = Number(process.env.CALL_RING_TIMEOUT_MS) || 45000;

function isOnline(userId) {
  const room = io.sockets.adapter.rooms.get(`user:${userId}`);
  return Boolean(room && room.size > 0);
}

function validSdp(desc, type) {
  return (
    desc &&
    typeof desc === "object" &&
    desc.type === type &&
    typeof desc.sdp === "string" &&
    desc.sdp.length > 0 &&
    desc.sdp.length <= 30000
  );
}

// 30 soniyada 6 tadan ko'p qo'ng'iroq qilmasin
function inviteTooFast(userId) {
  const now = Date.now();
  const list = (inviteLog.get(userId) || []).filter((t) => now - t < 30000);

  list.push(now);
  inviteLog.set(userId, list);

  return list.length > 6;
}

function endCall(callId, reason, by = null) {
  const call = calls.get(callId);
  if (!call) return;

  clearTimeout(call.timer);
  calls.delete(callId);

  if (userCall.get(call.caller) === callId) userCall.delete(call.caller);
  if (userCall.get(call.callee) === callId) userCall.delete(call.callee);

  io.to(`user:${call.caller}`)
    .to(`user:${call.callee}`)
    .emit("call:ended", { callId, reason, by });
}

app.get("/api/ice", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const iceServers = [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302"
        ]
      }
    ];

    // Ba'zi tarmoqlarda (ayniqsa mobil internetda) TURN server kerak bo'ladi.
    // .env ga TURN_URL, TURN_USERNAME, TURN_CREDENTIAL qo'shsangiz, shu yerga chiqadi.
    if (
      process.env.TURN_URL &&
      process.env.TURN_USERNAME &&
      process.env.TURN_CREDENTIAL
    ) {
      iceServers.push({
        urls: process.env.TURN_URL.split(",").map((item) => item.trim()),
        username: process.env.TURN_USERNAME,
        credential: process.env.TURN_CREDENTIAL
      });
    }

    return res.json({ success: true, iceServers });
  } catch (error) {
    console.error("ICE ERROR:", error);
    return res.status(500).json({ error: "Qo‘ng‘iroq sozlamalarini olib bo‘lmadi." });
  }
});

io.on("connection", (socket) => {
  const me = socket.data.userId;

  socket.join(`user:${me}`);
  console.log("Yangi ulanish:", me);

  socket.on("call:invite", async (data, ack) => {
    const reply = typeof ack === "function" ? ack : () => {};

    try {
      const to = String(data?.to || "");
      const callId = String(data?.callId || "");
      const kind = data?.kind === "video" ? "video" : "audio";

      if (
        !UUID_RE.test(to) ||
        to === me ||
        !CALL_ID_RE.test(callId) ||
        calls.has(callId) ||
        !validSdp(data?.offer, "offer")
      ) {
        return reply({ ok: false, reason: "invalid" });
      }

      if (inviteTooFast(me)) return reply({ ok: false, reason: "too_fast" });
      if (userCall.has(me)) return reply({ ok: false, reason: "self_busy" });
      if (!isOnline(to)) return reply({ ok: false, reason: "offline" });
      if (userCall.has(to)) return reply({ ok: false, reason: "busy" });

      const { data: profile, error } = await admin
        .from("profiles")
        .select(PROFILE_FIELDS)
        .eq("id", me)
        .maybeSingle();

      if (error || !profile) return reply({ ok: false, reason: "error" });

      // Profil o'qilayotganda boshqa qo'ng'iroq boshlanib ketmaganini qayta tekshiramiz
      if (userCall.has(me) || userCall.has(to)) {
        return reply({ ok: false, reason: "busy" });
      }

      const call = {
        id: callId,
        caller: me,
        callee: to,
        kind,
        answered: false,
        timer: null
      };

      call.timer = setTimeout(() => endCall(callId, "timeout"), RING_TIMEOUT_MS);

      calls.set(callId, call);
      userCall.set(me, callId);
      userCall.set(to, callId);

      io.to(`user:${to}`).emit("call:incoming", {
        callId,
        kind,
        from: profile,
        offer: data.offer
      });

      return reply({ ok: true });
    } catch (error) {
      console.error("CALL INVITE ERROR:", error);
      return reply({ ok: false, reason: "error" });
    }
  });

  socket.on("call:answer", (data) => {
    const call = calls.get(String(data?.callId || ""));

    if (
      !call ||
      call.callee !== me ||
      call.answered ||
      !validSdp(data?.answer, "answer")
    ) {
      return;
    }

    call.answered = true;
    clearTimeout(call.timer);

    // Boshqa ochiq tablarda jiringlash to'xtasin
    socket.to(`user:${me}`).emit("call:handled", { callId: call.id });

    io.to(`user:${call.caller}`).emit("call:answer", {
      callId: call.id,
      answer: data.answer
    });
  });

  socket.on("call:ice", (data) => {
    const call = calls.get(String(data?.callId || ""));

    if (!call || (call.caller !== me && call.callee !== me)) return;

    const candidate = data?.candidate;

    if (
      !candidate ||
      typeof candidate !== "object" ||
      JSON.stringify(candidate).length > 2000
    ) {
      return;
    }

    const target = call.caller === me ? call.callee : call.caller;

    io.to(`user:${target}`).emit("call:ice", { callId: call.id, candidate });
  });

  socket.on("call:reject", (data) => {
    const call = calls.get(String(data?.callId || ""));

    if (!call || call.callee !== me || call.answered) return;

    socket.to(`user:${me}`).emit("call:handled", { callId: call.id });
    endCall(call.id, "rejected", me);
  });

  socket.on("call:end", (data) => {
    const call = calls.get(String(data?.callId || ""));

    if (!call || (call.caller !== me && call.callee !== me)) return;

    const reason = !call.answered && call.caller === me ? "cancelled" : "ended";

    endCall(call.id, reason, me);
  });

  socket.on("disconnect", () => {
    console.log("Ulanish uzildi:", me);

    // Foydalanuvchining oxirgi ochiq oynasi yopilsa, qo'ng'iroq tugaydi
    if (!isOnline(me)) {
      const callId = userCall.get(me);
      if (callId) endCall(callId, "disconnected", me);
    }
  });
});

server.listen(PORT, () => {
  console.log(`KENZOX server: http://localhost:${PORT}`);
});