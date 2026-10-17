import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { io } from "https://cdn.jsdelivr.net/npm/socket.io-client@4.8.1/+esm";

const SUPABASE_URL = "https://jzdwgnylusvsstratrty.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_DoMuWxjz9KSWX-SPkIqQXw_P_TyJMpM";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Sahifa Live Server (5500, 5501, 5502...) orqali ochilsa ham,
// so'rovlar KENZOX serveriga (localhost:5000) boradi.
const isLocalStatic =
  location.protocol === "file:" ||
  (["localhost", "127.0.0.1"].includes(location.hostname) &&
    location.port !== "5000");
const API_BASE = isLocalStatic ? "http://localhost:5000" : "";

let currentProfile = null;
let profileModal = null;

async function api(path, options = {}) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const session = data.session;
  if (!session?.access_token) {
    window.location.replace("./auth.html");
    throw new Error("Sessiya topilmadi. Qayta tizimga kiring.");
  }

  const response = await fetch(API_BASE + path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      Authorization: `Bearer ${session.access_token}`
    }
  });

  const raw = await response.text();
  let result;
  try {
    result = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`Server JSON qaytarmadi (HTTP ${response.status}). URL: ${path}`);
  }

  if (!response.ok) throw new Error(result.error || result.message || `Server xatosi: ${response.status}`);
  return result;
}

function ensureProfileModal() {
  if (profileModal) return profileModal;

  profileModal = document.createElement("div");
  profileModal.id = "kenzoxProfileModal";
  profileModal.style.cssText = "position:fixed;inset:0;z-index:9999;display:none;place-items:center;padding:20px;background:#050711bb;backdrop-filter:blur(8px)";
  profileModal.innerHTML = `
    <section style="width:min(100%,420px);padding:24px;background:#151827;color:#f5f5ff;border:1px solid #303349;border-radius:18px;box-shadow:0 20px 70px #0008;font-family:Arial,sans-serif">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:20px">
        <h2 style="font-size:21px">Profil sozlamalari</h2>
        <button type="button" id="kenzoxProfileClose" aria-label="Yopish" style="border:0;background:#292d42;color:white;border-radius:8px;padding:8px 12px;cursor:pointer">✕</button>
      </div>
      <form id="kenzoxProfileForm">
        <label for="kenzoxDisplayName" style="display:block;margin:12px 0 7px;color:#c9cbe0;font-size:13px">Ism</label>
        <input id="kenzoxDisplayName" maxlength="80" required style="width:100%;padding:12px;border:1px solid #353a52;border-radius:9px;background:#0b0d16;color:white">
        <label for="kenzoxUsername" style="display:block;margin:14px 0 7px;color:#c9cbe0;font-size:13px">Username</label>
        <input id="kenzoxUsername" minlength="3" maxlength="24" pattern="[A-Za-z0-9_]{3,24}" required style="width:100%;padding:12px;border:1px solid #353a52;border-radius:9px;background:#0b0d16;color:white">
        <p id="kenzoxProfileStatus" role="status" style="min-height:20px;margin-top:12px;font-size:13px;line-height:1.5;color:#ff9caa"></p>
        <button id="kenzoxProfileSave" type="submit" style="width:100%;margin-top:8px;padding:12px;border:0;border-radius:9px;background:#8b5cf6;color:white;font-weight:700;cursor:pointer">Saqlash</button>
        <button id="kenzoxLogout" type="button" style="width:100%;margin-top:9px;padding:12px;border:1px solid #353a52;border-radius:9px;background:transparent;color:#f5f5ff;cursor:pointer">Hisobdan chiqish</button>
      </form>
    </section>`;
  document.body.appendChild(profileModal);

  profileModal.addEventListener("click", event => {
    if (event.target === profileModal || event.target.id === "kenzoxProfileClose") {
      profileModal.style.display = "none";
    }
  });

  $("#kenzoxProfileForm").addEventListener("submit", async event => {
    event.preventDefault();
    const save = $("#kenzoxProfileSave");
    const status = $("#kenzoxProfileStatus");
    const display_name = $("#kenzoxDisplayName").value.trim();
    const username = $("#kenzoxUsername").value.trim().toLowerCase();

    if (!display_name || display_name.length > 80) {
      status.textContent = "Ism 1–80 belgidan iborat bo‘lsin.";
      return;
    }
    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      status.textContent = "Username 3–24 ta harf, raqam yoki _ dan iborat bo‘lsin.";
      return;
    }

    save.disabled = true;
    status.style.color = "#c9cbe0";
    status.textContent = "Saqlanmoqda...";
    try {
      const result = await api("/api/profile", {
        method: "PATCH",
        body: JSON.stringify({ display_name, username })
      });
      currentProfile = result.profile;
      applyProfile(currentProfile);
      status.style.color = "#72e6a2";
      status.textContent = "Profil muvaffaqiyatli saqlandi.";
    } catch (error) {
      status.style.color = "#ff9caa";
      status.textContent = error.message || "Profilni saqlab bo‘lmadi.";
    } finally {
      save.disabled = false;
    }
  });

  $("#kenzoxLogout").addEventListener("click", async () => {
    try {
      await supabase.auth.signOut();
    } finally {
      window.location.replace("./auth.html");
    }
  });

  return profileModal;
}

function applyProfile(profile) {
  if (!profile) return;
  const name = profile.display_name || profile.username || "KENZOX foydalanuvchisi";
  const username = profile.username || "";
  if ($("#myName")) $("#myName").textContent = name;
  if ($("#myUsername")) $("#myUsername").textContent = "@" + username;
  if ($("#myAvatar")) {
    const avatar = $("#myAvatar");
    const dot = avatar.querySelector(".online-dot");
    avatar.textContent = name.charAt(0).toUpperCase();
    if (dot) avatar.appendChild(dot);
  }
}

async function loadProfile() {
  try {
    const result = await api("/api/profile");
    currentProfile = result.profile;
    applyProfile(currentProfile);
  } catch (error) {
    if ($("#myName")) $("#myName").textContent = "Profil yuklanmadi";
    if ($("#myUsername")) $("#myUsername").textContent = "Qayta kiring";
    showToast(error.message || "Profilni yuklab bo‘lmadi");
    console.error("KENZOX PROFILE LOAD:", error);
  }
}

async function openProfile() {
  try {
    const result = await api("/api/profile");
    currentProfile = result.profile;
    applyProfile(currentProfile);
    ensureProfileModal();
    $("#kenzoxDisplayName").value = currentProfile.display_name || "";
    $("#kenzoxUsername").value = currentProfile.username || "";
    $("#kenzoxProfileStatus").textContent = "";
    profileModal.style.display = "grid";
  } catch (error) {
    showToast(error.message || "Profilni ochib bo‘lmadi");
    console.error("KENZOX PROFILE OPEN:", error);
  }
}


const $ = (selector) => document.querySelector(selector);

const app = $("#app");
const chatList = $("#chatList");
const messagesEl = $("#messages");
const messagesArea = $("#messagesArea");
const messageForm = $("#messageForm");
const messageInput = $("#messageInput");
const sendBtn = messageForm.querySelector(".send-btn");
const searchInput = $("#searchInput");
const toast = $("#toast");

let activeChatId = null;
let activeFilter = "all";
let toastTimer;
let searchTimer;
let searchSeq = 0;
let chats = [];
let userResults = [];
let socket = null;

/* ===== Yordamchi funksiyalar ===== */

function showToast(text) {
  toast.textContent = text;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function colorFor(text) {
  let hash = 0;
  for (const char of String(text)) hash = (hash * 31 + char.charCodeAt(0)) % 7;
  return hash;
}

function clockTime(iso) {
  return new Date(iso).toLocaleTimeString("uz-UZ", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function listTime(iso) {
  const date = new Date(iso);
  const now = new Date();

  if (date.toDateString() === now.toDateString()) return clockTime(iso);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Kecha";

  return date.toLocaleDateString("uz-UZ", { day: "2-digit", month: "2-digit" });
}

function cleanQuery(value) {
  return value.trim().toLowerCase().replace(/^@/, "");
}

function mapMessage(row) {
  return {
    id: row.id,
    from: row.sender_id === currentProfile?.id ? "me" : "them",
    text: row.body,
    time: clockTime(row.created_at),
    createdAt: row.created_at,
    read: Boolean(row.read_at)
  };
}

function makeChat(profile) {
  const name = profile.display_name || profile.username;

  return {
    id: profile.id,
    name,
    username: profile.username,
    avatar: name.charAt(0).toUpperCase(),
    color: colorFor(profile.username),
    online: false,
    unread: 0,
    group: false,
    messages: [],
    loaded: false,
    last: null,
    lastAt: Date.now()
  };
}

function getChat(id) {
  return chats.find(chat => chat.id === id);
}

function getActiveChat() {
  return activeChatId ? getChat(activeChatId) : null;
}

function ensureChat(profile) {
  let chat = getChat(profile.id);

  if (!chat) {
    chat = makeChat(profile);
    chats.unshift(chat);
  } else {
    const fresh = makeChat(profile);
    chat.name = fresh.name;
    chat.username = fresh.username;
    chat.avatar = fresh.avatar;
    chat.color = fresh.color;
  }

  return chat;
}

function previewText(chat) {
  if (!chat.last) return "Hali xabar yo‘q";
  return (chat.last.from === "me" ? "Siz: " : "") + chat.last.text;
}

function createAvatar(chat, large = false) {
  const avatar = document.createElement("div");
  avatar.className = `avatar avatar-${chat.color}${large ? " avatar-large" : ""}`;
  avatar.textContent = chat.avatar;

  if (chat.online) {
    const dot = document.createElement("span");
    dot.className = "online-dot";
    avatar.appendChild(dot);
  }

  return avatar;
}

function createChatItem(chat, { onClick, preview, time, unread }) {
  const item = document.createElement("button");
  item.className = "chat-item" + (chat.id === activeChatId ? " active" : "");
  item.type = "button";
  item.addEventListener("click", onClick);

  item.appendChild(createAvatar(chat));

  const main = document.createElement("div");
  main.className = "chat-main";

  const top = document.createElement("div");
  top.className = "chat-row-top";

  const name = document.createElement("span");
  name.className = "chat-name";
  name.textContent = chat.name;

  const timeEl = document.createElement("span");
  timeEl.className = "chat-time";
  timeEl.textContent = time || "";

  top.append(name, timeEl);

  const bottom = document.createElement("div");
  bottom.className = "chat-row-bottom";

  const previewEl = document.createElement("span");
  previewEl.className = "chat-preview";
  previewEl.textContent = preview;

  bottom.appendChild(previewEl);

  if (unread > 0) {
    const badge = document.createElement("span");
    badge.className = "unread-badge";
    badge.textContent = unread > 99 ? "99+" : unread;
    bottom.appendChild(badge);
  }

  main.append(top, bottom);
  item.appendChild(main);

  return item;
}

/* ===== Suhbatlar ro'yxati ===== */

function renderChats() {
  const query = cleanQuery(searchInput.value);

  const sorted = [...chats].sort((a, b) => b.lastAt - a.lastAt);

  const visibleChats = sorted.filter(chat => {
    const matchesSearch =
      !query ||
      chat.name.toLowerCase().includes(query) ||
      chat.username.toLowerCase().includes(query) ||
      previewText(chat).toLowerCase().includes(query);

    const matchesFilter =
      activeFilter === "all" ||
      (activeFilter === "unread" && chat.unread > 0) ||
      (activeFilter === "groups" && chat.group);

    return matchesSearch && matchesFilter;
  });

  const foundUsers =
    activeFilter === "all" && query.length >= 2
      ? userResults.filter(user => !getChat(user.id))
      : [];

  chatList.replaceChildren();

  visibleChats.forEach(chat => {
    chatList.appendChild(
      createChatItem(chat, {
        onClick: () => openChat(chat.id),
        preview: previewText(chat),
        time: chat.last ? listTime(chat.last.createdAt) : "",
        unread: chat.unread
      })
    );
  });

  if (foundUsers.length) {
    const label = document.createElement("div");
    label.className = "section-label";
    const labelText = document.createElement("span");
    labelText.textContent = "TOPILGAN FOYDALANUVCHILAR";
    label.appendChild(labelText);
    chatList.appendChild(label);

    foundUsers.forEach(user => {
      const chat = makeChat(user);
      chatList.appendChild(
        createChatItem(chat, {
          onClick: () => openUser(user),
          preview: "@" + user.username,
          time: "",
          unread: 0
        })
      );
    });
  }

  if (!visibleChats.length && !foundUsers.length) {
    const empty = document.createElement("div");
    empty.className = "empty-chats";
    empty.textContent = query
      ? "Hech narsa topilmadi"
      : "Hali suhbat yo‘q. Yuqoridagi qidiruvga username yozing.";
    empty.style.cssText =
      "padding:24px 12px;text-align:center;color:var(--muted);font-size:12px;line-height:1.6";
    chatList.appendChild(empty);
  }
}

/* ===== Xabarlar oynasi ===== */

function renderEmptyState(title, text) {
  const box = document.createElement("div");
  box.className = "empty-state";
  box.style.cssText = "text-align:center;color:var(--muted);padding:40px 12px;line-height:1.7";

  const icon = document.createElement("p");
  icon.textContent = "💬";
  icon.style.fontSize = "34px";

  const heading = document.createElement("h3");
  heading.textContent = title;

  const span = document.createElement("span");
  span.textContent = text;

  box.append(icon, heading, span);
  messagesEl.replaceChildren(box);
}

function createMessageElement(message) {
  const wrapper = document.createElement("article");
  wrapper.className = "message" + (message.from === "me" ? " mine" : "");
  wrapper.dataset.messageId = message.id;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble";
  bubble.textContent = message.text;
  wrapper.appendChild(bubble);

  const meta = document.createElement("div");
  meta.className = "message-meta";

  const time = document.createElement("span");
  time.textContent = message.time;
  meta.appendChild(time);

  if (message.from === "me") {
    const checks = document.createElement("span");
    checks.className = "read-check";
    checks.textContent = message.read ? "✓✓" : "✓";
    meta.appendChild(checks);
  }

  wrapper.appendChild(meta);
  return wrapper;
}

function renderMessages() {
  const chat = getActiveChat();

  if (!chat) {
    renderEmptyState(
      "Suhbatni tanlang",
      "Chap tomondan suhbatni tanlang yoki username yozib foydalanuvchini qidiring."
    );
    return;
  }

  if (!chat.loaded) {
    renderEmptyState("Yuklanmoqda...", "");
    return;
  }

  if (!chat.messages.length) {
    renderEmptyState("Hali xabar yo‘q", `${chat.name} ga birinchi xabarni yozing.`);
    return;
  }

  messagesEl.replaceChildren(...chat.messages.map(createMessageElement));
  messagesArea.scrollTop = messagesArea.scrollHeight;
}

function updateHeader() {
  const chat = getActiveChat();
  if (!chat) return;

  $("#headerAvatar").className = `avatar avatar-large avatar-${chat.color}`;
  $("#headerAvatar").textContent = chat.avatar;
  $("#headerName").textContent = chat.name;
  $("#headerStatus").textContent = "@" + chat.username;

  $("#detailsAvatar").className = `avatar avatar-xl avatar-${chat.color}`;
  $("#detailsAvatar").textContent = chat.avatar;
  $("#detailsName").textContent = chat.name;
  $("#detailsStatus").textContent = "KENZOX foydalanuvchisi";
  $("#detailsUsername").textContent = "@" + chat.username;
}

/* ===== Suhbatni ochish va o'qildi deb belgilash ===== */

async function markRead(chat) {
  const unread = chat.messages.filter(message => message.from === "them" && !message.read);

  chat.unread = 0;

  if (!unread.length) {
    renderChats();
    return;
  }

  unread.forEach(message => {
    message.read = true;
  });

  renderChats();

  try {
    await api("/api/messages/read", {
      method: "POST",
      body: JSON.stringify({ with: chat.id })
    });
  } catch (error) {
    console.error("KENZOX READ:", error);
  }
}

async function openChat(id) {
  const chat = getChat(id);
  if (!chat) return;

  activeChatId = id;
  chat.unread = 0;

  messageInput.disabled = false;
  sendBtn.disabled = false;

  updateHeader();
  renderMessages();
  renderChats();

  app.classList.add("mobile-chat-open");
  $("#emojiPicker").classList.add("hidden");
  messageInput.focus();

  if (!chat.loaded) {
    try {
      const result = await api(`/api/messages?with=${encodeURIComponent(chat.id)}`);
      chat.messages = result.messages.map(mapMessage);

      if (chat.last && !chat.messages.some(message => message.id === chat.last.id)) {
        chat.messages.push(chat.last);
      }

      const last = chat.messages[chat.messages.length - 1];
      if (last) chat.last = last;

      chat.loaded = true;
    } catch (error) {
      showToast(error.message || "Xabarlarni yuklab bo‘lmadi");
      console.error("KENZOX LOAD MESSAGES:", error);
      return;
    }

    if (activeChatId === id) renderMessages();
  }

  markRead(chat);
}

function openUser(profile) {
  const chat = ensureChat(profile);

  searchInput.value = "";
  userResults = [];

  openChat(chat.id);
}

/* ===== Xabar qabul qilish va yuborish ===== */

function handleMessage(row, partner) {
  const myId = currentProfile?.id;
  if (!myId || !partner) return;

  const mine = row.sender_id === myId;
  const chat = ensureChat(partner);
  const message = mapMessage(row);

  const duplicate =
    chat.messages.some(item => item.id === message.id) ||
    chat.last?.id === message.id;

  if (duplicate) return;

  if (chat.loaded) chat.messages.push(message);

  chat.last = message;
  chat.lastAt = new Date(row.created_at).getTime();

  if (!mine) {
    if (chat.id === activeChatId) {
      if (chat.loaded) markRead(chat);
    } else {
      chat.unread += 1;
    }
  }

  if (chat.id === activeChatId) renderMessages();
  renderChats();
}

messageForm.addEventListener("submit", async event => {
  event.preventDefault();

  const chat = getActiveChat();
  const text = messageInput.value.trim();

  if (!chat || !text) return;

  messageInput.value = "";
  $("#emojiPicker").classList.add("hidden");

  try {
    const result = await api("/api/messages", {
      method: "POST",
      body: JSON.stringify({ to: chat.id, body: text })
    });

    handleMessage(result.message, {
      id: chat.id,
      username: chat.username,
      display_name: chat.name
    });
  } catch (error) {
    messageInput.value = text;
    showToast(error.message || "Xabar yuborilmadi");
  }

  messageInput.focus();
});

/* ===== Qidiruv ===== */

searchInput.addEventListener("input", () => {
  renderChats();
  clearTimeout(searchTimer);

  const query = cleanQuery(searchInput.value);

  if (query.length < 2) {
    userResults = [];
    renderChats();
    return;
  }

  searchTimer = setTimeout(async () => {
    const seq = ++searchSeq;

    try {
      const result = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
      if (seq !== searchSeq) return;

      userResults = result.users;
      renderChats();
    } catch (error) {
      console.error("KENZOX SEARCH:", error);
    }
  }, 300);
});

document.querySelectorAll(".filter").forEach(button => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".filter").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    activeFilter = button.dataset.filter;
    renderChats();
  });
});

/* ===== Yangi suhbat oynasi ===== */

const newChatResults = document.createElement("div");
newChatResults.style.cssText = "margin-top:12px;display:grid;gap:6px;max-height:260px;overflow:auto";
$("#newChatForm").after(newChatResults);

let modalTimer;
let modalSeq = 0;

function showModalMessage(text) {
  const note = document.createElement("p");
  note.textContent = text;
  note.style.cssText = "color:var(--muted);font-size:12px;text-align:center;padding:8px";
  newChatResults.replaceChildren(note);
}

async function runModalSearch(rawQuery, openIfExact = false) {
  const query = cleanQuery(rawQuery);

  if (query.length < 2) {
    newChatResults.replaceChildren();
    return;
  }

  const seq = ++modalSeq;

  try {
    const result = await api(`/api/users/search?q=${encodeURIComponent(query)}`);
    if (seq !== modalSeq) return;

    if (!result.users.length) {
      showModalMessage("Bunday foydalanuvchi topilmadi");
      return;
    }

    const exact = result.users.find(user => user.username === query);

    if (openIfExact && exact) {
      closeNewChat();
      openUser(exact);
      return;
    }

    newChatResults.replaceChildren(
      ...result.users.map(user =>
        createChatItem(makeChat(user), {
          onClick: () => {
            closeNewChat();
            openUser(user);
          },
          preview: "@" + user.username,
          time: "",
          unread: 0
        })
      )
    );
  } catch (error) {
    showModalMessage(error.message || "Qidirib bo‘lmadi");
  }
}

function closeNewChat() {
  $("#newChatModal").classList.add("hidden");
  $("#newChatName").value = "";
  newChatResults.replaceChildren();
}

$("#newChatBtn").addEventListener("click", () => {
  newChatResults.replaceChildren();
  $("#newChatModal").classList.remove("hidden");
  $("#newChatName").focus();
});

$("#closeModalBtn").addEventListener("click", closeNewChat);

$("#newChatModal").addEventListener("click", event => {
  if (event.target === $("#newChatModal")) closeNewChat();
});

$("#newChatName").addEventListener("input", () => {
  clearTimeout(modalTimer);
  modalTimer = setTimeout(() => runModalSearch($("#newChatName").value), 300);
});

$("#newChatForm").addEventListener("submit", event => {
  event.preventDefault();
  clearTimeout(modalTimer);
  runModalSearch($("#newChatName").value, true);
});

/* ===== Real vaqt (Socket.io) ===== */

function connectSocket() {
  socket = io(API_BASE || undefined, {
    auth: async callback => {
      const { data } = await supabase.auth.getSession();
      callback({ token: data.session?.access_token || "" });
    }
  });

  socket.on("connect_error", error => {
    console.error("KENZOX SOCKET:", error.message);
  });

  socket.on("disconnect", () => {
    if (currentCallId) {
      showToast("Server bilan aloqa uzildi");
      finishCall(false);
    }
  });

  socket.on("message:new", ({ message, partner }) => {
    handleMessage(message, partner);
  });

  socket.on("messages:read", ({ by }) => {
    const chat = getChat(by);
    if (!chat) return;

    chat.messages.forEach(message => {
      if (message.from === "me") message.read = true;
    });

    if (chat.last?.from === "me") chat.last.read = true;
    if (chat.id === activeChatId) renderMessages();
  });

  /* ----- Qo'ng'iroq signallari (server.js bilan bir xil nomlar) ----- */

  socket.on("call:incoming", handleIncomingCall);

  // Qo'ng'iroq qiluvchi: qarshi tomon javob berdi
  socket.on("call:answer", async data => {
    const pc = peerConnection;
    if (!data || data.callId !== currentCallId || !pc) return;
    if (pc.signalingState !== "have-local-offer") return;
    if (!data.answer?.sdp) return;

    try {
      await pc.setRemoteDescription({ type: "answer", sdp: data.answer.sdp });
      setCallStatus("Ulanmoqda...");
      await flushRemoteIce();
    } catch (error) {
      console.error("KENZOX CALL ANSWER:", error);
      showToast("Qo‘ng‘iroqqa ulanib bo‘lmadi");
      finishCall(true);
    }
  });

  // Ikkala tomon uchun: tarmoq nomzodlari (ICE)
  socket.on("call:ice", async data => {
    if (!data || data.callId !== currentCallId || !data.candidate) return;

    const pc = peerConnection;
    if (!pc || !pc.remoteDescription) {
      pendingRemoteIce.push(data.candidate);
      return;
    }

    try {
      await pc.addIceCandidate(data.candidate);
    } catch (error) {
      console.warn("KENZOX CALL ICE:", error);
    }
  });

  // Boshqa ochiq oynada (tab) qo'ng'iroq qabul qilindi yoki rad etildi
  socket.on("call:handled", data => {
    if (!data || data.callId !== currentCallId || !isIncomingRinging) return;
    finishCall(false);
    showToast("Qo‘ng‘iroq boshqa oynada boshqarildi");
  });

  socket.on("call:ended", data => {
    if (!data || data.callId !== currentCallId) return;

    const wasRinging = isIncomingRinging;
    const endedByMe = Boolean(data.by) && data.by === currentProfile?.id;

    const texts = {
      rejected: "Qo‘ng‘iroq rad etildi",
      cancelled: wasRinging ? "Qo‘ng‘iroq bekor qilindi" : "Qo‘ng‘iroq bekor qilindi",
      timeout: wasRinging ? "Qo‘ng‘iroq o‘tkazib yuborildi" : "Javob berilmadi",
      disconnected: "Ulanish uzildi",
      ended: "Qo‘ng‘iroq tugadi"
    };

    finishCall(false);
    if (!endedByMe) showToast(texts[data.reason] || "Qo‘ng‘iroq tugadi");
  });
}

async function loadConversations() {
  try {
    const result = await api("/api/conversations");

    result.conversations.forEach(item => {
      const chat = ensureChat(item.partner);
      chat.unread = item.unread;

      if (item.last) {
        chat.last = mapMessage(item.last);
        chat.lastAt = new Date(item.last.created_at).getTime();
      }
    });

    renderChats();
  } catch (error) {
    showToast(error.message || "Suhbatlarni yuklab bo‘lmadi");
    console.error("KENZOX CONVERSATIONS:", error);
  }
}

/* ===== Boshqa tugmalar ===== */

$("#themeBtn").addEventListener("click", () => {
  document.body.classList.toggle("light-theme");
  const isLight = document.body.classList.contains("light-theme");
  $("#themeBtn").textContent = isLight ? "☀" : "☾";

  try {
    localStorage.setItem("kenzox-theme", isLight ? "light" : "dark");
  } catch {}

  showToast(isLight ? "Yorug‘ rejim yoqildi" : "Qorong‘i rejim yoqildi");
});

try {
  if (localStorage.getItem("kenzox-theme") === "light") {
    document.body.classList.add("light-theme");
    $("#themeBtn").textContent = "☀";
  }
} catch {}

$("#menuBtn").addEventListener("click", () => {
  showToast("KENZOX menyusi");
});

$("#backBtn").addEventListener("click", () => {
  app.classList.remove("mobile-chat-open");
});

$("#infoBtn").addEventListener("click", () => {
  app.classList.toggle("details-open");
});

$("#closeInfoBtn").addEventListener("click", () => {
  app.classList.remove("details-open");
});

$("#profileBtn").addEventListener("click", openProfile);

$("#logoutBtn").addEventListener("click", async () => {
  try {
    await supabase.auth.signOut();
  } finally {
    window.location.replace("./auth.html");
  }
});

/* ===== Qo'ng'iroqlar (WebRTC) ===== */

const FALLBACK_ICE = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }
];

let localCallStream = null;
let remoteCallStream = null;
let peerConnection = null;
let currentCallId = null;
let currentCallType = "audio";
let currentCallPeerId = null;
let isCallActive = false;
let isIncomingRinging = false;
let incomingOffer = null;
let answerSent = false;
let pendingRemoteIce = []; // qarshi tomondan kelgan, lekin hali qo'llab bo'lmaydigan ICE lar
let outgoingIce = []; // server qo'ng'iroqni ro'yxatga olguncha ushlab turiladigan ICE lar
let callRegistered = false;
let callStartedAt = 0;
let callTimerId = null;
let disconnectTimer = null;
let callUI = null;
let ringer = null;

function makeCallId() {
  if (window.crypto?.randomUUID) return crypto.randomUUID();
  return "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
}

async function loadIceServers() {
  try {
    const result = await api("/api/ice");
    if (Array.isArray(result.iceServers) && result.iceServers.length) {
      return result.iceServers;
    }
  } catch (error) {
    console.error("KENZOX ICE:", error);
  }
  return FALLBACK_ICE;
}

/* ----- Jiringlash ovozi ----- */

function startRinger() {
  stopRinger();

  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;

    const ctx = new Ctx();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const beep = () => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = ctx.currentTime;

      osc.type = "sine";
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.85);
    };

    beep();
    ringer = { ctx, timer: setInterval(beep, 2000) };
  } catch {}
}

function stopRinger() {
  if (!ringer) return;
  clearInterval(ringer.timer);
  ringer.ctx.close().catch(() => {});
  ringer = null;
}

/* ----- Qo'ng'iroq oynasi ----- */

const callBtnStyle =
  "padding:12px 20px;border:0;border-radius:12px;color:white;font-weight:700;font-size:15px;cursor:pointer";

function ensureCallUI() {
  if (callUI) return callUI;

  callUI = document.createElement("div");
  callUI.id = "kenzoxCallUI";
  callUI.style.cssText =
    "position:fixed;inset:0;z-index:10000;display:none;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:20px;background:#050711f2;color:#f5f5ff;font-family:Arial,sans-serif";
  callUI.innerHTML = `
    <div id="kenzoxCallAvatar" style="width:96px;height:96px;border-radius:50%;background:#8b5cf6;display:grid;place-items:center;font-size:40px;font-weight:700"></div>
    <h2 id="kenzoxCallName" style="font-size:24px;margin:0;text-align:center"></h2>
    <p id="kenzoxCallStatus" style="color:#c9cbe0;margin:0;min-height:20px"></p>
    <div id="kenzoxVideoBox" style="display:none;position:relative;width:min(100%,720px)">
      <video id="kenzoxRemoteVideo" autoplay playsinline muted style="width:100%;max-height:62vh;border-radius:14px;background:#0b0d16;object-fit:cover"></video>
      <video id="kenzoxLocalVideo" autoplay playsinline muted style="position:absolute;right:10px;bottom:10px;width:28%;max-height:34%;border-radius:10px;background:#000;object-fit:cover;transform:scaleX(-1)"></video>
    </div>
    <audio id="kenzoxRemoteAudio" autoplay playsinline></audio>
    <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:8px">
      <button id="kenzoxCallMute" type="button" style="${callBtnStyle};background:#292d42">🎤 Mikrofon</button>
      <button id="kenzoxCallCam" type="button" style="${callBtnStyle};background:#292d42">📷 Kamera</button>
      <button id="kenzoxCallAccept" type="button" style="${callBtnStyle};background:#22c55e">Javob berish</button>
      <button id="kenzoxCallEnd" type="button" style="${callBtnStyle};background:#ef4444">Tugatish</button>
    </div>`;
  document.body.appendChild(callUI);

  callUI.querySelector("#kenzoxCallAccept").addEventListener("click", acceptCall);
  callUI.querySelector("#kenzoxCallEnd").addEventListener("click", () => finishCall(true));

  callUI.querySelector("#kenzoxCallMute").addEventListener("click", () => {
    const enabled = toggleLocalTrack("audio");
    if (enabled === null) return;
    callUI.querySelector("#kenzoxCallMute").textContent = enabled
      ? "🎤 Mikrofon"
      : "🔇 Ovoz o‘chiq";
  });

  callUI.querySelector("#kenzoxCallCam").addEventListener("click", () => {
    const enabled = toggleLocalTrack("video");
    if (enabled === null) return;
    callUI.querySelector("#kenzoxCallCam").textContent = enabled
      ? "📷 Kamera"
      : "🚫 Kamera o‘chiq";
  });

  return callUI;
}

function toggleLocalTrack(kind) {
  if (!localCallStream) return null;

  const tracks =
    kind === "audio" ? localCallStream.getAudioTracks() : localCallStream.getVideoTracks();
  if (!tracks.length) return null;

  const enabled = !tracks[0].enabled;
  tracks.forEach(track => {
    track.enabled = enabled;
  });
  return enabled;
}

function refreshCallButtons() {
  if (!callUI) return;

  const ringing = isIncomingRinging;
  const video = currentCallType === "video";

  callUI.querySelector("#kenzoxCallAccept").style.display = ringing ? "block" : "none";
  callUI.querySelector("#kenzoxCallMute").style.display = ringing ? "none" : "block";
  callUI.querySelector("#kenzoxCallCam").style.display = !ringing && video ? "block" : "none";
  callUI.querySelector("#kenzoxCallEnd").textContent = ringing ? "Rad etish" : "Tugatish";
}

function showCallUI({ name, status, kind, incoming }) {
  const ui = ensureCallUI();
  const video = kind === "video";

  ui.querySelector("#kenzoxCallName").textContent = name;
  ui.querySelector("#kenzoxCallAvatar").textContent = (name || "?").charAt(0).toUpperCase();
  ui.querySelector("#kenzoxCallAvatar").style.display = video ? "none" : "grid";
  ui.querySelector("#kenzoxCallStatus").textContent = status;
  ui.querySelector("#kenzoxVideoBox").style.display = video ? "block" : "none";
  ui.querySelector("#kenzoxCallMute").textContent = "🎤 Mikrofon";
  ui.querySelector("#kenzoxCallCam").textContent = "📷 Kamera";

  isIncomingRinging = Boolean(incoming);
  refreshCallButtons();
  ui.style.display = "flex";
}

function setCallStatus(text) {
  if (!callUI) return;
  callUI.querySelector("#kenzoxCallStatus").textContent = text;
}

function hideCallUI() {
  if (!callUI) return;

  callUI.style.display = "none";
  callUI.querySelector("#kenzoxRemoteVideo").srcObject = null;
  callUI.querySelector("#kenzoxLocalVideo").srcObject = null;
  callUI.querySelector("#kenzoxRemoteAudio").srcObject = null;
}

function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function onCallConnected() {
  if (isCallActive) return;

  isCallActive = true;
  callStartedAt = Date.now();
  setCallStatus("00:00");

  clearInterval(callTimerId);
  callTimerId = setInterval(() => {
    if (isCallActive) setCallStatus(formatDuration(Date.now() - callStartedAt));
  }, 1000);
}

/* ----- Media va PeerConnection ----- */

function mediaErrorText(error) {
  switch (error?.name) {
    case "InsecureContext":
      return "Qo‘ng‘iroq faqat HTTPS yoki localhost orqali ishlaydi";
    case "NotAllowedError":
    case "SecurityError":
      return "Mikrofon yoki kameraga ruxsat bering";
    case "NotFoundError":
    case "OverconstrainedError":
      return "Kerakli kamera yoki mikrofon topilmadi";
    case "NotReadableError":
      return "Kamera yoki mikrofon boshqa dastur tomonidan band";
    default:
      return "Mikrofon yoki kamerani ishga tushirib bo‘lmadi";
  }
}

async function getCallMedia(kind) {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    const error = new Error("Secure context kerak");
    error.name = "InsecureContext";
    throw error;
  }

  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    },
    video:
      kind === "video"
        ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" }
        : false
  });
}

function createPeerConnection(iceServers, callId) {
  const pc = new RTCPeerConnection({ iceServers });

  pc.onicecandidate = event => {
    if (!event.candidate || pc !== peerConnection) return;

    const candidate = event.candidate.toJSON ? event.candidate.toJSON() : event.candidate;

    // Server qo'ng'iroqni ro'yxatga olmaguncha yuborilgan ICE lar yo'qolib ketadi,
    // shuning uchun ularni ushlab turamiz.
    if (!callRegistered) {
      outgoingIce.push(candidate);
      return;
    }

    if (socket?.connected) socket.emit("call:ice", { callId, candidate });
  };

  pc.ontrack = event => {
    if (event.streams && event.streams[0]) {
      remoteCallStream = event.streams[0];
    } else {
      if (!remoteCallStream) remoteCallStream = new MediaStream();
      remoteCallStream.addTrack(event.track);
    }

    if (!callUI) return;

    const audio = callUI.querySelector("#kenzoxRemoteAudio");
    const video = callUI.querySelector("#kenzoxRemoteVideo");

    audio.srcObject = remoteCallStream;
    video.srcObject = remoteCallStream;

    audio.play().catch(() => {});
    video.play().catch(() => {});
  };

  pc.onconnectionstatechange = () => {
    if (pc !== peerConnection) return;

    const state = pc.connectionState;

    if (state === "connected") {
      clearTimeout(disconnectTimer);
      onCallConnected();
    } else if (state === "disconnected") {
      setCallStatus("Ulanish beqaror...");
      clearTimeout(disconnectTimer);
      disconnectTimer = setTimeout(() => {
        if (peerConnection === pc && pc.connectionState !== "connected") {
          showToast("Ulanish uzildi");
          finishCall(true);
        }
      }, 8000);
    } else if (state === "failed") {
      showToast("Ulanib bo‘lmadi. Internetni tekshiring");
      finishCall(true);
    }
  };

  return pc;
}

function attachLocalMedia(pc) {
  localCallStream.getTracks().forEach(track => pc.addTrack(track, localCallStream));

  if (callUI) callUI.querySelector("#kenzoxLocalVideo").srcObject = localCallStream;
}

async function flushRemoteIce() {
  const pc = peerConnection;
  if (!pc || !pc.remoteDescription) return;

  const list = pendingRemoteIce;
  pendingRemoteIce = [];

  for (const candidate of list) {
    try {
      await pc.addIceCandidate(candidate);
    } catch (error) {
      console.warn("KENZOX ICE FLUSH:", error);
    }
  }
}

function flushOutgoingIce(callId) {
  const list = outgoingIce;
  outgoingIce = [];

  if (!socket?.connected) return;

  for (const candidate of list) {
    socket.emit("call:ice", { callId, candidate });
  }
}

/* ----- Chiquvchi qo'ng'iroq ----- */

function emitInvite(payload) {
  return new Promise(resolve => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ ok: false, reason: "timeout" });
    }, 10000);

    socket.emit("call:invite", payload, ack => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

function inviteErrorText(reason) {
  switch (reason) {
    case "offline":
      return "Foydalanuvchi hozir onlayn emas";
    case "busy":
      return "Foydalanuvchi band";
    case "self_busy":
      return "Siz allaqachon qo‘ng‘iroqdasiz";
    case "too_fast":
      return "Juda tez-tez qo‘ng‘iroq qilyapsiz. Biroz kuting";
    case "timeout":
      return "Server javob bermadi";
    default:
      return "Qo‘ng‘iroqni boshlab bo‘lmadi";
  }
}

async function startCall(kind = "audio") {
  const chat = getActiveChat();

  if (!chat) {
    showToast("Avval suhbatni tanlang");
    return;
  }

  if (!socket || !socket.connected) {
    showToast("Serverga ulanish yo‘q. Qayta urinib ko‘ring.");
    return;
  }

  if (currentCallId) {
    showToast("Siz allaqachon qo‘ng‘iroqdasiz");
    return;
  }

  const callId = makeCallId();

  currentCallId = callId;
  currentCallType = kind;
  currentCallPeerId = chat.id;
  isCallActive = false;
  answerSent = false;
  callRegistered = false;
  incomingOffer = null;
  pendingRemoteIce = [];
  outgoingIce = [];

  showCallUI({
    name: chat.name,
    status: "Mikrofon tayyorlanmoqda...",
    kind,
    incoming: false
  });

  try {
    const stream = await getCallMedia(kind);

    // Ruxsat kutilayotganda foydalanuvchi bekor qilgan bo'lishi mumkin
    if (currentCallId !== callId) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    localCallStream = stream;

    const iceServers = await loadIceServers();
    if (currentCallId !== callId) return;

    const pc = createPeerConnection(iceServers, callId);
    peerConnection = pc;
    attachLocalMedia(pc);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    if (currentCallId !== callId) return;

    setCallStatus("Qo‘ng‘iroq qilinmoqda...");

    const ack = await emitInvite({
      callId,
      to: chat.id,
      kind,
      offer: { type: offer.type, sdp: offer.sdp }
    });

    if (currentCallId !== callId) {
      // Biz kutayotgan paytda bekor qilgan edik, serverda esa qo'ng'iroq ochilgan bo'lishi mumkin
      if (ack?.ok && socket?.connected) socket.emit("call:end", { callId });
      return;
    }

    if (!ack?.ok) {
      showToast(inviteErrorText(ack?.reason));
      finishCall(false);
      return;
    }

    callRegistered = true;
    flushOutgoingIce(callId);
  } catch (error) {
    console.error("KENZOX CALL START:", error);
    if (currentCallId === callId) {
      showToast(mediaErrorText(error));
      finishCall(false);
    }
  }
}

/* ----- Kiruvchi qo'ng'iroq ----- */

function handleIncomingCall(data) {
  const from = data?.from;

  if (!data?.callId || !from?.id || !data.offer?.sdp) return;
  if (currentCallId) return; // band (server ham buni oldindan tekshiradi)

  ensureChat(from);
  renderChats();

  const kind = data.kind === "video" ? "video" : "audio";
  const name = from.display_name || from.username || "KENZOX foydalanuvchisi";

  currentCallId = data.callId;
  currentCallType = kind;
  currentCallPeerId = from.id;
  isCallActive = false;
  answerSent = false;
  callRegistered = false;
  incomingOffer = data.offer;
  pendingRemoteIce = [];
  outgoingIce = [];

  showCallUI({
    name,
    status: kind === "video" ? "Videoqo‘ng‘iroq kelmoqda..." : "Qo‘ng‘iroq kelmoqda...",
    kind,
    incoming: true
  });

  startRinger();
}

async function acceptCall() {
  if (!isIncomingRinging || !currentCallId || !incomingOffer) return;

  const callId = currentCallId;
  const offer = incomingOffer;
  const kind = currentCallType;

  isIncomingRinging = false;
  incomingOffer = null;
  stopRinger();
  refreshCallButtons();
  setCallStatus("Ulanmoqda...");

  try {
    const stream = await getCallMedia(kind);

    if (currentCallId !== callId) {
      stream.getTracks().forEach(track => track.stop());
      return;
    }
    localCallStream = stream;

    const iceServers = await loadIceServers();
    if (currentCallId !== callId) return;

    const pc = createPeerConnection(iceServers, callId);
    peerConnection = pc;
    attachLocalMedia(pc);

    await pc.setRemoteDescription({ type: "offer", sdp: offer.sdp });
    await flushRemoteIce();

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    if (currentCallId !== callId) return;

    socket.emit("call:answer", {
      callId,
      answer: { type: answer.type, sdp: answer.sdp }
    });

    answerSent = true;
    callRegistered = true;
    flushOutgoingIce(callId);
  } catch (error) {
    console.error("KENZOX CALL ACCEPT:", error);

    if (currentCallId === callId) {
      showToast(mediaErrorText(error));

      if (socket?.connected) {
        socket.emit(answerSent ? "call:end" : "call:reject", { callId });
      }
      finishCall(false);
    }
  }
}

/* ----- Tugatish va tozalash ----- */

function finishCall(notify = true) {
  const callId = currentCallId;

  if (notify && callId && socket?.connected) {
    // Hali javob berilmagan kiruvchi qo'ng'iroq rad etiladi, qolganlari tugatiladi
    socket.emit(isIncomingRinging ? "call:reject" : "call:end", { callId });
  }

  stopRinger();
  clearInterval(callTimerId);
  clearTimeout(disconnectTimer);
  callTimerId = null;
  disconnectTimer = null;

  if (localCallStream) {
    localCallStream.getTracks().forEach(track => track.stop());
    localCallStream = null;
  }

  if (remoteCallStream) {
    remoteCallStream.getTracks().forEach(track => track.stop());
    remoteCallStream = null;
  }

  if (peerConnection) {
    peerConnection.onicecandidate = null;
    peerConnection.ontrack = null;
    peerConnection.onconnectionstatechange = null;
    peerConnection.close();
    peerConnection = null;
  }

  currentCallId = null;
  currentCallPeerId = null;
  currentCallType = "audio";
  isCallActive = false;
  isIncomingRinging = false;
  incomingOffer = null;
  answerSent = false;
  callRegistered = false;
  pendingRemoteIce = [];
  outgoingIce = [];

  hideCallUI();
}

window.addEventListener("pagehide", () => {
  if (currentCallId) finishCall(true);
});

$("#callBtn").addEventListener("click", async () => {
  const video = window.confirm(
    "Videoqo‘ng‘iroq uchun OK ni bosing.\nFaqat ovozli qo‘ng‘iroq uchun Cancel ni bosing."
  );

  await startCall(video ? "video" : "audio");
});

$("#micBtn").addEventListener("click", () => {
  showToast("Ovozli xabar yozish funksiyasi hali ulanmagan");
});

$("#attachBtn").addEventListener("click", () => {
  showToast("Fayl yuborish keyingi bosqichda ulanadi");
});

$("#clearChatBtn").addEventListener("click", () => {
  showToast("Suhbatni tozalash keyingi bosqichda ulanadi");
});

$("#searchChatBtn").addEventListener("click", () => {
  $("#chatSearch").classList.remove("hidden");
  $("#chatSearchInput").focus();
});

$("#closeSearchBtn").addEventListener("click", () => {
  $("#chatSearch").classList.add("hidden");
  $("#chatSearchInput").value = "";
  renderMessages();
});

$("#detailSearchBtn").addEventListener("click", () => {
  app.classList.remove("details-open");
  $("#chatSearch").classList.remove("hidden");
  $("#chatSearchInput").focus();
});

$("#chatSearchInput").addEventListener("input", () => {
  const query = $("#chatSearchInput").value.trim().toLowerCase();
  const chat = getActiveChat();

  if (!chat || !chat.loaded) return;

  const found = chat.messages.filter(
    message => !query || message.text.toLowerCase().includes(query)
  );

  if (!found.length) {
    renderEmptyState("Hech narsa topilmadi", "");
    return;
  }

  messagesEl.replaceChildren(...found.map(createMessageElement));
});

$("#emojiBtn").addEventListener("click", () => {
  $("#emojiPicker").classList.toggle("hidden");
});

$("#emojiPicker").addEventListener("click", event => {
  const button = event.target.closest("button");
  if (!button) return;

  messageInput.value += button.textContent;
  messageInput.focus();
});

document.addEventListener("click", event => {
  if (!event.target.closest("#emojiPicker") && !event.target.closest("#emojiBtn")) {
    $("#emojiPicker").classList.add("hidden");
  }
});

document.addEventListener("keydown", event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }

  if (event.key === "Escape") {
    if (profileModal) profileModal.style.display = "none";
    closeNewChat();
    $("#emojiPicker").classList.add("hidden");
    $("#chatSearch").classList.add("hidden");
    app.classList.remove("details-open");
  }
});

/* ===== Ishga tushirish ===== */

async function init() {
  renderMessages();
  renderChats();

  await loadProfile();
  if (!currentProfile) return;

  await loadConversations();
  connectSocket();
}

init();