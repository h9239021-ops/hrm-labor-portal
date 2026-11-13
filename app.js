/* HRM 노무관리파트 업무포털 */
(function(){
  "use strict";
  var C = window.SUPABASE_CONFIG || {};
  var sb = window.supabase.createClient(C.url, C.anonKey, { auth: { storageKey: "hrm-portal-auth", persistSession: true, autoRefreshToken: true } });
  var DASHBOARD_URL = "https://h9239021-ops.github.io/labor-compliance-ledger/";
  var app = document.getElementById("app");
  var me = null;               // { email, name, team, perms }
  var S = { staff: [], org: [], events: [], faq: [], pages: [], recs: {}, loaded: false };
  var LV = { none: 0, read: 1, write: 2, edit: 3, manage: 4 };
  var LV_LABEL = { none: "없음", read: "읽기", write: "쓰기", edit: "편집", manage: "관리" };
  var UNITS = [["MS","MS"],["HQ","HQ"],["CCE","CC CTO(E)"],["CCD","CC CTO(D)"],["DW","DW"],["EN","EN"],["ST","ST"],["PA","PA"],["CF","CF"],["MT","MT"]];
  var SPECIAL_SUB = "사업부별 담당";
  var CATS = [
    { id: "att", name: "근태", ic: "🕒", desc: "선택적 근로시간제 운영, 분기 근태 미준수 관리, 시간외근로·보상휴가",
      items: ["근태 운영", "(분기)근태 미준수 관리", "시간외근로"],
      menus: [["manual", "근태관리 매뉴얼"], ["violations", "근태 위반자 관리"], ["worktypes", "근무형태 현황"]] },
    { id: "leave", name: "휴가", ic: "🌴", desc: "연차·연차 촉진, 리프레쉬·보상·경조휴가, 퇴사자 연차 정산",
      items: ["연차/휴가", "연차 촉진", "리프레쉬 휴가"], menus: [["manual", "휴가 매뉴얼"]], src: ["연차/휴가", "리프레쉬 휴가"] },
    { id: "absence", name: "휴직", ic: "🍼", desc: "모성보호, 육아·질병 휴직, 복직 관리",
      items: ["모성보호", "휴직/복직"], menus: [["main", "휴직"]], src: ["모성보호/휴직/복직"] },
    { id: "welfare", name: "복리후생", ic: "🎁", desc: "경조사, 건강검진, 생일·출산·명절 선물, 복지몰",
      items: ["경조사", "건강검진", "선물·상품권", "복지몰"], menus: [["main", "복리후생"]], src: ["경조사", "건강검진", "공단건강검진(EDI)", "생일·출산·명절 선물", "복지몰"] },
    { id: "case", name: "사건", ic: "⚖️", desc: "직장 내 괴롭힘·성희롱 조사와 조치, 인사위원회 운영",
      items: ["괴롭힘/성희롱", "인사위원회"], menus: [["main", "사건"]], src: ["인사위원회", "노무 검토 의견"] },
    { id: "council", name: "노사협의회", ic: "🤝", desc: "분기 노사협의회 운영과 안건 정리",
      items: ["협의회 운영", "안건 정리"], menus: [["main", "노사협의회"]], src: ["노사협의회", "노사협의회 안건 정리 DB"] },
    { id: "insp", name: "근로감독", ic: "🛡️", desc: "근로감독 대시보드: 대응 매뉴얼, 리스크 관리대장, 감독 대응(자료 취합)",
      items: ["대응 매뉴얼", "리스크 관리대장", "감독 대응"], menus: [["main", "근로감독 대시보드"]], link: DASHBOARD_URL },
    { id: "etc", name: "기타", ic: "📁", desc: "산업안전보건, 장애인고용부담금, 노무 자문, 사업부 특이사항",
      items: ["산업안전보건", "장애인고용", "노무 자문"], menus: [["main", "기타"]], src: ["산업안전보건", "사업부 특이사항", "업무 관련 링크", "MIS 결재선 변경 방법", "전적"] }
  ];
  var HOME_KEYS = [["home.org", "업무분장표"], ["home.calendar", "연간 계획 캘린더"], ["home.faq", "FAQ"]];
  var DOW = ["일", "월", "화", "수", "목", "금", "토"];

  /* ---------- utils ---------- */
  function esc(s){ return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function $(s, r){ return (r || document).querySelector(s); }
  function $all(s, r){ return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function pad(n){ return (n < 10 ? "0" : "") + n; }
  function ymd(d){ return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function parseD(s){ if (!s) return null; var p = String(s).slice(0, 10).split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function todayStr(){ return ymd(new Date()); }
  function md(s){ var d = parseD(s); return d ? pad(d.getMonth() + 1) + "/" + pad(d.getDate()) + " (" + DOW[d.getDay()] + ")" : ""; }
  function toast(msg){ var t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(function(){ t.remove(); }, 2200); }
  function level(key){ if (!me) return 0; var p = me.perms || {}; if (LV[p.admin] >= 4) return 4; return LV[p[key]] || 0; }
  function can(key, need){ return level(key) >= LV[need]; }
  function isAdmin(){ return !!me && LV[(me.perms || {}).admin] >= 4; }
  function catVisible(c){ if (isAdmin()) return true; return c.menus.some(function(m){ return level(c.id + "." + m[0]) >= 1; }); }
  function catById(id){ for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return null; }
  function staffIdx(name){ for (var i = 0; i < S.staff.length; i++) if (S.staff[i].name === name) return i; return -1; }
  function chip(name){
    if (!name) return '<span class="chip empty">-</span>';
    var i = staffIdx(name);
    return '<span class="chip ' + (i >= 0 ? "p" + (i % 6) : "") + '">' + esc(name) + '</span>';
  }
  function logp(area, action, detail){ try { sb.from("portal_log").insert({ email: me.email, area: area, action: action, detail: String(detail || "").slice(0, 300) }).then(function(){}); } catch(e){} }
  function errMsg(r){ return (r && r.error && r.error.message) || "권한이 없거나 저장되지 않았습니다."; }

  /* ---------- modal ---------- */
  function showModal(html, size){
    closeModal();
    var root = document.createElement("div"); root.id = "modalRoot";
    root.innerHTML = '<div class="modal-backdrop"><div class="modal ' + (size || "") + '" role="dialog" aria-modal="true">' + html + '</div></div>';
    document.body.appendChild(root);
    root.firstChild.addEventListener("mousedown", function(e){ if (e.target === root.firstChild && !root.dataset.dirty) closeModal(); });
    return root.querySelector(".modal");
  }
  function closeModal(){ var r = document.getElementById("modalRoot"); if (r) r.remove(); }
  document.addEventListener("keydown", function(e){ if (e.key === "Escape"){ var r = document.getElementById("modalRoot"); if (r && !r.dataset.dirty) closeModal(); } });
  function promptModal(title, hint, value, multiline, onOk){
    var m = showModal('<h3>' + esc(title) + '</h3>' + (hint ? '<p class="hint">' + esc(hint) + '</p>' : '') +
      (multiline ? '<textarea id="pmIn" rows="5">' + esc(value || "") + '</textarea>' : '<input id="pmIn" value="' + esc(value || "") + '">') +
      '<div class="modal-actions"><button class="btn ghost" id="pmNo">취소</button><button class="btn primary" id="pmOk">확인</button></div>', "mid");
    var i = $("#pmIn", m); i.focus();
    $("#pmNo", m).onclick = closeModal;
    $("#pmOk", m).onclick = function(){ var v = i.value; closeModal(); onOk(v); };
  }

  /* ---------- sanitizer + WYSIWYG editor ---------- */
  function cleanHtml(html){
    var t = document.createElement("template"); t.innerHTML = html || "";
    t.content.querySelectorAll("script,style,iframe,object,embed,form,input,textarea,button,select").forEach(function(n){ n.remove(); });
    t.content.querySelectorAll("*").forEach(function(n){
      Array.prototype.slice.call(n.attributes).forEach(function(a){
        var nm = a.name.toLowerCase();
        if (nm.indexOf("on") === 0 || nm === "contenteditable" || (nm === "style" && /expression|url\(/i.test(a.value))) n.removeAttribute(a.name);
        if ((nm === "href" || nm === "src") && /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
      });
      if (n.tagName === "A" && /^https?:/i.test(n.getAttribute("href") || "")){ n.setAttribute("target", "_blank"); n.setAttribute("rel", "noopener"); }
    });
    return t.innerHTML.trim();
  }
  var ED_BTNS = [["bold","<b>굵게</b>"],["red",'<span style="color:var(--danger-700)">빨강</span>'],["blue",'<span style="color:var(--accent-700)">파랑</span>'],["plain","색 빼기"],["|"],
    ["h2","제목"],["h3","소제목"],["p","본문"],["|"],["ul","• 목록"],["ol","1. 목록"],["|"],["link","링크"],["unlink","링크 빼기"],["note","안내 박스"],["table","표 넣기"],["rowAdd","행 추가"],["rowDel","행 삭제"],["|"],["undo","↶"],["redo","↷"],["grow"],["html","HTML로 보기"]];
  function editorBar(){ return '<div class="ed-bar" id="edBar">' + ED_BTNS.map(function(b){ if (b[0] === "|") return '<span class="sep"></span>'; if (b[0] === "grow") return '<span class="grow"></span>'; return '<button type="button" data-ed="' + b[0] + '">' + b[1] + '</button>'; }).join("") + '</div>'; }
  // host contains #edBar, #edBody (contenteditable) and #edHtml (textarea). returns { getHtml, dirty }
  function wireEditor(host, onDirty){
    var body = $("#edBody", host), box = $("#edHtml", host), htmlMode = false, st = { dirty: false };
    function dirty(){ st.dirty = true; if (onDirty) onDirty(); }
    try { document.execCommand("styleWithCSS", false, false); document.execCommand("defaultParagraphSeparator", false, "p"); } catch(e){}
    body.addEventListener("input", dirty); box.addEventListener("input", dirty);
    body.addEventListener("click", function(e){ var a = e.target.closest && e.target.closest("a"); if (a) e.preventDefault(); var s = e.target.closest && e.target.closest("summary"); if (s) e.preventDefault(); });
    function rng(){ var s = window.getSelection(); return s && s.rangeCount ? s.getRangeAt(0) : null; }
    function inBody(n){ return n && (n === body || body.contains(n)); }
    function wrap(cls){ var r = rng(); if (!r || r.collapsed || !inBody(r.commonAncestorContainer)){ alert("먼저 바꿀 글자를 선택하세요."); return; } var sp = document.createElement("span"); sp.className = cls; sp.appendChild(r.extractContents()); r.insertNode(sp); dirty(); }
    function unwrap(){ var r = rng(); if (!r) return; var n = r.commonAncestorContainer; n = n.nodeType === 3 ? n.parentNode : n; var sp = n.closest && n.closest("span.red,span.blue"); if (sp && inBody(sp)){ while (sp.firstChild) sp.parentNode.insertBefore(sp.firstChild, sp); sp.remove(); dirty(); } }
    function row(){ var r = rng(); if (!r) return null; var n = r.startContainer; n = n.nodeType === 3 ? n.parentNode : n; var tr = n.closest && n.closest("tr"); return tr && inBody(tr) ? tr : null; }
    var A = {
      bold: function(){ document.execCommand("bold"); }, red: function(){ wrap("red"); }, blue: function(){ wrap("blue"); }, plain: unwrap,
      h2: function(){ document.execCommand("formatBlock", false, "h2"); }, h3: function(){ document.execCommand("formatBlock", false, "h3"); }, p: function(){ document.execCommand("formatBlock", false, "p"); },
      ul: function(){ document.execCommand("insertUnorderedList"); }, ol: function(){ document.execCommand("insertOrderedList"); },
      link: function(){ var r = rng(); if (!r || r.collapsed){ alert("링크를 걸 글자를 먼저 선택하세요."); return; } var saved = r.cloneRange();
        linkPicker(function(u){ body.focus(); var s = window.getSelection(); s.removeAllRanges(); s.addRange(saved); document.execCommand("createLink", false, u.trim()); dirty(); }); },
      unlink: function(){ document.execCommand("unlink"); },
      note: function(){ document.execCommand("insertHTML", false, '<div class="note info"><span class="nt">안내</span>내용을 입력하세요.</div><p><br></p>'); },
      table: function(){ document.execCommand("insertHTML", false, '<div class="tbl-w"><table class="t"><thead><tr><th>항목</th><th>내용</th></tr></thead><tbody><tr><td><br></td><td><br></td></tr></tbody></table></div><p><br></p>'); },
      rowAdd: function(){ var tr = row(); if (!tr){ alert("표 안의 칸을 먼저 클릭하세요."); return; } var n = tr.cloneNode(true); $all("td,th", n).forEach(function(c){ c.innerHTML = "<br>"; }); if (tr.parentNode.tagName === "THEAD"){ var tb = tr.closest("table").querySelector("tbody"); n = document.createElement("tr"); $all("th", tr).forEach(function(){ var td = document.createElement("td"); td.innerHTML = "<br>"; n.appendChild(td); }); tb.insertBefore(n, tb.firstChild); } else tr.parentNode.insertBefore(n, tr.nextSibling); dirty(); },
      rowDel: function(){ var tr = row(); if (!tr){ alert("지울 행의 칸을 먼저 클릭하세요."); return; } if (tr.parentNode.tagName === "THEAD"){ alert("머리글 행은 지울 수 없습니다."); return; } if (confirm("이 행을 삭제할까요?")){ tr.remove(); dirty(); } },
      undo: function(){ document.execCommand("undo"); }, redo: function(){ document.execCommand("redo"); },
      html: function(){ htmlMode = !htmlMode;
        if (htmlMode){ box.value = cleanHtml(body.innerHTML); body.style.display = "none"; box.style.display = "block"; }
        else { body.innerHTML = cleanHtml(box.value); box.style.display = "none"; body.style.display = ""; }
        $all("[data-ed]", host).forEach(function(b){ if (b.getAttribute("data-ed") !== "html") b.disabled = htmlMode; });
        $('[data-ed="html"]', host).textContent = htmlMode ? "화면으로 보기" : "HTML로 보기"; }
    };
    $all("[data-ed]", host).forEach(function(b){
      b.addEventListener("mousedown", function(e){ e.preventDefault(); });
      b.addEventListener("click", function(){ var k = b.getAttribute("data-ed"); if (k !== "html") body.focus(); if (A[k]) A[k](); });
    });
    st.getHtml = function(){ return cleanHtml(htmlMode ? box.value : body.innerHTML); };
    return st;
  }

  /* ---------- auth ---------- */
  function renderLogin(msg){
    app.innerHTML = '<div class="auth-screen"><div class="auth-card">' +
      '<img class="auth-logo" src="' + (window.LOGO_SRC || "") + '" alt="ConnectWave">' +
      '<h2 style="font-size:19px;margin-bottom:4px">HRM 노무관리파트 업무포털</h2>' +
      '<p class="hint" style="font-size:13px;margin:0 0 16px">회사 이메일 계정으로 로그인하세요.</p>' +
      (msg ? '<div class="banner danger" style="margin:0 0 12px">' + esc(msg) + '</div>' : '') +
      '<form id="lf"><input type="email" name="email" placeholder="이메일" autocomplete="username" required>' +
      '<input type="password" name="pw" placeholder="비밀번호" autocomplete="current-password" required>' +
      '<button class="btn primary" style="width:100%;justify-content:center" type="submit">로그인</button></form>' +
      '<p class="hint" style="font-size:12px;margin-top:14px">계정·권한은 노무관리파트 포털 관리자에게 요청하세요.</p></div></div>';
    $("#lf").addEventListener("submit", async function(e){
      e.preventDefault(); var fd = new FormData(e.target), b = $("button", e.target); b.disabled = true; b.textContent = "로그인 중…";
      var r = await sb.auth.signInWithPassword({ email: String(fd.get("email")).trim(), password: fd.get("pw") });
      if (r.error){ renderLogin(/Invalid login/i.test(r.error.message) ? "이메일 또는 비밀번호가 맞지 않습니다." : r.error.message); return; }
      boot();
    });
  }
  async function boot(){
    var s = await sb.auth.getSession();
    var sess = s.data && s.data.session;
    if (!sess){ renderLogin(); return; }
    var email = String(sess.user.email || "").toLowerCase();
    var a = await sb.from("portal_access").select("*").eq("email", email).maybeSingle();
    if (!a.data){
      // also try case-insensitive match
      var a2 = await sb.from("portal_access").select("*").ilike("email", email);
      a = { data: a2.data && a2.data[0] };
    }
    if (!a.data){
      app.innerHTML = '<div class="auth-screen"><div class="auth-card"><img class="auth-logo" src="' + (window.LOGO_SRC || "") + '" alt="">' +
        '<h2 style="font-size:18px">포털 접근 권한이 없습니다</h2><p class="hint" style="font-size:13px">' + esc(email) + ' 계정은 아직 업무포털에 등록되지 않았습니다. 노무관리파트 포털 관리자에게 권한을 요청하세요.</p>' +
        '<button class="btn" id="lo">로그아웃</button></div></div>';
      $("#lo").onclick = async function(){ await sb.auth.signOut(); renderLogin(); };
      return;
    }
    me = { email: email, name: a.data.name || email, team: a.data.team || "", perms: a.data.perms || {} };
    await loadAll();
    render();
  }
  async function loadAll(){
    var q = [
      sb.from("portal_staff").select("*").order("sort"),
      can("home.org", "read") ? sb.from("portal_org").select("*").order("sort") : null,
      can("home.calendar", "read") ? sb.from("portal_events").select("*").order("start_date") : null,
      can("home.faq", "read") ? sb.from("portal_faq").select("*").order("sort") : null,
      sb.from("portal_pages").select("id,cat,menu,grp,grp_sort,sort,parent,title,lead,updated_at,updated_by").order("grp_sort").order("sort")
    ];
    var r = await Promise.all(q.map(function(x){ return x || Promise.resolve({ data: [] }); }));
    S.staff = (r[0].data || []).filter(function(x){ return x.active !== false; });
    S.org = r[1].data || []; S.events = r[2].data || []; S.faq = r[3].data || []; S.pages = r[4].data || [];
    S.loaded = true;
  }

  /* ---------- routing / shell ---------- */
  function parseHash(){ var h = (location.hash || "#/").replace(/^#\/?/, ""); var p = h.split("/").map(decodeURIComponent); return p; }
  window.addEventListener("hashchange", function(){
    if (window.__editDirty && !confirm("수정 중인 내용을 저장하지 않고 이동할까요?")){ history.back(); return; }
    window.__editDirty = false; render();
  });
  // area: null = portal home; otherwise the title of the inner page (category, FAQ, 권한 관리)
  function shell(inner, area){
    return '<header class="hd"><div class="hd-in">' +
      '<a class="brand" href="#/"><img src="' + (window.LOGO_SRC || "") + '" alt="ConnectWave"><span class="sep"></span><span class="nm">HRM 노무관리파트 업무포털</span></a>' +
      (area ? '<span class="hd-area">› ' + esc(area) + '</span><a class="btn sm" href="#/" style="margin-left:8px">🏠 업무포털 홈</a>' : '') +
      '<div class="hd-r">' + (isAdmin() && area !== "권한 관리" ? '<a class="btn sm ghost" href="#/admin">권한 관리</a>' : '') +
      '<span class="who" title="' + esc(me.email) + '">' + esc(me.name) + (me.team ? " · " + esc(me.team) : "") + '</span><button class="btn sm" id="logout">로그아웃</button></div>' +
      '</div></header>' + inner;
  }
  function wireShell(){ var b = $("#logout"); if (b) b.onclick = async function(){ await sb.auth.signOut(); me = null; location.hash = "#/"; renderLogin(); }; }
  function render(){
    if (!me) return;
    window.onscroll = null;
    closeModal();
    var p = parseHash();
    if (p[0] === "c" && p[1]){
      var c = catById(p[1]);
      if (!c || !catVisible(c)){ location.hash = "#/"; return; }
      renderCategory(c, p[2], p[3]);
    } else if (p[0] === "admin" && isAdmin()){ renderAdmin(); }
    else if (p[0] === "faq" && can("home.faq", "read")){ renderFaqPage(p[1]); }
    else renderHome();
    wireShell();
  }

  /* =====================================================================
     HOME
     ===================================================================== */
  var calY, calM, calSel = null, faqCat = "전체", orgQuery = "";
  function renderHome(){
    var now = new Date(); if (calY == null){ calY = now.getFullYear(); calM = now.getMonth(); }
    var h = '<main class="home">' +
      '<div class="home-hero"><div><h1>HRM 노무관리파트 업무포털</h1><div class="sub">' + now.getFullYear() + "년 " + (now.getMonth() + 1) + "월 " + now.getDate() + "일 (" + DOW[now.getDay()] + ') · ' + esc(me.name) + '님, 안녕하세요.</div></div></div>';
    if (can("home.org", "read")) h += '<section class="panel" id="orgSec"></section>';
    var showCal = can("home.calendar", "read"), showFaq = can("home.faq", "read");
    if (showCal || showFaq){
      h += '<div class="trio">' +
        (showCal ? '<section class="card2" id="calCard"></section><section class="card2" id="todoCard"></section>' : '') +
        (showFaq ? '<section class="card2 faqc" id="faqCard"' + (showCal ? '' : ' style="grid-column:1/-1"') + '></section>' : '') + '</div>';
    }
    var cats = CATS.filter(catVisible);
    h += '<section style="margin-top:26px"><div class="sec-h"><h2>업무 카테고리</h2></div><div class="cats">' +
      (cats.length ? cats.map(catCard).join("") : '<p class="hint">열람 가능한 카테고리가 없습니다.</p>') + '</div></section>';
    h += '<div class="footer-note">HRM팀 노무관리파트 · 권한이 없는 메뉴와 카테고리는 표시되지 않습니다.</div></main>';
    app.innerHTML = shell(h, null);
    if (can("home.org", "read")) renderOrg();
    if (showCal){ renderCal(); renderTodo(); }
    if (showFaq) renderFaq();
  }
  function catCard(c){
    var ready = !!c.link || S.pages.some(function(p){ return p.cat === c.id; });
    return '<a class="catc' + (ready ? "" : " soon") + '" href="' + (c.link ? c.link : "#/c/" + c.id) + '"' + (c.link ? ' target="_blank" rel="noopener"' : '') + '>' +
      (c.link ? '<span class="ext">대시보드 ↗</span>' : (ready ? '' : '<span class="ext">준비 중</span>')) +
      '<div class="ic">' + c.ic + '</div><h3>' + esc(c.name) + '</h3><p>' + esc(c.desc) + '</p>' +
      '<div class="its">' + c.items.map(function(i){ return '<span>' + esc(i) + '</span>'; }).join("") + '</div></a>';
  }

  /* ---------- 업무분장표 ---------- */
  function orgGroups(){
    var order = [], map = {};
    S.org.forEach(function(r){ if (!map[r.grp]){ map[r.grp] = []; order.push(r.grp); } map[r.grp].push(r); });
    return order.map(function(g){ return { grp: g, rows: map[g] }; });
  }
  function staffOptions(sel, withSpecial){
    var names = S.staff.map(function(s){ return s.name; });
    if (sel && names.indexOf(sel) < 0 && sel !== SPECIAL_SUB) names.push(sel);
    return '<option value="">-</option>' + names.map(function(n){ return '<option' + (n === sel ? " selected" : "") + '>' + esc(n) + '</option>'; }).join("") +
      (withSpecial ? '<option' + (sel === SPECIAL_SUB ? " selected" : "") + '>' + SPECIAL_SUB + '</option>' : '');
  }
  var orgOpen = false;
  function renderOrg(){
    var host = $("#orgSec"); if (!host) return;
    var ed = can("home.org", "edit"), q0 = orgQuery.trim();
    var groups = orgGroups();
    var total = S.org.length;
    host.innerHTML = '<details class="og-wrap" id="orgWrap"' + (orgOpen || q0 ? " open" : "") + '><summary><span class="cv">▶</span><h2>노무관리파트 업무분장표</h2><span class="hint" style="font-size:12.5px">' + groups.length + '개 대분류 · ' + total + '개 업무</span>' +
      '<span class="legend" style="margin-left:auto">' + S.staff.map(function(s){ return chip(s.name); }).join("") + '</span></summary><div class="og-in">' +
      '<div class="sec-h"><div class="hint" style="font-size:12.5px">대분류를 눌러 펼치고, 업무명을 누르면 세부 내용이 열립니다.' + (ed ? ' 사업부 칸의 담당자를 누르면 바로 바꿀 수 있습니다.' : '') + '</div>' +
      '<div class="tools"><input type="search" id="orgQ" placeholder="업무·담당자 검색" value="' + esc(q0) + '">' +
      '<button class="btn sm" id="orgAll">모두 펼치기</button><button class="btn sm" id="orgNone">모두 접기</button>' +
      (ed ? '<button class="btn sm primary" id="orgAdd">+ 업무 추가</button>' : '') + '</div></div><div id="orgGroups"></div></div></details>';
    // only the group list is redrawn while typing, so the search box keeps focus (한글 입력 유지)
    function drawGroups(){
      var q = orgQuery.trim(), openSet = window.__orgOpen || {}, h = "";
      if (!groups.length) h += '<p class="hint">등록된 업무분장이 없습니다.</p>';
      groups.forEach(function(g){
        var rows = g.rows.filter(function(r){
          if (!q) return true;
          var hay = [r.grp, r.title, r.note].concat(UNITS.map(function(u){ return (r.units || {})[u[0]]; })).join(" ");
          return hay.indexOf(q) >= 0;
        });
        if (!rows.length) return;
        var who = {}; rows.forEach(function(r){ UNITS.forEach(function(u){ var v = (r.units || {})[u[0]]; if (v) who[v] = 1; }); });
        var open = q || openSet[g.grp];
        h += '<details class="og" data-g="' + esc(g.grp) + '"' + (open ? " open" : "") + '><summary><span class="cv">▶</span><span class="t">' + esc(g.grp) + '</span><span class="n">' + rows.length + '개 업무</span>' +
          '<span class="who">' + Object.keys(who).map(chip).join("") + '</span></summary><div class="og-body"><table class="org"><thead><tr>' +
          '<th class="l">업무(중분류)</th>' + UNITS.map(function(u, i){ return '<th class="' + (i === 0 ? "ugrp" : "") + '">' + u[1] + '</th>'; }).join("") + '<th class="l ugrp">비고</th></tr></thead><tbody>' +
          rows.map(function(r){
            var u = r.units || {};
            return '<tr data-id="' + r.id + '"><td class="l ttl"><button data-open="' + r.id + '">' + esc(r.title) + '</button>' + (r.detail_html ? '<span class="has">세부 ▸</span>' : '') + '</td>' +
              UNITS.map(function(x, i){
                var c = u[x[0]] ? chip(u[x[0]]) : '<span class="chip empty">-</span>';
                return '<td class="' + (i === 0 ? "ugrp" : "") + '">' + (ed ? '<button class="pick" data-pick="' + r.id + '" data-u="' + x[0] + '" title="' + esc(x[1]) + ' 담당자 바꾸기">' + c + '</button>' : c) + '</td>';
              }).join("") +
              '<td class="note ugrp">' + esc(r.note || "") + '</td></tr>';
          }).join("") + '</tbody></table></div></details>';
      });
      if (groups.length && !h) h = '<p class="hint">검색 결과가 없습니다.</p>';
      var box = $("#orgGroups"); box.innerHTML = h;
      $all("details.og", box).forEach(function(d){ d.addEventListener("toggle", function(){ if (orgQuery.trim()) return; window.__orgOpen = window.__orgOpen || {}; window.__orgOpen[d.dataset.g] = d.open; }); });
      $all("[data-open]", box).forEach(function(b){ b.onclick = function(){ openOrg(+b.dataset.open); }; });
      $all("[data-pick]", box).forEach(function(b){ b.onclick = function(e){ e.stopPropagation(); openPicker(b, +b.dataset.pick, b.dataset.u); }; });
    }
    drawGroups();
    $("#orgWrap").addEventListener("toggle", function(e){ orgOpen = e.target.open; });
    $("#orgQ").addEventListener("input", function(e){ orgQuery = e.target.value; drawGroups(); });
    $("#orgAll").onclick = function(){ $all("#orgGroups details.og").forEach(function(d){ d.open = true; }); };
    $("#orgNone").onclick = function(){ $all("#orgGroups details.og").forEach(function(d){ d.open = false; }); };
    if ($("#orgAdd")) $("#orgAdd").onclick = function(){ openOrgEdit(null); };
  }
  function closePicker(){ var p = document.getElementById("pickPop"); if (p) p.remove(); document.removeEventListener("mousedown", pickOutside, true); }
  function pickOutside(e){ var p = document.getElementById("pickPop"); if (p && !p.contains(e.target)) closePicker(); }
  function openPicker(btn, id, unit){
    closePicker();
    var r = S.org.filter(function(x){ return x.id === id; })[0]; if (!r) return;
    var cur = (r.units || {})[unit] || "", label = UNITS.filter(function(u){ return u[0] === unit; })[0][1];
    var pop = document.createElement("div"); pop.id = "pickPop"; pop.className = "pick-pop";
    pop.innerHTML = '<div class="pp-h">' + esc(label) + ' · ' + esc(r.title) + '</div>' +
      S.staff.map(function(s){ return '<button data-n="' + esc(s.name) + '" class="' + (s.name === cur ? "on" : "") + '">' + chip(s.name) + (s.name === cur ? ' <span class="hint">현재</span>' : '') + '</button>'; }).join("") +
      '<button data-n="">' + '<span class="chip empty">비우기</span></button>' +
      '<label class="pp-all"><input type="checkbox" id="ppAll"> 이 업무의 모든 사업부에 적용</label>';
    document.body.appendChild(pop);
    var rc = btn.getBoundingClientRect(), w = pop.offsetWidth, hgt = pop.offsetHeight;
    var left = Math.min(window.innerWidth - w - 8, Math.max(8, rc.left + rc.width / 2 - w / 2));
    var top = rc.bottom + 6 + hgt > window.innerHeight ? rc.top - hgt - 6 : rc.bottom + 6;
    pop.style.left = (left + window.scrollX) + "px"; pop.style.top = (top + window.scrollY) + "px";
    setTimeout(function(){ document.addEventListener("mousedown", pickOutside, true); }, 0);
    $all("button[data-n]", pop).forEach(function(b){
      b.onclick = async function(){
        var v = b.dataset.n, all = $("#ppAll", pop).checked, units = Object.assign({}, r.units || {});
        if (all) UNITS.forEach(function(u){ if (v) units[u[0]] = v; else delete units[u[0]]; });
        else { if (v) units[unit] = v; else delete units[unit]; }
        closePicker();
        var upd = { units: units, updated_by: me.email, updated_at: new Date().toISOString() };
        var x = await sb.from("portal_org").update(upd).eq("id", id).select("id");
        if (x.error || !x.data || !x.data.length){ alert("저장하지 못했습니다: " + errMsg(x)); return; }
        Object.assign(r, upd); logp("org", "assign", r.title + " " + (all ? "전체" : label) + "=" + (v || "-"));
        toast((all ? "모든 사업부" : label) + " 담당자를 " + (v || "비움") + "(으)로 저장했습니다."); renderOrg();
      };
    });
  }
  function openOrg(id){
    var r = S.org.filter(function(x){ return x.id === id; })[0]; if (!r) return;
    var u = r.units || {}, ed = can("home.org", "edit");
    var m = showModal('<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div class="hint" style="font-size:12px">' + esc(r.grp) + '</div><h3 style="font-size:18px">' + esc(r.title) + '</h3></div>' +
      '<button class="btn sm ghost" id="mx">닫기 ✕</button></div>' +
      '<div class="tbl-w" style="border:1px solid var(--line);border-radius:10px;overflow-x:auto;margin:12px 0"><table class="org" style="min-width:640px"><thead><tr>' + UNITS.map(function(x){ return '<th>' + x[1] + '</th>'; }).join("") + '</tr></thead><tbody><tr>' +
      UNITS.map(function(x){ return '<td>' + (u[x[0]] ? chip(u[x[0]]) : '<span class="chip empty">-</span>') + '</td>'; }).join("") + '</tr></tbody></table></div>' +
      (r.note ? '<div class="banner info" style="margin:0 0 12px">비고: ' + esc(r.note) + '</div>' : '') +
      '<div class="doc" id="odBody">' + (r.detail_html ? cleanHtml(r.detail_html) : '<p class="hint">아직 세부 내용이 없습니다.' + (ed ? ' "세부 내용 수정"을 눌러 작성하세요.' : '') + '</p>') + '</div>' +
      '<div class="modal-actions" style="margin-top:16px">' + (r.updated_by ? '<span class="hint" style="font-size:11.5px;margin-right:auto">최종 수정 ' + esc(r.updated_by) + ' · ' + esc(String(r.updated_at || "").slice(0, 10)) + '</span>' : '') +
      (ed ? '<button class="btn" id="oInfo">담당·항목 수정</button><button class="btn primary" id="oEdit">세부 내용 수정</button>' : '') + '</div>', "wide");
    $("#mx", m).onclick = closeModal;
    $all("#odBody a", m).forEach(function(a){ if (/^https?:/.test(a.getAttribute("href") || "")){ a.target = "_blank"; a.rel = "noopener"; } });
    if (ed){
      $("#oInfo", m).onclick = function(){ openOrgEdit(r); };
      $("#oEdit", m).onclick = function(){ openOrgDetailEdit(r); };
    }
  }
  function openOrgDetailEdit(r){
    var m = showModal('<h3>' + esc(r.title) + ' · 세부 내용 수정</h3><p class="hint">화면에 보이는 그대로 수정합니다. 글자를 선택한 뒤 위 도구를 누르세요.</p>' + editorBar() +
      '<div class="doc"><div id="edBody" contenteditable="true" style="min-height:260px">' + (r.detail_html ? cleanHtml(r.detail_html) : '<h3>업무 개요</h3><p><br></p><h3>처리 절차</h3><ol><li><br></li></ol><h3>참고</h3><p><br></p>') + '</div></div>' +
      '<textarea id="edHtml" class="ed-html" style="display:none"></textarea>' +
      '<div class="modal-actions" style="margin-top:14px"><button class="btn ghost" id="eNo">취소</button><button class="btn primary" id="eOk">저장</button></div>', "wide");
    var root = document.getElementById("modalRoot");
    var st = wireEditor(m, function(){ root.dataset.dirty = "1"; });
    $("#eNo", m).onclick = function(){ if (st.dirty && !confirm("저장하지 않고 닫을까요?")) return; closeModal(); openOrg(r.id); };
    $("#eOk", m).onclick = async function(){
      var upd = { detail_html: st.getHtml(), updated_by: me.email, updated_at: new Date().toISOString() };
      var x = await sb.from("portal_org").update(upd).eq("id", r.id).select("id");
      if (x.error || !x.data || !x.data.length){ alert("저장하지 못했습니다: " + errMsg(x)); return; }
      Object.assign(r, upd); logp("org", "detail", r.title); closeModal(); toast("세부 내용을 저장했습니다."); renderOrg(); openOrg(r.id);
    };
  }
  function openOrgEdit(r){
    var isNew = !r; r = r || { grp: "", title: "", main_name: "", sub_name: "", units: {}, note: "" };
    var groups = orgGroups().map(function(g){ return g.grp; });
    var m = showModal('<h3>' + (isNew ? "업무 추가" : "담당·항목 수정") + '</h3><p class="hint">사업부별 담당자는 해당 업무를 사업부마다 나눠 맡는 경우에 지정합니다.</p>' +
      '<form class="f" id="of"><label>대분류<input name="grp" list="grpList" value="' + esc(r.grp) + '" required><datalist id="grpList">' + groups.map(function(g){ return '<option value="' + esc(g) + '">'; }).join("") + '</datalist></label>' +
      '<label>업무(중분류)<input name="title" value="' + esc(r.title) + '" required></label>' +
      '<div class="full"><div class="hint" style="font-size:12.5px;font-weight:600;margin-bottom:6px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">사업부별 담당 <select id="allSel" style="width:auto;margin:0;padding:4px 8px">' + staffOptions("", false).replace('<option value="">-</option>', '<option value="">일괄 지정…</option>') + '</select> <button type="button" class="btn sm" id="allMain">모든 사업부에 적용</button></div><div class="unit-grid">' +
      UNITS.map(function(u){ return '<label>' + u[1] + '<select name="u_' + u[0] + '">' + staffOptions((r.units || {})[u[0]], false) + '</select></label>'; }).join("") + '</div></div>' +
      '<label class="full">비고<input name="note" value="' + esc(r.note || "") + '"></label>' +
      '<div class="form-actions">' + (!isNew && can("home.org", "manage") ? '<button type="button" class="btn danger" id="oDel" style="margin-right:auto">업무 삭제</button>' : '') +
      '<button type="button" class="btn ghost" id="oNo">취소</button><button class="btn primary">저장</button></div></form>', "wide");
    $("#oNo", m).onclick = function(){ closeModal(); if (!isNew) openOrg(r.id); };
    $("#allMain", m).onclick = function(){ var v = $('#allSel', m).value; if (!v) return; UNITS.forEach(function(u){ $('[name=u_' + u[0] + ']', m).value = v; }); };
    if ($("#oDel", m)) $("#oDel", m).onclick = async function(){
      if (!confirm("'" + r.title + "' 업무를 삭제할까요? 되돌릴 수 없습니다.")) return;
      var x = await sb.from("portal_org").delete().eq("id", r.id).select("id");
      if (x.error || !x.data || !x.data.length){ alert("삭제하지 못했습니다: " + errMsg(x)); return; }
      S.org = S.org.filter(function(o){ return o.id !== r.id; }); logp("org", "delete", r.title); closeModal(); renderOrg();
    };
    $("#of", m).addEventListener("submit", async function(e){
      e.preventDefault(); var fd = new FormData(e.target), units = {};
      UNITS.forEach(function(u){ var v = fd.get("u_" + u[0]); if (v) units[u[0]] = v; });
      var rec = { grp: String(fd.get("grp")).trim(), title: String(fd.get("title")).trim(), units: units, note: String(fd.get("note") || "").trim() || null, updated_by: me.email, updated_at: new Date().toISOString() };
      var x;
      if (isNew){
        var same = S.org.filter(function(o){ return o.grp === rec.grp; });
        rec.sort = same.length ? Math.max.apply(null, same.map(function(o){ return o.sort; })) + 1 : (S.org.length ? Math.max.apply(null, S.org.map(function(o){ return o.sort; })) + 10 : 10);
        x = await sb.from("portal_org").insert(rec).select("*");
      } else x = await sb.from("portal_org").update(rec).eq("id", r.id).select("*");
      if (x.error || !x.data || !x.data.length){ alert("저장하지 못했습니다: " + errMsg(x)); return; }
      if (isNew){ S.org.push(x.data[0]); S.org.sort(function(a, b){ return a.sort - b.sort; }); } else Object.assign(r, x.data[0]);
      logp("org", isNew ? "add" : "edit", rec.title); closeModal(); toast("저장했습니다."); renderOrg(); if (!isNew) openOrg(r.id);
    });
  }

  /* ---------- 캘린더 / 이달의 할 일 ---------- */
  var REPEAT_LABEL = { once: "한 번", weekly: "매주", monthly: "매월", quarterly: "분기마다", yearly: "매년" };
  // occurrences (yyyy-mm-dd) of an event inside [from, to]
  function occurrences(ev, from, to){
    var out = [], st = parseD(ev.start_date), until = ev.repeat_until ? parseD(ev.repeat_until) : null;
    if (!st) return out;
    var rep = ev.repeat || "once";
    function ok(d){ return d >= from && d <= to && d >= st && (!until || d <= until); }
    if (rep === "once"){
      var en = ev.end_date ? parseD(ev.end_date) : st;
      for (var d = new Date(st); d <= en; d.setDate(d.getDate() + 1)){ if (d >= from && d <= to) out.push(ymd(d)); }
      return out;
    }
    if (rep === "weekly"){
      var d1 = new Date(from); while (d1.getDay() !== st.getDay()) d1.setDate(d1.getDate() + 1);
      for (; d1 <= to; d1.setDate(d1.getDate() + 7)) if (ok(d1)) out.push(ymd(d1));
      return out;
    }
    var stepM = rep === "monthly" ? 1 : rep === "quarterly" ? 3 : 12;
    for (var y = from.getFullYear(); y <= to.getFullYear(); y++){
      for (var mo = 0; mo < 12; mo++){
        var diff = (y - st.getFullYear()) * 12 + (mo - st.getMonth());
        if (diff < 0 || diff % stepM) continue;
        var last = new Date(y, mo + 1, 0).getDate();
        var dd = new Date(y, mo, Math.min(st.getDate(), last));
        if (ok(dd)) out.push(ymd(dd));
      }
    }
    return out;
  }
  function monthOcc(y, m){
    var from = new Date(y, m, 1), to = new Date(y, m + 1, 0), list = [];
    S.events.forEach(function(ev){ occurrences(ev, from, to).forEach(function(d){ list.push({ ev: ev, date: d, done: !!(ev.done_keys || {})[d] }); }); });
    list.sort(function(a, b){ return a.date < b.date ? -1 : a.date > b.date ? 1 : a.ev.title.localeCompare(b.ev.title); });
    return list;
  }
  function renderCal(){
    var host = $("#calCard"); if (!host) return;
    var occ = monthOcc(calY, calM), byDay = {};
    occ.forEach(function(o){ (byDay[o.date] = byDay[o.date] || []).push(o); });
    var first = new Date(calY, calM, 1), start = new Date(first); start.setDate(1 - first.getDay());
    var today = todayStr(), cells = "";
    for (var i = 0; i < 42; i++){
      var d = new Date(start); d.setDate(start.getDate() + i);
      if (i >= 35 && d.getMonth() !== calM) break;
      var k = ymd(d), list = byDay[k] || [];
      var nonWeekly = list.filter(function(o){ return o.ev.repeat !== "weekly"; });
      cells += '<div class="d' + (d.getMonth() !== calM ? " out" : "") + (k === today ? " today" : "") + (k === calSel ? " sel" : "") + (d.getDay() === 0 ? " sun" : d.getDay() === 6 ? " sat" : "") + '" data-d="' + k + '" title="' + esc(list.map(function(o){ return o.ev.title; }).join("\n")) + '">' +
        '<span class="dn">' + d.getDate() + '</span>' +
        (nonWeekly[0] ? '<span class="ev1">' + esc(nonWeekly[0].ev.title) + '</span>' : '') +
        '<span class="dots">' + list.slice(nonWeekly[0] ? 1 : 0, 6).map(function(o){ return '<i class="' + (o.done ? "done" : "") + '"></i>'; }).join("") + '</span></div>';
    }
    host.innerHTML = '<div class="sec-h"><h2>📅 연간 계획</h2><div class="tools cal-nav"><button class="btn sm ghost" id="cPrev" aria-label="이전 달">‹</button><b>' + calY + '년 ' + (calM + 1) + '월</b><button class="btn sm ghost" id="cNext" aria-label="다음 달">›</button>' +
      '<button class="btn sm" id="cToday">오늘</button>' + (can("home.calendar", "write") ? '<button class="btn sm primary" id="cAdd">+ 일정</button>' : '') + '</div></div>' +
      '<div class="cal">' + DOW.map(function(w, i){ return '<div class="dw' + (i === 0 ? " sun" : i === 6 ? " sat" : "") + '">' + w + '</div>'; }).join("") + cells + '</div>';
    $("#cPrev").onclick = function(){ calM--; if (calM < 0){ calM = 11; calY--; } calSel = null; renderCal(); renderTodo(); };
    $("#cNext").onclick = function(){ calM++; if (calM > 11){ calM = 0; calY++; } calSel = null; renderCal(); renderTodo(); };
    $("#cToday").onclick = function(){ var n = new Date(); calY = n.getFullYear(); calM = n.getMonth(); calSel = null; renderCal(); renderTodo(); };
    if ($("#cAdd")) $("#cAdd").onclick = function(){ openEvent(null, calSel || ymd(new Date(calY, calM, Math.min(new Date().getDate(), 28)))); };
    $all(".cal .d", host).forEach(function(c){ c.onclick = function(){ calSel = calSel === c.dataset.d ? null : c.dataset.d; renderCal(); renderTodo(); }; });
  }
  function renderTodo(){
    var host = $("#todoCard"); if (!host) return;
    var occ = monthOcc(calY, calM), today = todayStr(), w = can("home.calendar", "write");
    if (calSel) occ = occ.filter(function(o){ return o.date === calSel; });
    var weekly = [], seenW = {}, items = [];
    occ.forEach(function(o){ if (o.ev.repeat === "weekly"){ if (!seenW[o.ev.id]){ seenW[o.ev.id] = 1; weekly.push(o); } } else items.push(o); });
    var doneN = items.filter(function(o){ return o.done; }).length;
    var h = '<div class="sec-h"><h2>✅ ' + (calSel ? md(calSel) + " 할 일" : "이달의 할 일") + '</h2><div class="tools">' +
      (calSel ? '<button class="btn sm" id="tAll">이달 전체 보기</button>' : '<span class="hint" style="font-size:12px">' + doneN + ' / ' + items.length + ' 완료</span>') + '</div></div><ul class="todo">';
    if (!items.length && !weekly.length) h += '<li style="border:0;color:var(--ink-300)">' + (calSel ? "이 날의 일정이 없습니다." : "이달에 등록된 일정이 없습니다.") + '</li>';
    items.forEach(function(o){
      var late = !o.done && o.date < today;
      h += '<li class="' + (o.done ? "done" : "") + (late ? " late" : "") + '"><input type="checkbox" data-ev="' + o.ev.id + '" data-d="' + o.date + '"' + (o.done ? " checked" : "") + (w ? "" : " disabled") + ' aria-label="완료">' +
        '<span class="dt">' + md(o.date) + '</span><span class="tt" data-open-ev="' + o.ev.id + '">' + esc(o.ev.title) +
        '<small>' + [o.ev.category, o.ev.owner_name, o.ev.repeat !== "once" ? REPEAT_LABEL[o.ev.repeat] : ""].filter(Boolean).map(esc).join(" · ") + (late ? ' · <b style="color:var(--danger-700)">기한 지남</b>' : '') + '</small></span></li>';
    });
    if (weekly.length){
      h += '<li class="grp-l">매주 반복</li>';
      weekly.forEach(function(o){ h += '<li><span class="dt">매주 ' + DOW[parseD(o.ev.start_date).getDay()] + '</span><span class="tt" data-open-ev="' + o.ev.id + '">' + esc(o.ev.title) + '<small>' + [o.ev.category, o.ev.owner_name].filter(Boolean).map(esc).join(" · ") + '</small></span></li>'; });
    }
    host.innerHTML = h + '</ul>';
    if ($("#tAll")) $("#tAll").onclick = function(){ calSel = null; renderCal(); renderTodo(); };
    $all("[data-open-ev]", host).forEach(function(t){ t.onclick = function(){ var ev = S.events.filter(function(e){ return e.id === t.dataset.openEv; })[0]; if (ev) openEvent(ev); }; });
    $all("input[data-ev]", host).forEach(function(cb){
      cb.onchange = async function(){
        var ev = S.events.filter(function(e){ return e.id === cb.dataset.ev; })[0], dk = Object.assign({}, ev.done_keys || {});
        if (cb.checked) dk[cb.dataset.d] = me.name; else delete dk[cb.dataset.d];
        var x = await sb.from("portal_events").update({ done_keys: dk }).eq("id", ev.id).select("id");
        if (x.error || !x.data || !x.data.length){ alert("저장하지 못했습니다: " + errMsg(x)); cb.checked = !cb.checked; return; }
        ev.done_keys = dk; renderCal(); renderTodo();
      };
    });
  }
  function openEvent(ev, dateStr){
    var isNew = !ev, w = can("home.calendar", "write");
    ev = ev || { title: "", start_date: dateStr, end_date: "", repeat: "once", repeat_until: "", category: "", owner_name: "", note: "" };
    if (!w){
      showModal('<h3>' + esc(ev.title) + '</h3><p class="hint">' + esc(md(ev.start_date)) + (ev.end_date && ev.end_date !== ev.start_date ? " ~ " + esc(md(ev.end_date)) : "") + ' · ' + REPEAT_LABEL[ev.repeat || "once"] + '</p>' +
        (ev.category ? '<p>분류: ' + esc(ev.category) + '</p>' : '') + (ev.owner_name ? '<p>담당: ' + chip(ev.owner_name) + '</p>' : '') +
        (ev.note ? '<p class="wraptext">' + esc(ev.note) + '</p>' : '') + '<div class="modal-actions"><button class="btn" onclick="document.getElementById(\'modalRoot\').remove()">닫기</button></div>', "mid");
      return;
    }
    var cats = CATS.map(function(c){ return c.name; }).concat(["공통"]);
    var m = showModal('<h3>' + (isNew ? "일정 추가" : "일정 수정") + '</h3><p class="hint">반복 일정은 매월·분기·매년 같은 날짜에 자동으로 표시되고 "이달의 할 일"에 올라옵니다.</p>' +
      '<form class="f" id="ef"><label class="full">일정명<input name="title" value="' + esc(ev.title) + '" required></label>' +
      '<label>시작일<input type="date" name="start_date" value="' + esc(ev.start_date || "") + '" required></label>' +
      '<label>종료일 (기간 일정)<input type="date" name="end_date" value="' + esc(ev.end_date || "") + '"></label>' +
      '<label>반복<select name="repeat">' + Object.keys(REPEAT_LABEL).map(function(k){ return '<option value="' + k + '"' + (ev.repeat === k ? " selected" : "") + '>' + REPEAT_LABEL[k] + '</option>'; }).join("") + '</select></label>' +
      '<label>반복 종료일<input type="date" name="repeat_until" value="' + esc(ev.repeat_until || "") + '"></label>' +
      '<label>분류<select name="category"><option value="">-</option>' + cats.map(function(c){ return '<option' + (ev.category === c ? " selected" : "") + '>' + esc(c) + '</option>'; }).join("") + '</select></label>' +
      '<label>담당<select name="owner_name">' + staffOptions(ev.owner_name, false) + '</select></label>' +
      '<label class="full">메모<textarea name="note">' + esc(ev.note || "") + '</textarea></label>' +
      '<div class="form-actions">' + (!isNew ? '<button type="button" class="btn danger" id="eDel" style="margin-right:auto">삭제</button>' : '') + '<button type="button" class="btn ghost" id="eNo">취소</button><button class="btn primary">저장</button></div></form>', "mid");
    $("#eNo", m).onclick = closeModal;
    if ($("#eDel", m)) $("#eDel", m).onclick = async function(){
      if (!confirm("'" + ev.title + "' 일정을 삭제할까요?" + (ev.repeat !== "once" ? " 반복되는 모든 일정이 함께 삭제됩니다." : ""))) return;
      var x = await sb.from("portal_events").delete().eq("id", ev.id).select("id");
      if (x.error || !x.data || !x.data.length){ alert("삭제하지 못했습니다: " + errMsg(x)); return; }
      S.events = S.events.filter(function(e){ return e.id !== ev.id; }); logp("calendar", "delete", ev.title); closeModal(); renderCal(); renderTodo();
    };
    $("#ef", m).addEventListener("submit", async function(e){
      e.preventDefault(); var fd = new FormData(e.target);
      var rec = { title: String(fd.get("title")).trim(), start_date: fd.get("start_date"), end_date: fd.get("end_date") || null, repeat: fd.get("repeat"), repeat_until: fd.get("repeat_until") || null, category: fd.get("category") || null, owner_name: fd.get("owner_name") || null, note: String(fd.get("note") || "").trim() || null };
      if (rec.end_date && rec.end_date < rec.start_date){ alert("종료일이 시작일보다 빠릅니다."); return; }
      var x = isNew ? await sb.from("portal_events").insert(rec).select("*") : await sb.from("portal_events").update(rec).eq("id", ev.id).select("*");
      if (x.error || !x.data || !x.data.length){ alert("저장하지 못했습니다: " + errMsg(x)); return; }
      if (isNew) S.events.push(x.data[0]); else Object.assign(ev, x.data[0]);
      logp("calendar", isNew ? "add" : "edit", rec.title); closeModal(); toast("일정을 저장했습니다."); renderCal(); renderTodo();
    });
  }

  /* ---------- FAQ ---------- */
  var faqQ = "", faqKind = "", faqPeriod = "12m", faqType = "", faqStatus = "", faqAns = "", faqSrc = "", homeFaqCat = "근태";
  var FAQ_SRC = ["반복 문의", "특수 문의"];
  var HOME_FAQ_CATS = ["근태", "시간외근로", "휴가", "휴직", "복리후생", "기타"];
  function srcOf(f){ return f.source === "특수 문의" ? "특수 문의" : "반복 문의"; }
  function srcBadge(f){ var s = srcOf(f); return '<span class="badge ' + (s === "반복 문의" ? "src-rep" : "src-sp") + '">' + s + '</span>'; }
  // 같은 질문(공백·문장부호·끝말 정리 후 같은 문장)을 묶어 문의 건수를 셉니다.
  function qKey(q){ return String(q || "").toLowerCase().replace(/\(예\)/g, "").replace(/[\s\-_.,·?!~()\[\]"'“”‘’/]+/g, "").replace(/(문의|여부|방법|관련|요청|가능|확인)+$/g, ""); }
  function faqGroups(list){
    var g = {};
    list.forEach(function(f){ var k = qKey(f.question) || f.id; var x = g[k] = g[k] || { key: k, items: [], latest: null }; x.items.push(f); if (!x.latest || faqDate(f) > faqDate(x.latest)) x.latest = f; });
    return Object.keys(g).map(function(k){ return g[k]; }).sort(function(a, b){
      return b.items.length - a.items.length || (srcOf(b.latest) === "반복 문의") - (srcOf(a.latest) === "반복 문의") || (faqDate(b.latest) > faqDate(a.latest) ? 1 : faqDate(b.latest) < faqDate(a.latest) ? -1 : 0); });
  }
  var FAQ_TYPES = ["근로시간", "재택근무", "출퇴근체크", "휴게시간", "단축근무", "외근", "출장", "교육", "입사", "퇴사", "파견직",
    "시간외근로", "초과(연장)근무", "휴(무)일근무", "야간근무", "보상휴가", "택시비지원",
    "연차(휴가)", "연차촉진", "리프레쉬휴가", "무급휴가", "병가", "공가", "난임휴가",
    "육아휴직", "출산휴가", "휴직", "경조사", "건강검진", "증명서", "문서작성", "WORKS", "MIS", "보상운영", "HRBP팀이관", "기타"];
  var TYPE_CAT = { "근로시간": "근태", "재택근무": "근태", "출퇴근체크": "근태", "휴게시간": "근태", "단축근무": "근태", "외근": "근태", "출장": "근태", "교육": "근태", "입사": "근태", "퇴사": "근태", "파견직": "근태",
    "시간외근로": "시간외근로", "초과(연장)근무": "시간외근로", "휴(무)일근무": "시간외근로", "야간근무": "시간외근로", "보상휴가": "시간외근로", "택시비지원": "시간외근로",
    "연차(휴가)": "휴가", "연차촉진": "휴가", "리프레쉬휴가": "휴가", "무급휴가": "휴가", "병가": "휴가", "공가": "휴가", "난임휴가": "휴가",
    "육아휴직": "휴직", "출산휴가": "휴직", "휴직": "휴직", "경조사": "복리후생", "건강검진": "복리후생" };
  var FAQ_STATUS = ["진행 중", "완료", "타부서 이관"];
  function catFromTypes(types){
    var l = String(types || "").split(",").map(function(s){ return s.trim(); }).filter(Boolean);
    for (var i = 0; i < l.length; i++) if (TYPE_CAT[l[i]]) return TYPE_CAT[l[i]];
    return l.length ? "기타" : "";
  }
  function faqDate(f){ return String(f.asked_on || "").slice(0, 10); }
  function asker(f){ var n = [f.asker_name, f.asker_dept, f.asker_title].filter(Boolean); return n.length ? esc(f.asker_name || "") + (f.asker_dept ? ' <span class="hint">' + esc(f.asker_dept) + '</span>' : '') + (f.asker_title ? ' <span class="badge neutral" style="font-size:10.5px">' + esc(f.asker_title) + '</span>' : '') : '<span class="hint">-</span>'; }
  function statusBadge(s){ s = s || "완료"; return '<span class="badge ' + (s === "완료" ? "good" : s === "진행 중" ? "warn" : "info") + '">' + esc(s) + '</span>'; }
  function sortFaq(l){ return l.slice().sort(function(a, b){ var x = faqDate(a), y = faqDate(b); return x < y ? 1 : x > y ? -1 : (b.sort || 0) - (a.sort || 0); }); }

  // home card: category tabs (근태·시간외근로·휴가·휴직·복리후생·기타), top 10 most-asked questions each
  function renderFaq(){
    var host = $("#faqCard"); if (!host) return;
    var w = can("home.faq", "write");
    function topHtml(){
      var q = faqQ.trim();
      var inCat = S.faq.filter(function(f){ return (f.category || "기타") === homeFaqCat && (!q || [f.question, f.answer, f.qtype].join(" ").indexOf(q) >= 0); });
      var groups = faqGroups(inCat).slice(0, 10);
      return '<ol class="faq-links top">' + (groups.length ? groups.map(function(g, i){
        var f = g.latest;
        return '<li><a href="#/faq/' + encodeURIComponent(f.id) + '"><span class="rk">' + (i + 1) + '</span><span class="tx">' + esc(f.question) + '</span>' + (g.items.length > 1 ? '<span class="badge info">' + g.items.length + '건</span>' : '') + srcBadge(f) + '</a></li>';
      }).join("") : '<li class="hint" style="font-size:13px;padding:8px">해당하는 FAQ가 없습니다.</li>') + '</ol>';
    }
    host.innerHTML = '<div class="sec-h"><h2><a href="#/faq" class="h-link">💬 FAQ ›</a></h2><div class="tools"><input type="search" id="fq" placeholder="질문 검색" value="' + esc(faqQ) + '" style="width:150px">' + (w ? '<button class="btn sm primary" id="fAdd">+ FAQ</button>' : '') + '</div></div>' +
      '<div class="faq-tabs">' + HOME_FAQ_CATS.map(function(c){ var n = S.faq.filter(function(f){ return (f.category || "기타") === c; }).length; return '<button data-fc="' + esc(c) + '" class="' + (c === homeFaqCat ? "on" : "") + '">' + esc(c) + ' <span class="n">' + n + '</span></button>'; }).join("") + '</div>' +
      '<div class="hint" style="font-size:11.5px;margin:-2px 0 6px">' + esc(homeFaqCat) + ' · 문의 건수 많은 순 상위 10개</div>' +
      '<div id="faqTop">' + topHtml() + '</div>' +
      '<a class="btn sm" href="#/faq" style="margin-top:8px;align-self:flex-end">FAQ 화면에서 전체 보기 · 문의 분석 →</a>';
    $all("[data-fc]", host).forEach(function(b){ b.onclick = function(){ homeFaqCat = b.dataset.fc; renderFaq(); }; });
    $("#fq").addEventListener("input", function(e){ faqQ = e.target.value; $("#faqTop").innerHTML = topHtml(); });
    if ($("#fAdd")) $("#fAdd").onclick = function(){ openFaq(null, renderFaq); };
  }
  function openFaq(f, after){
    var isNew = !f; f = f || { question: "", answer: "", kind: "", asked_on: todayStr(), status: "진행 중", answerer: me.name, source: "특수 문의" };
    var types = String(f.qtype || "").split(",").map(function(s){ return s.trim(); }).filter(Boolean);
    var m = showModal('<h3>' + (isNew ? "FAQ 추가" : "FAQ 수정") + '</h3><p class="hint">유형을 고르면 분석용 분류(근태·시간외근로·휴가·휴직·복리후생·기타)가 자동으로 정해집니다. 문의 날짜·분류는 FAQ 문의 분석에 바로 반영됩니다.</p><form class="f" id="ff">' +
      '<label class="full">질문<input name="question" value="' + esc(f.question) + '" required></label>' +
      '<div class="full"><div class="hint" style="font-size:12.5px;font-weight:600;margin-bottom:6px">유형 (여러 개 선택)</div><div class="type-picks">' + FAQ_TYPES.map(function(t){ return '<label><input type="checkbox" name="qt" value="' + esc(t) + '"' + (types.indexOf(t) >= 0 ? " checked" : "") + '>' + esc(t) + '</label>'; }).join("") + '</div></div>' +
      '<label>분류(분석용)<select name="category">' + ["", "근태", "시간외근로", "휴가", "휴직", "복리후생", "기타"].map(function(c){ return '<option' + (c === (f.category || "") ? " selected" : "") + ' value="' + c + '">' + (c || "자동(유형 기준)") + '</option>'; }).join("") + '</select></label>' +
      '<label>문의 구분<select name="source">' + FAQ_SRC.map(function(k){ return '<option' + (srcOf(f) === k ? " selected" : "") + '>' + k + '</option>'; }).join("") + '</select></label>' +
      '<label>반복 문의 세부 구분<select name="kind">' + ["", "단순 반복", "개별 판단", "FAQ 미수록"].map(function(k){ return '<option' + (f.kind === k ? " selected" : "") + '>' + k + '</option>'; }).join("") + '</select></label>' +
      '<label>질문자 이름<input name="asker_name" value="' + esc(f.asker_name || "") + '"></label>' +
      '<label>질문자 소속<input name="asker_dept" value="' + esc(f.asker_dept || "") + '" placeholder="예: CC사업부 광고성과운영팀"></label>' +
      '<label>질문자 직책<select name="asker_title">' + ["", "팀원", "파트장", "팀장", "실장", "본부장", "담당"].map(function(k){ return '<option' + ((f.asker_title || "") === k ? " selected" : "") + '>' + k + '</option>'; }).join("") + '</select></label>' +
      '<label>문의 수단<select name="channel">' + ["", "메신저", "메일", "구두", "HRBP팀"].map(function(k){ return '<option' + ((f.channel || "") === k ? " selected" : "") + '>' + k + '</option>'; }).join("") + '</select></label>' +
      '<label>문의 날짜<input type="date" name="asked_on" value="' + esc(f.asked_on || "") + '"></label>' +
      '<label>완료 날짜<input type="date" name="done_on" value="' + esc(f.done_on || "") + '"></label>' +
      '<label>진행 현황<select name="status">' + FAQ_STATUS.map(function(k){ return '<option' + ((f.status || "완료") === k ? " selected" : "") + '>' + k + '</option>'; }).join("") + '</select></label>' +
      '<label>답변자<select name="answerer">' + staffOptions(f.answerer || "", false) + '</select></label>' +
      '<label class="full" style="flex-direction:row;align-items:center;gap:6px"><input type="checkbox" name="caution" style="width:auto"' + (f.caution ? " checked" : "") + '> 주의 (답변 시 유의가 필요한 문의)</label>' +
      '<label class="full">문의 내용<textarea name="detail" rows="4">' + esc(f.detail || "") + '</textarea></label>' +
      '<label class="full">답변<textarea name="answer" rows="7" style="min-height:150px">' + esc(f.answer || "") + '</textarea></label>' +
      '<div class="full"><div class="hint" style="font-size:12.5px;font-weight:600;margin-bottom:6px">이미지 첨부 <span style="font-weight:400">(캡처 화면 등 · 여러 장 가능 · 장당 10MB 이하 · 이 칸에 붙여넣기(Ctrl+V)도 됩니다)</span></div>' +
      '<div class="img-drop" id="imgDrop" tabindex="0"><div class="img-grid" id="imgGrid"></div><label class="btn sm" style="cursor:pointer">+ 이미지 선택<input type="file" id="imgIn" accept="image/*" multiple hidden></label></div></div>' +
      '<div class="form-actions">' + (!isNew ? '<button type="button" class="btn danger" id="fDel" style="margin-right:auto">삭제</button>' : '') + '<button type="button" class="btn ghost" id="fNo">취소</button><button class="btn primary">저장</button></div></form>', "wide");
    var done = $('[name=done_on]', m), stSel = $('[name=status]', m);
    stSel.addEventListener("change", function(){ if (stSel.value === "완료" && !done.value) done.value = todayStr(); });
    // images: keep = already-stored images still attached, added = new File objects to upload on save
    var keep = (f.images || []).slice(), added = [], removed = [];
    function drawImgs(){
      var g = $("#imgGrid", m);
      g.innerHTML = keep.map(function(im, i){ return '<div class="img-th" data-k="' + i + '"><img alt="' + esc(im.name || "") + '"><button type="button" class="ib" data-rk="' + i + '" title="첨부 빼기">✕</button></div>'; }).join("") +
        added.map(function(a, i){ return '<div class="img-th new"><img src="' + a.url + '" alt="' + esc(a.file.name) + '"><button type="button" class="ib" data-ra="' + i + '" title="첨부 빼기">✕</button></div>'; }).join("") +
        (keep.length || added.length ? "" : '<span class="hint" style="font-size:12px">첨부한 이미지가 없습니다.</span>');
      signedUrls(keep).then(function(urls){ $all(".img-th[data-k] img", g).forEach(function(img, i){ if (urls[i]) img.src = urls[i]; }); });
      $all("[data-rk]", g).forEach(function(b){ b.onclick = function(){ removed.push(keep[+b.dataset.rk]); keep.splice(+b.dataset.rk, 1); drawImgs(); }; });
      $all("[data-ra]", g).forEach(function(b){ b.onclick = function(){ URL.revokeObjectURL(added[+b.dataset.ra].url); added.splice(+b.dataset.ra, 1); drawImgs(); }; });
    }
    function addFiles(list){
      Array.prototype.forEach.call(list, function(file){
        if (!/^image\//.test(file.type)){ alert(file.name + ": 이미지 파일만 첨부할 수 있습니다."); return; }
        if (file.size > 10 * 1024 * 1024){ alert(file.name + ": 10MB를 넘는 이미지는 첨부할 수 없습니다."); return; }
        added.push({ file: file, url: URL.createObjectURL(file) });
      });
      drawImgs();
    }
    $("#imgIn", m).onchange = function(e){ addFiles(e.target.files); e.target.value = ""; };
    m.addEventListener("paste", function(e){ var items = (e.clipboardData && e.clipboardData.files) || []; if (items.length){ e.preventDefault(); addFiles(items); } });
    var drop = $("#imgDrop", m);
    drop.addEventListener("dragover", function(e){ e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", function(){ drop.classList.remove("over"); });
    drop.addEventListener("drop", function(e){ e.preventDefault(); drop.classList.remove("over"); addFiles(e.dataTransfer.files); });
    drawImgs();
    $("#fNo", m).onclick = function(){ added.forEach(function(a){ URL.revokeObjectURL(a.url); }); closeModal(); };
    if ($("#fDel", m)) $("#fDel", m).onclick = async function(){
      if (!confirm("이 FAQ를 삭제할까요?")) return;
      if (await deleteFaq(f)){ closeModal(); after && after(); }
    };
    $("#ff", m).addEventListener("submit", async function(e){
      e.preventDefault(); var fd = new FormData(e.target), btn = $(".form-actions .primary", m);
      var qt = fd.getAll("qt").join(", ");
      function v(k){ var x = String(fd.get(k) || "").trim(); return x || null; }
      var rec = { question: v("question"), qtype: qt || null, category: v("category") || catFromTypes(qt) || null, source: v("source") || "특수 문의", kind: v("source") === "반복 문의" ? v("kind") : null, asker_name: v("asker_name"), asker_dept: v("asker_dept"), asker_title: v("asker_title"),
        channel: v("channel"), asked_on: v("asked_on"), done_on: v("done_on"), status: v("status") || "완료", answerer: v("answerer"), caution: !!fd.get("caution"), detail: v("detail"), answer: v("answer") || "", updated_by: me.email, updated_at: new Date().toISOString() };
      if (rec.done_on && rec.asked_on && rec.done_on < rec.asked_on){ alert("완료 날짜가 문의 날짜보다 빠릅니다."); return; }
      if (isNew){ rec.sort = S.faq.length ? Math.max.apply(null, S.faq.map(function(z){ return z.sort || 0; })) + 1 : 1; }
      btn.disabled = true; btn.textContent = added.length ? "이미지 올리는 중…" : "저장 중…";
      var imgs = keep.slice();
      for (var i = 0; i < added.length; i++){
        var a = added[i], ext = ((a.file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "")) || "png";
        var path = "faq/" + todayStr().slice(0, 7) + "/" + Date.now().toString(36) + "-" + i + "." + ext;
        var up = await sb.storage.from(BUCKET).upload(path, a.file, { upsert: false, contentType: a.file.type });
        if (up.error){ alert("이미지를 올리지 못했습니다: " + up.error.message); btn.disabled = false; btn.textContent = "저장"; return; }
        imgs.push({ path: path, name: a.file.name, size: a.file.size });
      }
      rec.images = imgs;
      var x = isNew ? await sb.from("portal_faq").insert(rec).select("*") : await sb.from("portal_faq").update(rec).eq("id", f.id).select("*");
      if (x.error || !x.data || !x.data.length){ alert("저장하지 못했습니다: " + errMsg(x)); btn.disabled = false; btn.textContent = "저장"; return; }
      if (removed.length) sb.storage.from(BUCKET).remove(removed.map(function(r){ return r.path; })).then(function(){});
      added.forEach(function(a){ URL.revokeObjectURL(a.url); });
      if (isNew) S.faq.push(x.data[0]); else Object.assign(f, x.data[0]);
      logp("faq", isNew ? "add" : "edit", rec.question); closeModal(); toast("FAQ를 저장했습니다."); after && after();
    });
  }
  async function signedUrls(list){
    if (!list || !list.length) return [];
    var r = await sb.storage.from(BUCKET).createSignedUrls(list.map(function(x){ return x.path; }), 600);
    if (r.error || !r.data) return [];
    return r.data.map(function(d){ return d.signedUrl; });
  }
  async function deleteFaq(f){
    var x = await sb.from("portal_faq").delete().eq("id", f.id).select("id");
    if (x.error || !x.data || !x.data.length){ alert("삭제하지 못했습니다: " + errMsg(x)); return false; }
    if ((f.images || []).length) sb.storage.from(BUCKET).remove(f.images.map(function(r){ return r.path; })).then(function(){});
    S.faq = S.faq.filter(function(z){ return z.id !== f.id; }); logp("faq", "delete", f.question);
    return true;
  }
  function faqDetail(f, after){
    var w = can("home.faq", "write"), imgs = f.images || [];
    var m = showModal('<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><div style="display:flex;gap:6px;flex-wrap:wrap">' + srcBadge(f) + (f.category ? '<span class="badge info">' + esc(f.category) + '</span>' : '') + statusBadge(f.status) + (f.kind ? '<span class="badge neutral">' + esc(f.kind) + '</span>' : '') + (f.caution ? '<span class="badge danger">주의</span>' : '') + (imgs.length ? '<span class="badge neutral">🖼 ' + imgs.length + '</span>' : '') + '</div>' +
      '<h3 style="font-size:18px;margin-top:8px">' + esc(f.question) + '</h3></div><button class="btn sm ghost" id="fx">닫기 ✕</button></div>' +
      '<div class="faq-meta"><div><span class="hint">유형</span>' + (f.qtype ? String(f.qtype).split(",").map(function(t){ return '<span class="chip">' + esc(t.trim()) + '</span>'; }).join(" ") : '-') + '</div>' +
      '<div><span class="hint">질문자</span>' + asker(f) + '</div><div><span class="hint">문의 수단</span>' + esc(f.channel || "-") + '</div>' +
      '<div><span class="hint">문의 날짜</span>' + esc(f.asked_on || "-") + '</div><div><span class="hint">완료 날짜</span>' + esc(f.done_on || "-") + '</div><div><span class="hint">답변자</span>' + (f.answerer ? chip(f.answerer) : "-") + '</div></div>' +
      (f.detail ? '<h4 class="faq-h">문의 내용</h4><div class="faq-box wraptext">' + esc(f.detail) + '</div>' : '') +
      '<h4 class="faq-h">답변</h4><div class="faq-box wraptext">' + (f.answer ? esc(f.answer) : '<span class="hint">답변 준비 중</span>') + '</div>' +
      (imgs.length ? '<h4 class="faq-h">첨부 이미지 (' + imgs.length + ')</h4><div class="img-grid view" id="fdImgs">' + imgs.map(function(im, i){ return '<a class="img-th" data-i="' + i + '" target="_blank" rel="noopener" title="' + esc(im.name || "") + ' · 눌러서 원본 보기"><img alt="' + esc(im.name || "첨부 이미지") + '"></a>'; }).join("") + '</div>' : '') +
      '<div class="modal-actions" style="margin-top:14px">' + (w ? '<button class="btn danger" id="fRm">삭제</button>' : '') + '<span style="margin-right:auto"></span>' + (f.source_url ? '<a class="btn sm ghost" href="' + esc(f.source_url) + '" target="_blank" rel="noopener">노션 원문 ↗</a>' : '') + (w ? '<button class="btn primary" id="fEd">수정</button>' : '') + '</div>', "wide");
    if (imgs.length) signedUrls(imgs).then(function(urls){ $all("#fdImgs .img-th", m).forEach(function(a, i){ if (urls[i]){ a.href = urls[i]; a.querySelector("img").src = urls[i]; } }); });
    $("#fx", m).onclick = closeModal;
    if ($("#fEd", m)) $("#fEd", m).onclick = function(){ openFaq(f, after); };
    if ($("#fRm", m)) $("#fRm", m).onclick = async function(){
      if (!confirm("'" + f.question + "' FAQ를 삭제할까요? 되돌릴 수 없습니다." + (imgs.length ? " 첨부 이미지 " + imgs.length + "장도 함께 지워집니다." : ""))) return;
      if (!(await deleteFaq(f))) return;
      closeModal(); toast("FAQ를 삭제했습니다.");
      if (location.hash.indexOf("#/faq/") === 0 && location.hash !== "#/faq/list") history.replaceState(null, "", "#/faq/list");
      after && after();
    };
  }

  /* ---------- FAQ page (inner page with inquiry analysis) ---------- */
  var PERIODS = [["all", "전체"], ["year", "올해"], ["12m", "최근 12개월"], ["6m", "최근 6개월"], ["3m", "최근 3개월"], ["month", "이번 달"]];
  function periodStart(p){
    var n = new Date(), d;
    if (p === "all") return null;
    if (p === "year") d = new Date(n.getFullYear(), 0, 1);
    else if (p === "month") d = new Date(n.getFullYear(), n.getMonth(), 1);
    else d = new Date(n.getFullYear(), n.getMonth() - (parseInt(p, 10) - 1), 1);
    return ymd(d);
  }
  var faqTab = "dash", faqDash = null;
  function renderFaqPage(arg){
    var openId = arg && arg !== "list" && arg !== "dash" ? arg : null;
    faqTab = arg === "list" || openId ? "list" : "dash";
    if (openId){ faqCat = "전체"; faqQ = ""; faqKind = ""; faqType = ""; faqStatus = ""; faqAns = ""; faqSrc = ""; }
    app.innerHTML = shell('<div class="cat-head"><div class="crumb"><a href="#/">홈</a> › FAQ</div><h1><span>💬</span>FAQ</h1><p class="hint" style="margin:4px 0 14px;font-size:13px">자주 묻는 문의와 답변을 모으고, 카테고리별·기간별 문의 현황을 분석합니다. FAQ를 추가하거나 고치면 대시보드가 바로 갱신됩니다.</p></div>' +
      '<div class="cat-wrap"><aside class="side"><div class="side-title">FAQ</div>' +
      '<a class="side-link' + (faqTab === "dash" ? " on" : "") + '" href="#/faq">📊 FAQ 대시보드</a><a class="side-link' + (faqTab === "list" ? " on" : "") + '" href="#/faq/list">📋 FAQ 목록 <span class="hint" style="margin-left:auto;font-size:11.5px">' + S.faq.length + '</span></a></aside>' +
      '<div class="cat-main" id="fqMain"></div></div>', "FAQ");
    wireShell();
    drawFaqPage();
    if (openId){ var f = S.faq.filter(function(x){ return x.id === openId; })[0]; if (f) faqDetail(f, drawFaqPage); }
  }
  /* ---------- FAQ 대시보드 내보내기 (경영진 보고용) ---------- */
  function loadScript(src){ return new Promise(function(res, rej){ if (document.querySelector('script[src="' + src + '"]')) return res(); var s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = function(){ rej(new Error("스크립트를 불러오지 못했습니다: " + src)); }; document.head.appendChild(s); }); }
  function faqExportExcel(){
    if (!window.XLSX || !faqDash){ alert("엑셀 도구를 불러오지 못했습니다. 새로고침 후 다시 시도하세요."); return; }
    var D = faqDash, n = D.inP.length, sp = n - D.repAll, today = todayStr();
    var pct = function(a, b){ return b ? Math.round(a / b * 1000) / 10 : 0; };
    var wb = XLSX.utils.book_new();
    function sheet(name, rows, widths){ var ws = XLSX.utils.aoa_to_sheet(rows); ws["!cols"] = widths.map(function(w){ return { wch: w }; }); XLSX.utils.book_append_sheet(wb, ws, name); }
    sheet("요약", [
      ["HRM 노무관리파트 FAQ 문의 현황"], [],
      ["기간", D.plabel + " (" + (D.from || "전체") + " ~ " + today + ")"], ["기준일", today], ["작성", me.name], [],
      ["항목", "값", "비고"],
      ["기간 내 문의 건수", n, "전체 FAQ " + D.total + "건"],
      ["이번 달 문의", D.cThis, "지난달 " + D.cPrev + "건"],
      ["가장 많은 분류", D.catRows[0] ? D.catRows[0][0] : "-", D.catRows[0] ? D.catRows[0][1] + "건 (" + pct(D.catRows[0][1], n) + "%)" : ""],
      ["진행 중 문의", D.open, ""],
      ["반복 문의", D.repAll, pct(D.repAll, n) + "%"],
      ["특수 문의", sp, pct(sp, n) + "%"],
      ["최근 3개월 반복 문의 비율(%)", D.last3 == null ? "-" : Math.round(D.last3 * 10) / 10, D.prev3 == null ? "직전 3개월 데이터 없음" : "직전 3개월 " + Math.round(D.prev3 * 10) / 10 + "%"],
      D.noDate ? ["날짜 없는 문의", D.noDate, "기간 분석에서 제외"] : []
    ], [30, 26, 30]);
    sheet("카테고리별", [["분류", "건수", "비율(%)"]].concat(D.catRows.map(function(r){ return [r[0], r[1], pct(r[1], n)]; })).concat([["합계", n, 100]]), [16, 10, 10]);
    sheet("유형별", [["유형", "건수", "비율(%)"]].concat(Object.keys(D.byTypeP).sort(function(a, b){ return D.byTypeP[b] - D.byTypeP[a]; }).map(function(t){ return [t, D.byTypeP[t], pct(D.byTypeP[t], n)]; })), [18, 10, 10]);
    sheet("월별 추이", [["월", "전체", "반복 문의", "특수 문의", "반복 비율(%)"]].concat(D.rs.map(function(x){ return [x.k, x.n, x.rep, x.sp, x.n ? pct(x.rep, x.n) : ""]; })), [10, 8, 10, 10, 12]);
    sheet("문의 목록", [["문의 구분", "질문", "분류", "유형", "질문자", "소속", "직책", "문의날짜", "완료날짜", "진행현황", "답변자"]].concat(sortFaq(D.inP).map(function(f){ return [srcOf(f), f.question, f.category || "", f.qtype || "", f.asker_name || "", f.asker_dept || "", f.asker_title || "", f.asked_on || "", f.done_on || "", f.status || "", f.answerer || ""]; })), [10, 46, 10, 26, 10, 24, 8, 12, 12, 10, 10]);
    XLSX.writeFile(wb, "FAQ_문의현황_" + D.plabel.replace(/\s/g, "") + "_" + today + ".xlsx");
    logp("faq", "export", "xlsx " + D.plabel);
  }
  async function faqExportPdf(btn){
    var el = $("#faqDash"); if (!el) return;
    var label = btn.textContent; btn.disabled = true; btn.textContent = "PDF 만드는 중…";
    var root = document.documentElement, prevTheme = root.getAttribute("data-theme");
    try {
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js");
      await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
      root.setAttribute("data-theme", "light"); el.classList.add("printing");
      await new Promise(function(r){ setTimeout(r, 120); });
      var canvas = await window.html2canvas(el, { scale: 2, backgroundColor: "#ffffff", logging: false });
      if (!canvas || !canvas.width || !canvas.height) throw new Error("화면을 캡처하지 못했습니다.");
      var pdf = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      var pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight(), mg = 10;
      var iw = pw - mg * 2, pxPerMm = canvas.width / iw, pagePx = Math.max(200, Math.floor((ph - mg * 2) * pxPerMm));
      for (var y = 0, page = 0; y < canvas.height; y += pagePx, page++){
        var h = Math.min(pagePx, canvas.height - y), part = document.createElement("canvas"); part.width = canvas.width; part.height = h;
        part.getContext("2d").drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
        if (page) pdf.addPage();
        pdf.addImage(part.toDataURL("image/jpeg", 0.9), "JPEG", mg, mg, iw, h / pxPerMm);
      }
      pdf.save("FAQ_문의현황_" + faqDash.plabel.replace(/\s/g, "") + "_" + todayStr() + ".pdf");
      logp("faq", "export", "pdf " + faqDash.plabel);
    } catch(err){ alert("PDF를 만들지 못했습니다: " + err.message); }
    finally {
      el.classList.remove("printing");
      if (prevTheme == null) root.removeAttribute("data-theme"); else root.setAttribute("data-theme", prevTheme);
      btn.disabled = false; btn.textContent = label;
    }
  }
  function goFaqList(){ if (location.hash === "#/faq/list") drawFaqPage(); else location.hash = "#/faq/list"; }
  function drawFaqPage(){
    var host = $("#fqMain"); if (!host) return;
    var w = can("home.faq", "write"), from = periodStart(faqPeriod);
    var dated = S.faq.filter(function(f){ return !!faqDate(f); });
    var inP = S.faq.filter(function(f){ var d = faqDate(f); return !from || (d && d >= from); });
    var noDate = S.faq.length - dated.length;
    var byCat = {}; inP.forEach(function(f){ var c = f.category || "미분류"; byCat[c] = (byCat[c] || 0) + 1; });
    var catRows = Object.keys(byCat).map(function(c){ return [c, byCat[c]]; }).sort(function(a, b){ return b[1] - a[1] || a[0].localeCompare(b[0]); });
    var maxC = catRows.length ? catRows[0][1] : 0;
    var now = new Date(), months = [];
    var startD = from ? parseD(from) : (dated.length ? parseD(dated.map(faqDate).sort()[0]) : new Date(now.getFullYear(), now.getMonth(), 1));
    var sm = new Date(startD.getFullYear(), startD.getMonth(), 1);
    var span = (now.getFullYear() - sm.getFullYear()) * 12 + now.getMonth() - sm.getMonth();
    if (span > 23) sm = new Date(now.getFullYear(), now.getMonth() - 23, 1);
    for (var d = new Date(sm); d <= now; d.setMonth(d.getMonth() + 1)) months.push(d.getFullYear() + "-" + pad(d.getMonth() + 1));
    var byM = {}; dated.forEach(function(f){ var k = faqDate(f).slice(0, 7); byM[k] = (byM[k] || 0) + 1; });
    var maxM = Math.max.apply(null, months.map(function(k){ return byM[k] || 0; }).concat([1]));
    var thisM = ymd(now).slice(0, 7), prevD = new Date(now.getFullYear(), now.getMonth() - 1, 1), prevM = prevD.getFullYear() + "-" + pad(prevD.getMonth() + 1);
    var cThis = byM[thisM] || 0, cPrev = byM[prevM] || 0, delta = cThis - cPrev;
    var open = S.faq.filter(function(f){ return f.status === "진행 중"; }).length;
    var byTypeP = {}; inP.forEach(function(f){ String(f.qtype || "").split(",").forEach(function(t){ t = t.trim(); if (t) byTypeP[t] = (byTypeP[t] || 0) + 1; }); });
    var topTypes = Object.keys(byTypeP).sort(function(a, b){ return byTypeP[b] - byTypeP[a]; }).slice(0, 8), maxT = topTypes.length ? byTypeP[topTypes[0]] : 0;
    var plabel = PERIODS.filter(function(p){ return p[0] === faqPeriod; })[0][1];

    var h = "";
    if (faqTab === "dash"){
    h += '<div class="rec-tools" role="group" aria-label="분석 기간">' + PERIODS.map(function(p){ return '<button class="btn sm' + (p[0] === faqPeriod ? " primary" : "") + '" data-pd="' + p[0] + '">' + p[1] + '</button>'; }).join("") +
      '<span class="grow"></span><span class="hint" style="font-size:12px">문의 날짜 기준' + (noDate ? ' · 날짜 없는 ' + noDate + '건은 기간 분석에서 제외' : '') + '</span>' +
      '<button class="btn sm" id="dPdf">⬇ PDF 다운로드</button><button class="btn sm" id="dXls">⬇ 엑셀 다운로드</button></div>';
    h += '<div id="faqDash"><div class="rpt-h"><div><b>FAQ 문의 현황</b><span>HRM팀 노무관리파트</span></div><div class="rpt-m">기간: ' + esc(plabel) + ' (' + (from || (dated.length ? dated.map(faqDate).sort()[0] : "-")) + ' ~ ' + todayStr() + ')<br>기준일 ' + todayStr() + ' · 작성 ' + esc(me.name) + '</div></div>';
    h += '<div class="kpis">' +
      '<div class="kpi"><div class="k">' + esc(plabel) + ' 문의</div><div class="v">' + inP.length + '<small>건</small></div><div class="s">전체 ' + S.faq.length + '건</div></div>' +
      '<div class="kpi"><div class="k">이번 달</div><div class="v">' + cThis + '<small>건</small></div><div class="s">지난달 ' + cPrev + '건 · ' + (delta === 0 ? "변동 없음" : (delta > 0 ? "▲ " + delta : "▼ " + (-delta)) + "건") + '</div></div>' +
      '<div class="kpi"><div class="k">가장 많은 분류</div><div class="v" style="font-size:20px;font-family:var(--font-body)">' + (catRows[0] ? esc(catRows[0][0]) : "-") + '</div><div class="s">' + (catRows[0] ? catRows[0][1] + "건 · " + Math.round(catRows[0][1] / inP.length * 100) + "%" : "") + '</div></div>' +
      '<div class="kpi"><div class="k">진행 중</div><div class="v">' + open + '<small>건</small></div><div class="s">' + (open ? '<a href="#" id="kOpen">진행 중인 문의 보기</a>' : "모두 완료") + '</div></div></div>';
    h += '<div class="an-grid"><section class="panel" style="margin-top:0"><div class="panel-head"><div><h2>카테고리별 문의 비율</h2><div class="desc">' + esc(plabel) + ' · ' + inP.length + '건</div></div></div>' +
      (catRows.length ? '<div class="hbars">' + catRows.map(function(r){ var pct = inP.length ? Math.round(r[1] / inP.length * 1000) / 10 : 0;
        return '<button class="hb' + (faqCat === r[0] ? " on" : "") + '" data-hc="' + esc(r[0]) + '" title="' + esc(r[0]) + ': ' + r[1] + '건 (' + pct + '%) · 눌러서 목록 거르기"><span class="hl">' + esc(r[0]) + '</span><span class="ht"><i style="width:' + Math.max(2, r[1] / maxC * 100) + '%"></i></span><span class="hv"><b>' + r[1] + '</b>건 · ' + pct + '%</span></button>'; }).join("") + '</div>'
        : '<p class="hint">이 기간에 문의가 없습니다.</p>') +
      (topTypes.length ? '<h3 style="font-size:13.5px;margin:16px 0 6px">많이 묻는 유형 (상위 8)</h3><div class="hbars">' + topTypes.map(function(t){ return '<button class="hb' + (faqType === t ? " on" : "") + '" data-ht="' + esc(t) + '" title="' + esc(t) + ': ' + byTypeP[t] + '건 · 눌러서 목록 거르기"><span class="hl">' + esc(t) + '</span><span class="ht"><i style="width:' + Math.max(2, byTypeP[t] / maxT * 100) + '%"></i></span><span class="hv"><b>' + byTypeP[t] + '</b>건</span></button>'; }).join("") + '</div>' : '') + '</section>' +
      '<section class="panel" style="margin-top:0"><div class="panel-head"><div><h2>기간별 문의 건수</h2><div class="desc">월별 · ' + months[0] + ' ~ ' + months[months.length - 1] + '</div></div></div>' +
      '<div class="cols" style="--n:' + months.length + '">' + months.map(function(k){ var v = byM[k] || 0;
        return '<div class="col" title="' + k + ': ' + v + '건"><span class="cv2">' + (v || "") + '</span><i style="height:' + (v / maxM * 100) + '%"></i><span class="cl">' + (k.slice(5) === "01" || k === months[0] ? k.slice(2, 4) + "." : "") + +k.slice(5) + '월</span></div>'; }).join("") + '</div></section></div>';
    }
    // 반복·특수 문의 추이 (월별)
    var rs = months.map(function(k){ var l = dated.filter(function(f){ return faqDate(f).slice(0, 7) === k; }); var r = l.filter(function(f){ return srcOf(f) === "반복 문의"; }).length; return { k: k, rep: r, sp: l.length - r, n: l.length }; });
    function share(arr){ var n = 0, r = 0; arr.forEach(function(x){ n += x.n; r += x.rep; }); return n ? r / n * 100 : null; }
    var last3 = share(rs.slice(-3)), prev3 = share(rs.slice(-6, -3));
    var repAll = inP.filter(function(f){ return srcOf(f) === "반복 문의"; }).length;
    function trendTxt(cur, prev, label){ if (cur == null) return label + " 데이터 없음"; if (prev == null) return label + " " + Math.round(cur) + "% (비교할 직전 기간 없음)"; var d = Math.round((cur - prev) * 10) / 10; return label + " " + Math.round(cur) + "% · 직전 3개월 " + Math.round(prev) + "% 대비 " + (d === 0 ? "변동 없음" : (d > 0 ? '<b class="up">▲ ' + d + '%p 증가</b>' : '<b class="down">▼ ' + (-d) + '%p 감소</b>')); }
    var maxN = Math.max.apply(null, rs.map(function(x){ return x.n; }).concat([1]));
    faqDash = { plabel: plabel, from: from, inP: inP, total: S.faq.length, cThis: cThis, cPrev: cPrev, open: open, catRows: catRows, byTypeP: byTypeP, rs: rs, last3: last3, prev3: prev3, repAll: repAll, noDate: noDate };
    if (faqTab === "dash")
    h += '<section class="panel"><div class="panel-head"><div><h2>반복 문의 · 특수 문의 추이</h2><div class="desc">' + esc(plabel) + ' 반복 ' + repAll + '건 · 특수 ' + (inP.length - repAll) + '건' + (inP.length ? ' (반복 ' + Math.round(repAll / inP.length * 100) + '%)' : '') + '</div></div>' +
      '<div class="legend"><span class="lg rep"></span>반복 문의<span class="lg sp"></span>특수 문의</div></div>' +
      '<div class="trend-note">' + trendTxt(last3, prev3, "최근 3개월 반복 문의 비율") + '<br>' + trendTxt(last3 == null ? null : 100 - last3, prev3 == null ? null : 100 - prev3, "최근 3개월 특수 문의 비율") + '</div>' +
      '<div class="cols stack" style="--n:' + rs.length + '">' + rs.map(function(x){
        var tip = x.k + ": 반복 " + x.rep + "건 · 특수 " + x.sp + "건" + (x.n ? " (반복 " + Math.round(x.rep / x.n * 100) + "%)" : "");
        return '<div class="col" title="' + tip + '"><span class="cv2">' + (x.n ? Math.round(x.rep / x.n * 100) + "%" : "") + '</span><div class="stk" style="height:' + (x.n / maxN * 100) + '%"><i class="sp" style="flex:' + x.sp + '"></i><i class="rep" style="flex:' + x.rep + '"></i></div><span class="cl">' + (x.k.slice(5) === "01" || x.k === rs[0].k ? x.k.slice(2, 4) + "." : "") + +x.k.slice(5) + '월</span></div>'; }).join("") + '</div>' +
      '<p class="hint" style="font-size:11.5px;margin:6px 0 0">막대 높이 = 월별 전체 문의 건수, 막대 위 % = 그 달의 반복 문의 비율. 반복 문의 비율이 늘면 FAQ로 해결할 수 있는 문의가 많다는 뜻입니다.</p>' +
      '<div class="scrollx" style="margin-top:10px"><table class="tbl" style="min-width:0"><thead><tr><th>월</th>' + rs.map(function(x){ return '<th class="n">' + +x.k.slice(5) + '월</th>'; }).join("") + '</tr></thead><tbody>' +
      '<tr><td>반복</td>' + rs.map(function(x){ return '<td class="n">' + x.rep + '</td>'; }).join("") + '</tr><tr><td>특수</td>' + rs.map(function(x){ return '<td class="n">' + x.sp + '</td>'; }).join("") + '</tr>' +
      '<tr><td>반복 비율</td>' + rs.map(function(x){ return '<td class="n">' + (x.n ? Math.round(x.rep / x.n * 100) + "%" : "-") + '</td>'; }).join("") + '</tr></tbody></table></div></section></div>';
    var cats = ["전체"]; S.faq.forEach(function(f){ if (f.category && cats.indexOf(f.category) < 0) cats.push(f.category); });
    var answerers = ["이혜린", "김고은", "김보결", "전현주"];
    function filtered(){ var q = faqQ.trim(); return sortFaq(S.faq.filter(function(f){ return (faqCat === "전체" || f.category === faqCat) && (!faqSrc || srcOf(f) === faqSrc) && (!faqKind || f.kind === faqKind) && (!faqStatus || (f.status || "완료") === faqStatus) && (!faqAns || String(f.answerer || "").split(",").map(function(s){ return s.trim(); }).indexOf(faqAns) >= 0) &&
      (!faqType || String(f.qtype || "").split(",").map(function(t){ return t.trim(); }).indexOf(faqType) >= 0) &&
      (!q || [f.question, f.answer, f.detail, f.asker_name, f.asker_dept, f.qtype].join(" ").indexOf(q) >= 0); })); }
    function rowsHtml(list){ return list.length ? list.map(function(f){
        return '<tr class="clk" data-fid="' + esc(f.id) + '" tabindex="0"><td>' + srcBadge(f) + '</td><td class="fq-t">' + (f.caution ? '<span class="badge danger" style="font-size:10px">주의</span> ' : '') + esc(f.question) + ((f.images || []).length ? ' <span title="첨부 이미지 ' + f.images.length + '장">🖼</span>' : '') + '</td><td class="fq-ty">' + esc(f.qtype || "") + '</td><td>' + asker(f) + '</td>' +
          '<td>' + esc(f.asked_on || "") + '</td><td>' + esc(f.done_on || "") + '</td><td>' + statusBadge(f.status) + '</td><td>' + (f.answerer ? chip(f.answerer) : "") + '</td></tr>';
      }).join("") : '<tr><td colspan="8" class="hint" style="padding:18px">해당하는 FAQ가 없습니다.</td></tr>'; }
    var list = filtered();
    if (faqTab === "list")
    h += '<section class="panel" style="margin-top:0"><div class="panel-head"><div><h2>FAQ 목록</h2><div class="desc"><span id="fqCnt">' + list.length + '</span>건 · 행을 누르면 문의 내용과 답변이 열립니다</div></div>' +
      '<div class="rec-tools" style="margin:0"><select id="fsrcSel"><option value="">반복·특수 전체</option>' + FAQ_SRC.map(function(s){ return '<option' + (s === faqSrc ? " selected" : "") + '>' + s + '</option>'; }).join("") + '</select><select id="ftSel"><option value="">전체 유형</option>' + FAQ_TYPES.map(function(t){ return '<option' + (t === faqType ? " selected" : "") + '>' + t + '</option>'; }).join("") + '</select>' +
      '<select id="fsSel"><option value="">전체 진행현황</option>' + FAQ_STATUS.map(function(s){ return '<option' + (s === faqStatus ? " selected" : "") + '>' + s + '</option>'; }).join("") + '</select>' +
      '<select id="faSel"><option value="">전체 답변자</option>' + answerers.map(function(s){ return '<option' + (s === faqAns ? " selected" : "") + '>' + esc(s) + '</option>'; }).join("") + '</select>' +
      '<select id="fkSel"><option value="">반복 세부 구분</option>' + ["단순 반복", "개별 판단", "FAQ 미수록"].map(function(k){ return '<option' + (k === faqKind ? " selected" : "") + '>' + k + '</option>'; }).join("") + '</select>' +
      '<input type="search" id="fpq" placeholder="질문·답변·질문자 검색" value="' + esc(faqQ) + '"><button class="btn sm" id="fpCsv">CSV</button>' + (w ? '<button class="btn sm primary" id="fpAdd">+ FAQ 추가</button>' : '') + '</div></div>' +
      '<div class="faq-tabs">' + cats.map(function(c){ return '<button data-fc="' + esc(c) + '" class="' + (c === faqCat ? "on" : "") + '">' + esc(c) + '</button>'; }).join("") + '</div>' +
      '<div class="tbl-box" style="max-height:640px"><table class="rec compact faq-tbl"><thead><tr><th>문의 구분</th><th>질문</th><th>유형</th><th>질문자 (이름/소속/직책)</th><th>문의날짜</th><th>완료날짜</th><th>진행현황</th><th>답변자</th></tr></thead><tbody id="fqBody">' +
      rowsHtml(list) + '</tbody></table></div></section>';
    host.innerHTML = h;
    function redraw(){ drawFaqPage(); }
    $all("[data-pd]", host).forEach(function(b){ b.onclick = function(){ faqPeriod = b.dataset.pd; redraw(); }; });
    $all("[data-hc]", host).forEach(function(b){ b.onclick = function(){ faqCat = b.dataset.hc; goFaqList(); }; });
    $all("[data-ht]", host).forEach(function(b){ b.onclick = function(){ faqType = b.dataset.ht; goFaqList(); }; });
    $all("[data-fc]", host).forEach(function(b){ b.onclick = function(){ faqCat = b.dataset.fc; redraw(); }; });
    if ($("#kOpen")) $("#kOpen").onclick = function(e){ e.preventDefault(); faqStatus = "진행 중"; goFaqList(); };
    if ($("#dXls")) $("#dXls").onclick = faqExportExcel;
    if ($("#dPdf")) $("#dPdf").onclick = function(){ faqExportPdf(this); };
    if (faqTab !== "list") return;
    $("#ftSel").onchange = function(e){ faqType = e.target.value; redraw(); };
    $("#fsrcSel").onchange = function(e){ faqSrc = e.target.value; redraw(); };
    $("#fsSel").onchange = function(e){ faqStatus = e.target.value; redraw(); };
    $("#faSel").onchange = function(e){ faqAns = e.target.value; redraw(); };
    $("#fkSel").onchange = function(e){ faqKind = e.target.value; redraw(); };
    $("#fpq").addEventListener("input", function(e){ faqQ = e.target.value; list = filtered(); $("#fqBody").innerHTML = rowsHtml(list); $("#fqCnt").textContent = list.length; wireRows(); });
    $("#fpCsv").onclick = function(){ downloadCsv("FAQ", [["문의 구분", function(f){ return srcOf(f); }], ["질문", function(f){ return f.question; }], ["유형", function(f){ return f.qtype; }], ["분류", function(f){ return f.category; }], ["구분", function(f){ return f.kind; }], ["질문자", function(f){ return f.asker_name; }], ["소속", function(f){ return f.asker_dept; }], ["직책", function(f){ return f.asker_title; }], ["문의수단", function(f){ return f.channel; }], ["문의날짜", function(f){ return f.asked_on; }], ["완료날짜", function(f){ return f.done_on; }], ["진행현황", function(f){ return f.status; }], ["답변자", function(f){ return f.answerer; }], ["주의", function(f){ return f.caution ? "Y" : ""; }], ["문의 내용", function(f){ return f.detail; }], ["답변", function(f){ return f.answer; }]], list); };
    if ($("#fpAdd")) $("#fpAdd").onclick = function(){ openFaq(null, redraw); };
    function wireRows(){ $all("#fqBody tr[data-fid]").forEach(function(tr){ function o(){ faqDetail(S.faq.filter(function(f){ return f.id === tr.dataset.fid; })[0], redraw); } tr.onclick = o; tr.onkeydown = function(e){ if (e.key === "Enter") o(); }; }); }
    wireRows();
  }

  /* =====================================================================
     CATEGORY
     ===================================================================== */
  function renderCategory(c, menu, sub){
    var menus = c.menus.filter(function(m){ return level(c.id + "." + m[0]) >= 1; });
    if (!menus.length){ location.hash = "#/"; return; }
    if (!menu || !menus.some(function(m){ return m[0] === menu; })) menu = menus[0][0];
    var head = '<div class="cat-head"><div class="crumb"><a href="#/">홈</a> › ' + esc(c.name) + '</div><h1><span>' + c.ic + '</span>' + esc(c.name) + '</h1>' +
      '<nav class="tabs">' + menus.map(function(m){ var l = level(c.id + "." + m[0]); return '<a href="#/c/' + c.id + '/' + m[0] + '" class="' + (m[0] === menu ? "on" : "") + '">' + esc(m[1]) + '<span class="lv">' + LV_LABEL[Object.keys(LV)[l]] + '</span></a>'; }).join("") + '</nav></div>';
    var key = c.id + "." + menu;
    if (menu === "manual"){ app.innerHTML = shell(head + '<div class="cat-wrap" id="cw"></div>', c.name); renderManual(c, key, sub); }
    else if (c.id === "att" && menu === "worktypes"){ app.innerHTML = shell(head + '<div class="cat-wrap"><div class="cat-main" id="cm"></div></div>', c.name); renderWorktypes(c, sub === "exceptions" ? "exceptions" : "worktypes"); }
    else if (c.id === "att" && menu === "violations"){ app.innerHTML = shell(head + '<div class="cat-wrap"><div class="cat-main" id="cm"></div></div>', c.name); renderViol(c, sub); }
    else {
      app.innerHTML = shell(head + '<div class="cat-wrap"><div class="cat-main"><div class="soon-box"><div class="ic">' + c.ic + '</div><h2>' + esc(c.name) + ' 메뉴는 준비 중입니다</h2>' +
        '<p>근태 카테고리와 같은 틀(상단 메뉴 · 왼쪽 절차 · 관리표)로 이어서 구성할 예정입니다.</p>' +
        (c.src ? '<p class="hint" style="margin-top:16px">옮겨 올 노션 원문</p><ul>' + c.src.map(function(s){ return '<li>' + esc(s) + '</li>'; }).join("") + '</ul>' : '') +
        (c.link ? '<p><a class="btn primary" href="' + c.link + '" target="_blank" rel="noopener">근로감독 대시보드 열기 ↗</a></p>' : '') + '</div></div></div>', c.name);
    }
    wireShell();
  }

  /* ---------- manual (pages) ---------- */
  var manualEditing = false, tocEditing = false, tocDraft = null;
  function manualPages(c){ return S.pages.filter(function(p){ return p.cat === c.id && p.menu === "manual"; }).sort(function(a, b){ return a.grp_sort - b.grp_sort || a.sort - b.sort; }); }
  function groupNames(list){ var g = []; list.forEach(function(p){ if (g.indexOf(p.grp) < 0) g.push(p.grp); }); return g; }
  // display order: group → top-level page → its sub-pages. Sub-pages always follow their parent's group.
  function normalizeDraft(d){
    var ids = {}; d.forEach(function(x){ ids[x.id] = x; });
    d.forEach(function(x){ if (x.parent && (!ids[x.parent] || ids[x.parent].parent)) x.parent = null; if (x.parent) x.grp = ids[x.parent].grp; });
    var out = [];
    groupNames(d.filter(function(x){ return !x.parent; }).concat(d.filter(function(x){ return x.parent; }))).forEach(function(g){
      d.forEach(function(x){ if (x.grp === g && !x.parent){ out.push(x); d.forEach(function(y){ if (y.parent === x.id) out.push(y); }); } });
    });
    return out;
  }
  function flatPages(list){ return normalizeDraft(list.map(function(p){ return { id: p.id, grp: p.grp, parent: p.parent || null, title: p.title, ref: p }; })).map(function(x){ return x.ref; }); }
  // ordered: [{id, grp, parent, title?}] → writes grp / grp_sort / sort / parent (/ title) for rows that changed
  async function saveOrder(ordered){
    ordered = normalizeDraft(ordered);
    var gOrder = groupNames(ordered), cnt = {}, todo = [];
    ordered.forEach(function(o){
      cnt[o.grp] = (cnt[o.grp] || 0) + 1;
      var p = S.pages.filter(function(x){ return x.id === o.id; })[0]; if (!p) return;
      var v = { grp: o.grp, grp_sort: (gOrder.indexOf(o.grp) + 1) * 10, sort: cnt[o.grp], parent: o.parent || null };
      if (o.title && o.title !== p.title) v.title = o.title;
      if (p.grp !== v.grp || p.grp_sort !== v.grp_sort || p.sort !== v.sort || (p.parent || null) !== v.parent || v.title) todo.push([p, v]);
    });
    for (var i = 0; i < todo.length; i++){
      var r = await sb.from("portal_pages").update(todo[i][1]).eq("id", todo[i][0].id).select("id");
      if (r.error || !r.data || !r.data.length){ alert("목차를 저장하지 못했습니다: " + errMsg(r)); return false; }
      Object.assign(todo[i][0], todo[i][1]);
    }
    S.pages.sort(function(a, b){ return a.grp_sort - b.grp_sort || a.sort - b.sort; });
    if (todo.length) logp("pages", "order", todo.length + "건");
    return true;
  }
  // position controls for the page editor and "문서 추가": group / 상위 목차 / 순서
  function posControls(list, curGrp){
    return '<div class="pos-row"><span class="hint">목차 위치</span><select id="posGrp">' + groupNames(list).map(function(g){ return '<option' + (g === curGrp ? " selected" : "") + '>' + esc(g) + '</option>'; }).join("") + '<option value="__new">+ 새 그룹…</option></select>' +
      '<select id="posPar" title="상위 목차"></select><select id="posAfter" title="순서"></select></div>';
  }
  function wirePos(root, list, self, cur){
    var gs = $("#posGrp", root), ps = $("#posPar", root), af = $("#posAfter", root);
    var hasKids = self && list.some(function(p){ return p.parent === self.id; });
    function fillPar(sel){
      var tops = list.filter(function(p){ return p.grp === gs.value && !p.parent && (!self || p.id !== self.id); });
      ps.innerHTML = '<option value="">상위 목차 없음(1단계)</option>' + (hasKids ? "" : tops.map(function(p){ return '<option value="' + esc(p.id) + '">' + esc(p.title) + ' 아래(2단계)</option>'; }).join(""));
      ps.value = sel && tops.some(function(p){ return p.id === sel; }) && !hasKids ? sel : "";
    }
    function fillAfter(sel){
      var sibs = list.filter(function(p){ return p.grp === gs.value && (p.parent || "") === ps.value && (!self || p.id !== self.id); });
      af.innerHTML = '<option value="__first">맨 앞</option>' + sibs.map(function(p){ return '<option value="' + esc(p.id) + '">' + esc(p.title) + ' 다음</option>'; }).join("");
      af.value = sel === "__first" ? "__first" : sel && sibs.some(function(p){ return p.id === sel; }) ? sel : (sibs.length ? sibs[sibs.length - 1].id : "__first");
    }
    gs.addEventListener("change", function(){
      if (gs.value === "__new"){
        var n = (window.prompt("새 그룹 이름", "") || "").trim();
        if (!n){ gs.selectedIndex = 0; fillPar(); fillAfter(); return; }
        var o = document.createElement("option"); o.textContent = n; gs.insertBefore(o, gs.lastChild); gs.value = n;
      }
      fillPar(); fillAfter();
    });
    ps.addEventListener("change", function(){ fillAfter(); });
    fillPar(cur && cur.parent); fillAfter(cur && cur.after);
    return function(){ return { grp: gs.value, parent: ps.value || null, after: af.value }; };
  }
  function orderWith(list, id, pos){
    var d = normalizeDraft(list.map(function(p){ return { id: p.id, grp: p.grp, parent: p.parent || null }; }));
    var me2 = d.filter(function(x){ return x.id === id; })[0] || { id: id }, kids = d.filter(function(x){ return x.parent === id; });
    d = d.filter(function(x){ return x.id !== id && x.parent !== id; });
    me2.grp = pos.grp; me2.parent = pos.parent || null; kids.forEach(function(k){ k.grp = pos.grp; });
    var sibs = d.filter(function(x){ return x.grp === pos.grp && (x.parent || null) === me2.parent; }), idx;
    if (pos.after === "__first" || !sibs.length){
      if (sibs.length) idx = d.indexOf(sibs[0]);
      else if (me2.parent){ idx = d.findIndex(function(x){ return x.id === me2.parent; }) + 1; }
      else { var last = -1; d.forEach(function(x, i){ if (x.grp === pos.grp) last = i; }); idx = last < 0 ? d.length : last + 1; }
    } else {
      idx = d.findIndex(function(x){ return x.id === pos.after; });
      idx = idx < 0 ? d.length : idx + 1;
      while (idx < d.length && d[idx].parent && d[idx].parent === pos.after) idx++;
    }
    d.splice.apply(d, [idx, 0, me2].concat(kids));
    return d;
  }
  function menuLabel(c){ var m = c.menus.filter(function(x){ return x[0] === "manual"; })[0]; return m ? m[1] : c.name + " 매뉴얼"; }
  function tocSide(c, key, list, page){
    var groups = groupNames(list), ed = can(key, "edit");
    if (tocEditing && ed){
      var d = tocDraft, dg = groupNames(d);
      return '<aside class="side toc-edit"><div class="side-title">목차 편집</div><p class="hint" style="font-size:12px;padding:0 10px">↑↓ 순서, → 하위 목차로 넣기, ← 꺼내기, ✎ 이름 바꾸기. 다 바꾼 뒤 저장하세요.</p>' + dg.map(function(g, gi){
        var items = d.filter(function(x){ return x.grp === g; });
        return '<div class="te-g"><div class="te-gh"><b>' + esc(g) + '</b><span><button class="ib" data-gu="' + gi + '" title="그룹 위로"' + (gi ? "" : " disabled") + '>↑</button><button class="ib" data-gd="' + gi + '" title="그룹 아래로"' + (gi < dg.length - 1 ? "" : " disabled") + '>↓</button><button class="ib" data-gr="' + gi + '" title="그룹 이름 바꾸기">✎</button></span></div>' +
          items.map(function(x){
            var sibs = items.filter(function(y){ return (y.parent || null) === (x.parent || null); }), si = sibs.indexOf(x);
            var canIn = !x.parent && si > 0 && !d.some(function(y){ return y.parent === x.id; });
            return '<div class="te-p' + (x.parent ? " sub" : "") + '"><span class="t">' + esc(x.title) + '</span><span class="ctl">' +
              '<button class="ib" data-pu="' + esc(x.id) + '" title="위로"' + (si > 0 ? "" : " disabled") + '>↑</button><button class="ib" data-pd="' + esc(x.id) + '" title="아래로"' + (si < sibs.length - 1 ? "" : " disabled") + '>↓</button>' +
              '<button class="ib" data-pin="' + esc(x.id) + '" title="바로 위 문서의 하위 목차로"' + (canIn ? "" : " disabled") + '>→</button><button class="ib" data-pout="' + esc(x.id) + '" title="하위 목차에서 꺼내기"' + (x.parent ? "" : " disabled") + '>←</button>' +
              '<button class="ib" data-pr="' + esc(x.id) + '" title="목차 이름 바꾸기">✎</button>' +
              (x.parent ? '' : '<select data-pg="' + esc(x.id) + '" title="그룹 옮기기">' + dg.map(function(n){ return '<option' + (n === g ? " selected" : "") + '>' + esc(n) + '</option>'; }).join("") + '<option value="__new">+ 새 그룹…</option></select>') + '</span></div>';
          }).join("") + '</div>';
      }).join("") + '<div style="display:flex;gap:6px;padding:12px 10px"><button class="btn sm ghost" id="teNo">취소</button><button class="btn sm primary" id="teOk">저장</button></div></aside>';
    }
    return '<aside class="side"><div class="side-title">' + esc(menuLabel(c)) + '</div>' + groups.map(function(g){
      var inG = list.filter(function(p){ return p.grp === g; });
      var open = inG.some(function(p){ return p.id === page.id; }) || g === groups[0];
      function a(p, cls){ return '<a href="#/c/' + c.id + '/manual/' + encodeURIComponent(p.id) + '" class="' + cls + (p.id === page.id ? " on" : "") + '">' + esc(p.title) + '</a>'; }
      return '<div class="grp' + (open ? " open" : "") + '"><button class="grp-h" type="button">' + esc(g) + '<span class="chev">▶</span></button><ul>' +
        inG.filter(function(p){ return !p.parent; }).map(function(p){
          var kids = inG.filter(function(k){ return k.parent === p.id; });
          return '<li>' + a(p, "") + (kids.length ? '<ul class="sub">' + kids.map(function(k){ return '<li>' + a(k, "s2") + '</li>'; }).join("") + '</ul>' : '') + '</li>';
        }).join("") + '</ul></div>';
    }).join("") + '<div style="padding:12px 10px;display:flex;gap:6px;flex-wrap:wrap">' + (ed ? '<button class="btn sm" id="tocEdit">↕ 목차 편집</button>' : '') + (can(key, "manage") ? '<button class="btn sm" id="pgAdd">+ 문서 추가</button>' : '') + '</div></aside>';
  }
  function wireTocEdit(c, key, page){
    var host = $("#cw");
    function re(){ tocDraft = normalizeDraft(tocDraft); renderManual(c, key, page.id); }
    function item(id){ return tocDraft.filter(function(x){ return x.id === id; })[0]; }
    function swap(id, dir){
      var d = tocDraft, x = item(id), sibs = d.filter(function(y){ return y.grp === x.grp && (y.parent || null) === (x.parent || null); }), i = sibs.indexOf(x), o = sibs[i + dir];
      if (!o) return; var a = d.indexOf(x), b = d.indexOf(o); d[a] = o; d[b] = x; re();
    }
    function moveGroup(gi, dir){
      var gs = groupNames(tocDraft), a = gs[gi], b = gs[gi + dir]; if (!b) return; gs[gi] = b; gs[gi + dir] = a;
      var out = []; gs.forEach(function(n){ tocDraft.forEach(function(x){ if (x.grp === n) out.push(x); }); }); tocDraft = out; renderManual(c, key, page.id);
    }
    $all("[data-pu]", host).forEach(function(b){ b.onclick = function(){ swap(b.dataset.pu, -1); }; });
    $all("[data-pd]", host).forEach(function(b){ b.onclick = function(){ swap(b.dataset.pd, 1); }; });
    $all("[data-pin]", host).forEach(function(b){ b.onclick = function(){
      var x = item(b.dataset.pin), sibs = tocDraft.filter(function(y){ return y.grp === x.grp && !y.parent; }), prev = sibs[sibs.indexOf(x) - 1]; if (!prev) return;
      x.parent = prev.id; tocDraft.splice(tocDraft.indexOf(x), 1); var last = tocDraft.indexOf(prev); tocDraft.forEach(function(y, i){ if (y.parent === prev.id) last = i; }); tocDraft.splice(last + 1, 0, x); re(); }; });
    $all("[data-pout]", host).forEach(function(b){ b.onclick = function(){
      var x = item(b.dataset.pout), par = x.parent; x.parent = null; tocDraft.splice(tocDraft.indexOf(x), 1);
      var last = tocDraft.findIndex(function(y){ return y.id === par; }); tocDraft.forEach(function(y, i){ if (y.parent === par) last = i; }); tocDraft.splice(last + 1, 0, x); re(); }; });
    $all("[data-pr]", host).forEach(function(b){ b.onclick = function(){ var x = item(b.dataset.pr), n = (window.prompt("목차 이름", x.title) || "").trim(); if (!n || n === x.title) return; x.title = n; re(); }; });
    $all("[data-gu]", host).forEach(function(b){ b.onclick = function(){ moveGroup(+b.dataset.gu, -1); }; });
    $all("[data-gd]", host).forEach(function(b){ b.onclick = function(){ moveGroup(+b.dataset.gd, 1); }; });
    $all("[data-gr]", host).forEach(function(b){ b.onclick = function(){
      var old = groupNames(tocDraft)[+b.dataset.gr], n = (window.prompt("그룹 이름", old) || "").trim(); if (!n || n === old) return;
      tocDraft.forEach(function(x){ if (x.grp === old) x.grp = n; }); re(); }; });
    $all("[data-pg]", host).forEach(function(s){ s.onchange = function(){
      var x = item(s.dataset.pg), v = s.value;
      if (v === "__new"){ v = (window.prompt("새 그룹 이름", "") || "").trim(); if (!v){ re(); return; } }
      var moving = [x].concat(tocDraft.filter(function(y){ return y.parent === x.id; }));
      tocDraft = tocDraft.filter(function(y){ return moving.indexOf(y) < 0; }); moving.forEach(function(y){ y.grp = v; });
      var last = -1; tocDraft.forEach(function(y, i){ if (y.grp === v) last = i; }); tocDraft.splice.apply(tocDraft, [last < 0 ? tocDraft.length : last + 1, 0].concat(moving)); re(); }; });
    $("#teNo").onclick = function(){ tocEditing = false; tocDraft = null; renderManual(c, key, page.id); };
    $("#teOk").onclick = async function(){ var ok = await saveOrder(tocDraft); if (!ok) return; tocEditing = false; tocDraft = null; toast("목차를 저장했습니다."); renderManual(c, key, page.id); };
  }
  async function renderManual(c, key, pid){
    var host = $("#cw"), pages = flatPages(manualPages(c));
    if (!pages.length){ host.innerHTML = '<div class="cat-main"><p class="hint">등록된 매뉴얼이 없습니다.</p>' + (can(key, "manage") ? '<button class="btn sm" id="pgAdd">+ 문서 추가</button>' : '') + '</div>'; if ($("#pgAdd")) $("#pgAdd").onclick = function(){ addPage(c, pages, "업무 개요"); }; return; }
    var page = pages.filter(function(p){ return p.id === pid; })[0] || pages[0];
    var parent = page.parent ? pages.filter(function(p){ return p.id === page.parent; })[0] : null;
    host.innerHTML = tocSide(c, key, pages, page) + '<div class="cat-main"><div class="doc-wrap"><article class="doc" id="docA"><p class="hint">불러오는 중…</p></article><nav class="toc-r" id="tocR"></nav></div></div>';
    $all(".grp-h", host).forEach(function(b){ b.onclick = function(){ b.parentNode.classList.toggle("open"); }; });
    if ($("#pgAdd")) $("#pgAdd").onclick = function(){ addPage(c, pages, page.grp, page.parent || page.id); };
    if ($("#tocEdit")) $("#tocEdit").onclick = function(){ tocEditing = true; tocDraft = pages.map(function(p){ return { id: p.id, grp: p.grp, parent: p.parent || null, title: p.title }; }); renderManual(c, key, page.id); };
    if (tocEditing && $("#teOk")) wireTocEdit(c, key, page);
    if (page.body_html == null){
      var r = await sb.from("portal_pages").select("body_html").eq("id", page.id).maybeSingle();
      page.body_html = (r.data && r.data.body_html) || "";
    }
    if (!$("#docA")) return;
    var idx = pages.indexOf(page), prev = pages[idx - 1], next = pages[idx + 1];
    var kids = pages.filter(function(p){ return p.parent === page.id; });
    var art = $("#docA"), ed = can(key, "edit");
    var crumb = esc(c.name) + ' › ' + esc(menuLabel(c)) + ' › ' + esc(page.grp) + (parent ? ' › <a href="#/c/' + c.id + '/manual/' + encodeURIComponent(parent.id) + '">' + esc(parent.title) + '</a>' : '');
    if (manualEditing && ed){
      var sibs = pages.filter(function(p){ return p.grp === page.grp && (p.parent || null) === (page.parent || null); }), si = sibs.indexOf(page);
      var cur = { parent: page.parent || null, after: si > 0 ? sibs[si - 1].id : "__first" };
      art.innerHTML = '<div class="crumb">' + crumb + ' · 편집 중</div>' + editorBar() + posControls(pages, page.grp) +
        '<p class="ed-hint">제목·요약·본문을 화면에서 바로 고칩니다. 제목을 바꾸면 목차 이름도 바뀝니다. 「링크」로 포털 안 다른 메뉴·문서도 연결할 수 있습니다.</p>' +
        '<h1 id="edTitle" contenteditable="true">' + esc(page.title) + '</h1><p class="lead" id="edLead" contenteditable="true">' + esc(page.lead || "") + '</p>' +
        '<div id="edBody" class="body" contenteditable="true">' + cleanHtml(page.body_html) + '</div><textarea id="edHtml" class="ed-html" style="display:none"></textarea>' +
        '<div class="modal-actions" style="margin-top:24px">' + (can(key, "manage") ? '<button class="btn danger" id="pgDel" style="margin-right:auto">문서 삭제</button>' : '') + '<button class="btn ghost" id="pgNo">취소</button><button class="btn primary" id="pgOk">저장</button></div>';
      var getPos = wirePos(art, pages, page, cur);
      var st = wireEditor(art, function(){ window.__editDirty = true; });
      [$("#edTitle"), $("#edLead")].forEach(function(x){ x.addEventListener("input", function(){ st.dirty = true; window.__editDirty = true; }); x.addEventListener("keydown", function(e){ if (e.key === "Enter") e.preventDefault(); }); });
      $("#pgNo").onclick = function(){ if (st.dirty && !confirm("수정한 내용을 저장하지 않고 닫을까요?")) return; manualEditing = false; window.__editDirty = false; renderManual(c, key, page.id); };
      $("#pgOk").onclick = async function(){
        var upd = { title: $("#edTitle").textContent.trim() || page.title, lead: $("#edLead").textContent.trim(), body_html: st.getHtml(), updated_by: me.email, updated_at: new Date().toISOString() };
        var x = await sb.from("portal_pages").update(upd).eq("id", page.id).select("id");
        if (x.error || !x.data || !x.data.length){ alert("저장하지 못했습니다: " + errMsg(x)); return; }
        Object.assign(page, upd);
        var pos = getPos();
        if (pos.grp !== page.grp || (pos.parent || null) !== (page.parent || null) || pos.after !== cur.after){ if (!(await saveOrder(orderWith(pages, page.id, pos)))) return; }
        logp("pages", "edit", page.title); manualEditing = false; window.__editDirty = false; toast("매뉴얼을 저장했습니다."); renderManual(c, key, page.id);
      };
      if ($("#pgDel")) $("#pgDel").onclick = async function(){
        if (kids.length){ alert("하위 목차(" + kids.length + "개)가 있는 문서는 삭제할 수 없습니다. 하위 문서를 먼저 옮기거나 삭제하세요."); return; }
        if (!confirm("'" + page.title + "' 문서를 삭제할까요? 되돌릴 수 없습니다.")) return;
        var x = await sb.from("portal_pages").delete().eq("id", page.id).select("id");
        if (x.error || !x.data || !x.data.length){ alert("삭제하지 못했습니다: " + errMsg(x)); return; }
        S.pages = S.pages.filter(function(p){ return p.id !== page.id; }); manualEditing = false; window.__editDirty = false; location.hash = "#/c/" + c.id + "/manual";
      };
      return;
    }
    art.innerHTML = '<div class="crumb">' + crumb + '</div><h1>' + esc(page.title) + '</h1>' +
      (page.lead ? '<p class="lead">' + esc(page.lead) + '</p>' : '') +
      '<div class="meta-line"><span class="tag b">' + esc(page.grp) + '</span>' + (page.updated_by ? '<span class="hint" style="font-size:12px">최종 수정 ' + esc(String(page.updated_at || "").slice(0, 10)) + ' · ' + esc(page.updated_by) + '</span>' : '') +
      (ed ? '<button class="btn sm" id="pgEdit" style="margin-left:auto">✎ 이 문서 수정</button>' : '') + '</div>' +
      '<div class="body">' + cleanHtml(page.body_html) + '</div>' +
      (kids.length ? '<div class="kid-cards"><h3>하위 목차</h3>' + kids.map(function(k){ return '<a href="#/c/' + c.id + '/manual/' + encodeURIComponent(k.id) + '"><b>' + esc(k.title) + '</b>' + (k.lead ? '<span>' + esc(k.lead) + '</span>' : '') + '</a>'; }).join("") + '</div>' : '') +
      '<div class="pn">' + (prev ? '<a href="#/c/' + c.id + '/manual/' + encodeURIComponent(prev.id) + '"><small>이전</small>' + esc(prev.title) + '</a>' : '<span></span>') +
      (next ? '<a class="nx" href="#/c/' + c.id + '/manual/' + encodeURIComponent(next.id) + '"><small>다음</small>' + esc(next.title) + '</a>' : '') + '</div>';
    if ($("#pgEdit")) $("#pgEdit").onclick = function(){ manualEditing = true; tocEditing = false; renderManual(c, key, page.id); };
    $all(".body a", art).forEach(function(a){ var h = a.getAttribute("href") || ""; if (/^https?:/.test(h)){ a.target = "_blank"; a.rel = "noopener"; } else if (h.indexOf("#/") === 0) a.classList.add("in-link"); });
    buildToc(art);
    window.scrollTo(0, 0);
  }
  function buildToc(root){
    var host = $("#tocR"); if (!host) return;
    var hs = $all(".body h2", root); if (hs.length < 2){ host.innerHTML = ""; return; }
    hs.forEach(function(h, i){ h.id = "s" + (i + 1); });
    host.innerHTML = '<h4>이 문서의 목차</h4>' + hs.map(function(h){ return '<a data-to="' + h.id + '">' + esc(h.textContent) + '</a>'; }).join("");
    $all("a", host).forEach(function(a){ a.onclick = function(){ var t = document.getElementById(a.dataset.to); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" }); }; });
    var links = $all("a", host);
    window.onscroll = function(){ var y = window.scrollY + 120, cur = 0; hs.forEach(function(h, i){ if (h.offsetTop <= y) cur = i; }); links.forEach(function(l, i){ l.classList.toggle("on", i === cur); }); };
  }
  function addPage(c, pages, curGrp, curParent){
    var base = pages.length ? pages : [{ grp: curGrp || "업무 개요", id: "", title: "" }];
    var m = showModal('<h3>문서 추가</h3><form class="f" id="af"><label class="full">문서 제목(목차 이름)<input name="title" required></label><div class="full">' + posControls(base, curGrp || base[0].grp) + '</div>' +
      '<div class="form-actions"><button type="button" class="btn ghost" id="aNo">취소</button><button class="btn primary">만들기</button></div></form>', "mid");
    var getPos = wirePos(m, pages, null, { parent: curParent && pages.some(function(p){ return p.id === curParent && !p.parent; }) ? curParent : null, after: "" });
    $("#aNo", m).onclick = closeModal;
    $("#af", m).addEventListener("submit", async function(e){
      e.preventDefault(); var fd = new FormData(e.target), pos = getPos();
      var rec = { id: c.id + "-" + Date.now().toString(36), cat: c.id, menu: "manual", grp: pos.grp, grp_sort: 999, sort: 999, parent: pos.parent || null, title: String(fd.get("title")).trim(), lead: "", body_html: "<h2>개요</h2><p>내용을 입력하세요.</p>", updated_by: me.email };
      var x = await sb.from("portal_pages").insert(rec).select("id,cat,menu,grp,grp_sort,sort,parent,title,lead,updated_at,updated_by");
      if (x.error || !x.data || !x.data.length){ alert("만들지 못했습니다: " + errMsg(x)); return; }
      var np = x.data[0]; np.body_html = rec.body_html; S.pages.push(np);
      await saveOrder(orderWith(pages.concat([np]), np.id, pos));
      closeModal(); manualEditing = true; location.hash = "#/c/" + c.id + "/manual/" + encodeURIComponent(np.id);
    });
  }
  /* ---------- link picker (internal menus/documents or external URL) ---------- */
  function portalTargets(){
    var t = [["업무포털 홈", "#/"]];
    if (can("home.faq", "read")) t.push(["FAQ", "#/faq"]);
    CATS.forEach(function(c){ if (c.link) return; c.menus.forEach(function(m){ t.push([c.name + " › " + m[1], "#/c/" + c.id + "/" + m[0]]); }); });
    t.push(["근태 › 근무형태 현황 › 예외 이력", "#/c/att/worktypes/exceptions"]);
    VIOL_TABS.forEach(function(v){ t.push(["근태 › 근태 위반자 관리 › " + v[1], "#/c/att/violations/" + v[0]]); });
    var docs = S.pages.slice().sort(function(a, b){ return a.grp_sort - b.grp_sort || a.sort - b.sort; }).map(function(p){ var c = catById(p.cat); return [(c ? c.name : p.cat) + " 매뉴얼 › " + p.grp + " › " + p.title, "#/c/" + p.cat + "/manual/" + p.id]; });
    return { menus: t, docs: docs };
  }
  function linkPicker(onPick){
    var old = document.getElementById("linkPop"); if (old) old.remove();
    var t = portalTargets();
    var el = document.createElement("div"); el.id = "linkPop"; el.className = "modal-backdrop"; el.style.zIndex = 160;
    el.innerHTML = '<div class="modal mid"><h3>링크 넣기</h3><p class="hint">포털 안의 메뉴·문서를 고르거나, 외부 주소를 입력하세요.</p>' +
      '<label class="hint" style="font-size:12.5px">포털 안 메뉴·문서</label><select id="lpIn"><option value="">선택하세요</option><optgroup label="메뉴">' +
      t.menus.map(function(x){ return '<option value="' + esc(x[1]) + '">' + esc(x[0]) + '</option>'; }).join("") + '</optgroup><optgroup label="매뉴얼 문서">' +
      t.docs.map(function(x){ return '<option value="' + esc(x[1]) + '">' + esc(x[0]) + '</option>'; }).join("") + '</optgroup></select>' +
      '<label class="hint" style="font-size:12.5px">또는 외부 주소</label><input id="lpUrl" placeholder="https://"><div class="modal-actions"><button class="btn ghost" id="lpNo">취소</button><button class="btn primary" id="lpOk">넣기</button></div></div>';
    document.body.appendChild(el);
    $("#lpNo", el).onclick = function(){ el.remove(); };
    $("#lpOk", el).onclick = function(){ var v = $("#lpIn", el).value || $("#lpUrl", el).value.trim(); el.remove(); if (v && v !== "https://") onPick(v); };
  }

  /* ---------- shared record helpers ---------- */
  var STEP = ["-", "안내", "계획서 제출", "면담", "경고", "견책 검토", "인사위원회 검토"];
  function lateStep(n){ n = +n || 0; return n <= 0 ? 0 : n <= 4 ? 1 : n <= 9 ? 2 : 3; }
  function shortStep(h){ h = +h || 0; return h <= 0 ? 0 : h < 1 ? 1 : h < 16 ? 2 : h < 40 ? 3 : 4; }
  function baseStep(d){ return Math.max(lateStep(d.late), shortStep(d.short_h)); }
  function appliedStep(d){ return d.step != null && d.step !== "" ? +d.step : baseStep(d); }
  function stepBadge(i){ var cls = i <= 0 ? "neutral" : i === 1 ? "info" : i === 2 ? "warn" : "danger"; return '<span class="badge ' + cls + '">' + STEP[i] + '</span>'; }
  function actor(d, step){
    var rk = d.rank || "팀원";
    if (step === 3) return rk === "팀원" ? "1차 상위 직책자 면담" : "근태 담당자 면담";
    if (step >= 4) return rk === "팀원" ? "HR 파트장" : rk === "팀장" ? "HR 팀장" : "HR 실장";
    return step ? "HRM팀(근태 담당)" : "";
  }
  function prevQuarter(q){ var m = /^(\d{4})-(\d)Q$/.exec(q || ""); if (!m) return ""; var y = +m[1], n = +m[2] - 1; if (n < 1){ n = 4; y--; } return y + "-" + n + "Q"; }
  function curQuarter(){ var d = new Date(); return d.getFullYear() + "-" + (Math.floor(d.getMonth() / 3) + 1) + "Q"; }
  function qMonths(q){ var m = /^(\d{4})-(\d)Q$/.exec(q || ""); if (!m) return []; var s = (+m[2] - 1) * 3 + 1; return [[+m[1], s], [+m[1], s + 1], [+m[1], s + 2]]; }
  function qLabel(q){ var m = /^(\d{4})-(\d)Q$/.exec(q || ""); return m ? m[1] + "년 " + m[2] + "분기" : q; }
  function quarterOf(y, mo){ return y + "-" + (Math.floor((mo - 1) / 3) + 1) + "Q"; }
  function hm(h){ var t = Math.round((+h || 0) * 60), s = t < 0 ? "-" : ""; t = Math.abs(t); return s + Math.floor(t / 60) + "시간 " + (t % 60) + "분"; }
  function wtStatus(d){ var t = todayStr(); if (d.ended) return "종료"; if (d.end && d.end < t) return "종료"; if (d.start && d.start > t) return "예정"; return "적용 중"; }
  function linkify(s){ if (!s) return ""; s = String(s); return /^https?:\/\//.test(s) ? '<a href="' + esc(s) + '" target="_blank" rel="noopener">문서 열기 ↗</a>' : esc(s); }
  async function loadRecs(cat, menu){
    var key = cat + "." + menu;
    if (S.recs[key]) return S.recs[key];
    var r = await sb.from("portal_records").select("*").eq("cat", cat).eq("menu", menu).order("created_at");
    if (r.error) throw r.error;
    S.recs[key] = r.data || []; return S.recs[key];
  }
  var REC_DEF = {
    worktypes: { menu: "worktypes", list: "worktype", title: "근무형태 현황", noun: "근무형태",
      fields: [["type", "구분", "multi", ["모바일 출퇴근", "단시간근로자", "근로시간 단축자", "고정근무자", "재택근무 예외자"]], ["target", "이름", "text"], ["org", "소속", "text"], ["team", "팀", "text"],
        ["start", "적용 시작", "date"], ["end", "적용 종료", "date"], ["weekly_hours", "1주 소정근로시간", "number"], ["tags", "태그", "text", "쉼표로 구분"], ["basis", "요청자·근거", "text"], ["content", "세부 내용", "textarea"]] },
    exceptions: { menu: "worktypes", list: "exception", title: "예외 이력", noun: "예외 이력",
      fields: [["type", "구분", "select", ["새벽·야간근무", "시간외근로 예외", "근무결과신청 예외", "재택·외근", "기타"]], ["target", "대상(성명·조직)", "text"], ["org", "소속", "text"], ["team", "팀", "text"],
        ["start", "적용일", "date"], ["end", "종료일", "date"], ["tags", "태그", "text", "쉼표로 구분"], ["basis", "요청자·근거", "text"], ["content", "세부 내용", "textarea"]] },
    violations: { menu: "violations", title: "조치 대상", noun: "조치 대상",
      fields: [["quarter", "분기", "text", "예: 2026-3Q"], ["name", "성명", "text"], ["dept", "소속", "text"], ["rank", "구분", "select", ["팀원", "팀장", "실장 이상"]], ["email", "이메일", "text"],
        ["late", "지각(회)", "number"], ["short_h", "미달(시간)", "number"], ["missing", "출퇴근 누락(회)", "number"], ["step", "적용 단계", "stepsel"],
        ["status", "진행 상태", "select", ["대상 확인", "안내 발송", "소명·정정 중", "정정 완료(제외)", "계획서 제출", "면담 완료", "경고", "종결"]],
        ["exclude", "조치 포함 여부", "exsel"], ["exclude_reason", "제외 사유", "text"],
        ["due", "소명 기한", "date"], ["doc", "계획서·문서", "text", "문서번호 또는 링크"], ["note", "비고", "textarea"]] }
  };
  function openRecord(c, defKey, x, after){
    var def = REC_DEF[defKey], key = c.id + "." + def.menu, isNew = !x;
    var d = x ? Object.assign({}, x.data) : (defKey === "violations" ? { quarter: violQ || curQuarter(), rank: "팀원", status: "대상 확인" } : {});
    var m = showModal('<h3>' + esc(def.title) + ' · ' + (isNew ? "추가" : "수정") + '</h3>' + (defKey === "violations" ? '<p class="hint">적용 단계를 비워 두면 기준 단계(자동 계산)가 그대로 적용됩니다.</p>' : '') +
      '<form class="f" id="rf">' + def.fields.map(function(f){
        var v = d[f[0]] == null ? "" : d[f[0]];
        if (f[2] === "multi"){ var cur = String(v || "").split(",").map(function(s){ return s.trim(); }); return '<div class="full"><div class="hint" style="font-size:12.5px;font-weight:600;margin-bottom:6px">' + f[1] + ' (여러 개 선택 가능)</div><div class="type-picks">' + f[3].map(function(o){ return '<label><input type="checkbox" name="' + f[0] + '" value="' + esc(o) + '"' + (cur.indexOf(o) >= 0 ? " checked" : "") + '>' + esc(o) + '</label>'; }).join("") + '</div></div>'; }
        if (f[2] === "select") return '<label>' + f[1] + '<select name="' + f[0] + '"><option value=""></option>' + f[3].map(function(o){ return '<option' + (o === v ? " selected" : "") + '>' + esc(o) + '</option>'; }).join("") + (v && f[3].indexOf(v) < 0 ? '<option selected>' + esc(v) + '</option>' : '') + '</select></label>';
        if (f[2] === "stepsel") return '<label>' + f[1] + '<select name="step"><option value="">자동(기준 단계)</option>' + STEP.map(function(s, i){ return i ? '<option value="' + i + '"' + (String(v) === String(i) ? " selected" : "") + '>' + s + '</option>' : ''; }).join("") + '</select></label>';
        if (f[2] === "exsel") return '<label>' + f[1] + '<select name="exclude"><option value="">포함</option><option value="1"' + (v ? " selected" : "") + '>제외</option></select></label>';
        if (f[2] === "textarea") return '<label class="full">' + f[1] + '<textarea name="' + f[0] + '" rows="4">' + esc(v) + '</textarea></label>';
        return '<label>' + f[1] + '<input name="' + f[0] + '" type="' + (f[2] === "number" ? "number\" step=\"0.01" : f[2]) + '" value="' + esc(v) + '"' + (f[3] && typeof f[3] === "string" ? ' placeholder="' + esc(f[3]) + '"' : '') + '></label>';
      }).join("") +
      '<div class="form-actions">' + (!isNew && can(key, "edit") ? '<button type="button" class="btn danger" id="rDel" style="margin-right:auto">삭제</button>' : '') + '<button type="button" class="btn ghost" id="rNo">취소</button><button class="btn primary">저장</button></div></form>', "wide");
    $("#rNo", m).onclick = closeModal;
    if ($("#rDel", m)) $("#rDel", m).onclick = async function(){
      if (!confirm("이 항목을 삭제할까요?")) return;
      var r = await sb.from("portal_records").delete().eq("id", x.id).select("id");
      if (r.error || !r.data || !r.data.length){ alert("삭제하지 못했습니다: " + errMsg(r)); return; }
      S.recs[key] = S.recs[key].filter(function(y){ return y.id !== x.id; }); logp(key, "delete", d.name || d.target); closeModal(); after();
    };
    $("#rf", m).addEventListener("submit", async function(e){
      e.preventDefault(); var fd = new FormData(e.target), data = Object.assign({}, x ? x.data : {});
      def.fields.forEach(function(f){ var v = f[2] === "multi" ? fd.getAll(f[0]).join(", ") : fd.get(f[0]); v = v == null ? "" : String(v).trim(); if (f[2] === "number" && v !== "") v = +v; if (f[2] === "exsel") v = v ? true : ""; if (v !== "") data[f[0]] = v; else delete data[f[0]]; });
      if (def.list) data.list = def.list;
      if (def.fields[0][2] === "multi" && !data[def.fields[0][0]]){ alert(def.fields[0][1] + "을(를) 하나 이상 고르세요."); return; }
      if (defKey === "violations" && data.quarter && !/^\d{4}-[1-4]Q$/.test(data.quarter)){ alert("분기는 2026-3Q 형식으로 입력하세요."); return; }
      var r = isNew ? await sb.from("portal_records").insert({ cat: c.id, menu: def.menu, data: data, updated_by: me.email }).select("*")
                    : await sb.from("portal_records").update({ data: data, updated_by: me.email, updated_at: new Date().toISOString() }).eq("id", x.id).select("*");
      if (r.error || !r.data || !r.data.length){ alert("저장하지 못했습니다: " + errMsg(r)); return; }
      if (isNew) S.recs[key].push(r.data[0]); else Object.assign(x, r.data[0]);
      logp(key, isNew ? "add" : "edit", data.name || data.target); closeModal(); toast("저장했습니다."); after();
    });
  }
  function downloadCsv(name, cols, rows){
    var lines = [cols.map(function(c){ return c[0]; }).join(",")].concat(rows.map(function(r){ return cols.map(function(c){ var v = c[1](r); return '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"'; }).join(","); }));
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name + "_" + todayStr() + ".csv"; a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- 근무형태 현황 (목록 + 팝업, 예외 이력 탭) ---------- */
  var wtFilter = { worktypes: { q: "", type: "", ended: true, org: "", team: "" }, exceptions: { q: "", type: "", ended: true, org: "", team: "" } };
  var wtOpen = {};
  var SHORT_T = "근로시간 단축자";
  function wtOrg(d){ return d.org || ""; }
  function wtTeam(d){ return d.team || (d.org ? "" : d.dept || ""); }
  function wtTypes(d){ return String(d.type || "").split(",").map(function(s){ return s.trim(); }).filter(Boolean); }
  function wtHas(d, t){ return wtTypes(d).indexOf(t) >= 0; }
  function typeBadges(d){ var l = wtTypes(d); return l.length ? l.map(function(t){ return '<span class="badge info">' + esc(t) + '</span>'; }).join(" ") : '<span class="badge neutral">-</span>'; }
  // 단축근무 사용 회차: 같은 이름의 단축 기록을 시작일 순으로 번호 매김
  function shortRounds(records){
    var by = {}, out = {};
    records.forEach(function(x){ if (!wtHas(x.data, SHORT_T)) return; var k = String(x.data.target || "").trim(); (by[k] = by[k] || []).push(x); });
    Object.keys(by).forEach(function(k){
      var l = by[k].sort(function(a, b){ return String(a.data.start || "").localeCompare(String(b.data.start || "")); });
      l.forEach(function(x, i){ out[x.id] = { n: i + 1, total: l.length, key: k, list: l }; });
    });
    return out;
  }
  async function renderWorktypes(c, tab){
    var host = $("#cm"), key = "att.worktypes", def = REC_DEF[tab], f = wtFilter[tab];
    try { await loadRecs("att", "worktypes"); } catch(err){ host.innerHTML = '<div class="banner danger">불러오지 못했습니다: ' + esc(err.message) + '</div>'; return; }
    if (!$("#cm")) return;
    var all = S.recs[key].filter(function(x){ return (x.data.list || "worktype") === def.list; });
    var w = can(key, "write"), rounds = tab === "worktypes" ? shortRounds(all) : {};
    var byType = {}, byTypeAll = {};
    all.forEach(function(x){ var on = wtStatus(x.data) !== "종료"; wtTypes(x.data).forEach(function(t){ byTypeAll[t] = (byTypeAll[t] || 0) + 1; if (on) byType[t] = (byType[t] || 0) + 1; }); });
    var orgs = []; all.forEach(function(x){ var o = wtOrg(x.data); if (o && orgs.indexOf(o) < 0) orgs.push(o); }); orgs.sort();
    var teams = []; all.forEach(function(x){ var t = wtTeam(x.data); if (t && (!f.org || wtOrg(x.data) === f.org) && teams.indexOf(t) < 0) teams.push(t); }); teams.sort();
    if (f.team && teams.indexOf(f.team) < 0) f.team = "";
    host.innerHTML = '<nav class="subtabs"><a href="#/c/att/worktypes" class="' + (tab === "worktypes" ? "on" : "") + '">근무형태 현황</a><a href="#/c/att/worktypes/exceptions" class="' + (tab === "exceptions" ? "on" : "") + '">예외 이력</a></nav>' +
      '<div class="hint" style="font-size:12.5px;margin:-4px 0 12px">' + (tab === "worktypes" ? "기본 근무형태(선택적 근로시간제)와 다르게 근무하는 인원입니다. 단시간근로자·근로시간 단축자의 1주 소정근로시간은 근태 위반자 관리 › 자동 필터링의 개인별 의무 근로시간 기준으로 쓰입니다. 근로시간 단축을 여러 번 쓴 사람은 한 줄로 묶이고 ▸를 누르면 이전 사용 내역이 펼쳐집니다." : "개인·조직별로 근태 기준과 다르게 처리한 예외 이력입니다.") + ' 행을 누르면 세부 내용이 열립니다.</div>' +
      '<div class="mini-stats">' + def.fields[0][3].map(function(t){ return '<button class="ms ms-btn' + (f.type === t ? " on" : "") + '" data-ft="' + esc(t) + '">' + esc(t) + '<b>' + (byType[t] || 0) + '</b><small class="hint" style="display:block;font-size:10.5px;font-weight:500">적용 중 · 전체 ' + (byTypeAll[t] || 0) + '</small></button>'; }).join("") + '</div>' +
      '<div class="rec-tools"><select id="fOrg"><option value="">전체 소속</option>' + orgs.map(function(o){ return '<option' + (o === f.org ? " selected" : "") + '>' + esc(o) + '</option>'; }).join("") + '</select>' +
      '<select id="fTeam"><option value="">전체 팀</option>' + teams.map(function(t){ return '<option' + (t === f.team ? " selected" : "") + '>' + esc(t) + '</option>'; }).join("") + '</select>' +
      '<input type="search" id="fT" placeholder="이름·소속·팀·내용 검색" value="' + esc(f.q) + '"><label class="hint" style="font-size:12.5px;display:flex;gap:4px;align-items:center"><input type="checkbox" id="fE"' + (f.ended ? " checked" : "") + '> 종료된 항목 포함</label><span class="grow"></span>' +
      '<span class="hint" id="wtCnt" style="font-size:12px"></span><button class="btn sm" id="rCsv">CSV 내려받기</button>' + (w ? '<button class="btn sm primary" id="rAdd">+ ' + esc(def.noun) + ' 추가</button>' : '') + '</div>' +
      '<div id="wtTbl"></div>';
    function stBadge(d){ var s = wtStatus(d); return '<span class="badge ' + (s === "종료" ? "neutral" : s === "예정" ? "warn" : "good") + '">' + s + '</span>'; }
    var cols = tab === "worktypes"
      ? [["구분", function(d){ return typeBadges(d); }], ["이름", function(d){ return '<b>' + esc(d.target || "") + '</b>'; }], ["소속", function(d){ return esc(wtOrg(d)); }], ["팀", function(d){ return esc(wtTeam(d)); }],
         ["사용 회차", function(d, x){ var r = rounds[x.id]; return r ? '<span class="round">' + r.n + '회차</span>' + (r.total > 1 ? ' <span class="hint" style="font-size:11px">/ 총 ' + r.total + '회</span>' : '') : ''; }],
         ["적용기간", function(d){ return esc((d.start || "") + (d.start || d.end ? " ~ " : "") + (d.end || "")); }], ["1주 소정근로시간", function(d){ return d.weekly_hours ? esc(d.weekly_hours) + "시간" : ""; }],
         ["태그", function(d){ return esc(d.tags || ""); }], ["상태", function(d){ return stBadge(d); }]]
      : [["구분", function(d){ return typeBadges(d); }], ["대상", function(d){ return '<b>' + esc(d.target || "") + '</b>'; }], ["소속", function(d){ return esc(wtOrg(d)); }], ["팀", function(d){ return esc(wtTeam(d)); }],
         ["적용일", function(d){ return esc((d.start || "") + (d.end ? " ~ " + d.end : "")); }], ["태그", function(d){ return esc(d.tags || ""); }], ["상태", function(d){ return stBadge(d); }]];
    var list = [];
    function rer(){ renderWorktypes(c, tab); }
    // only the table is redrawn while typing, so the search box keeps focus (한글 입력 유지)
    function drawTable(){
      var q = f.q.trim(), types = def.fields[0][3];
      function firstIdx(d){ var l = wtTypes(d); var m = 99; l.forEach(function(t){ var i = types.indexOf(t); if (i >= 0 && i < m) m = i; }); return m; }
      list = all.filter(function(x){ var d = x.data; return (f.ended || wtStatus(d) !== "종료") && (!f.type || wtHas(d, f.type)) && (!f.org || wtOrg(d) === f.org) && (!f.team || wtTeam(d) === f.team) &&
        (!q || [d.target, d.org, d.team, d.dept, d.content, d.basis, d.tags, d.type].join(" ").indexOf(q) >= 0); });
      // 단축근무: 같은 이름은 최근 기록 한 줄로 묶고 나머지는 펼침 행으로
      var groups = {}, shown = [];
      list.forEach(function(x){ var r = rounds[x.id]; if (r){ (groups[r.key] = groups[r.key] || []).push(x); } else shown.push({ x: x, kids: [] }); });
      Object.keys(groups).forEach(function(k){
        var g = groups[k].sort(function(a, b){ return String(b.data.start || "").localeCompare(String(a.data.start || "")); });
        shown.push({ x: g[0], kids: g.slice(1) });
      });
      shown.sort(function(a, b){ var A = a.x.data, B = b.x.data; return firstIdx(A) - firstIdx(B) || (wtStatus(A) === "종료") - (wtStatus(B) === "종료") || String(B.start || "").localeCompare(String(A.start || "")) || String(A.target).localeCompare(String(B.target)); });
      function tr(x, extra, child){
        return '<tr class="clk' + (wtStatus(x.data) === "종료" ? " ended" : "") + (child ? " kid" : "") + '" data-rid="' + x.id + '" tabindex="0"' + (child && !wtOpen[child] ? ' hidden' : '') + (child ? ' data-kid="' + esc(child) + '"' : '') + '>' +
          cols.map(function(c2, i){ return '<td>' + (i === 1 && extra ? extra : '') + (i === 1 && child ? '<span class="kid-mark">└</span>' : '') + c2[1](x.data, x) + '</td>'; }).join("") + '</tr>';
      }
      var rowsHtml = shown.map(function(s){
        var k = rounds[s.x.id] && rounds[s.x.id].key;
        var tog = s.kids.length ? '<button class="tog" data-tog="' + esc(k) + '" title="이전 사용 내역 ' + s.kids.length + '건 ' + (wtOpen[k] ? "접기" : "펼치기") + '">' + (wtOpen[k] ? "▾" : "▸") + '</button>' : (tab === "worktypes" ? '<span class="tog-sp"></span>' : '');
        return tr(s.x, tog) + s.kids.map(function(x){ return tr(x, '<span class="tog-sp"></span>', k); }).join("");
      }).join("");
      $("#wtCnt").textContent = list.length + "건" + (Object.keys(groups).length ? " · 단축근무 " + Object.keys(groups).length + "명" : "");
      $("#wtTbl").innerHTML = '<div class="tbl-box"><table class="rec compact wt-tbl"><thead><tr>' + cols.map(function(c2){ return '<th>' + c2[0] + '</th>'; }).join("") + '</tr></thead><tbody>' +
        (shown.length ? rowsHtml : '<tr><td colspan="' + cols.length + '" class="hint" style="padding:18px">해당하는 항목이 없습니다.</td></tr>') + '</tbody></table></div>';
      $all("#wtTbl [data-tog]").forEach(function(b){ b.onclick = function(e){ e.stopPropagation(); var k = b.dataset.tog; wtOpen[k] = !wtOpen[k];
        $all('#wtTbl tr[data-kid]').forEach(function(r){ if (r.dataset.kid === k) r.hidden = !wtOpen[k]; }); b.textContent = wtOpen[k] ? "▾" : "▸"; }; });
      $all("#wtTbl tr[data-rid]").forEach(function(row){
        function open(){ wtDetail(c, tab, S.recs[key].filter(function(x){ return x.id === row.dataset.rid; })[0], rer); }
        row.onclick = open; row.onkeydown = function(e){ if (e.key === "Enter") open(); };
      });
    }
    drawTable();
    $all("[data-ft]", host).forEach(function(b){ b.onclick = function(){ f.type = f.type === b.dataset.ft ? "" : b.dataset.ft; rer(); }; });
    $("#fE").onchange = function(e){ f.ended = e.target.checked; drawTable(); };
    $("#fOrg").onchange = function(e){ f.org = e.target.value; f.team = ""; rer(); };
    $("#fTeam").onchange = function(e){ f.team = e.target.value; drawTable(); };
    $("#fT").addEventListener("input", function(e){ f.q = e.target.value; drawTable(); });
    $("#rCsv").onclick = function(){ downloadCsv(def.title, def.fields.map(function(f2){ return [f2[1], function(x){ return f2[0] === "org" ? wtOrg(x.data) : f2[0] === "team" ? wtTeam(x.data) : x.data[f2[0]]; }]; }).concat([["사용 회차", function(x){ var r = rounds[x.id]; return r ? r.n + "/" + r.total : ""; }], ["상태", function(x){ return wtStatus(x.data); }]]), list); };
    if ($("#rAdd")) $("#rAdd").onclick = function(){ openRecord(c, tab, null, rer); };
  }
  function wtDetail(c, tab, x, after){
    var def = REC_DEF[tab], d = x.data, key = "att.worktypes";
    var canEd = can(key, "edit") || (can(key, "write") && String(x.created_by || "").toLowerCase() === me.email);
    var r = tab === "worktypes" ? shortRounds(S.recs[key])[x.id] : null;
    var hist = r && r.total > 1 ? '<h4 style="margin:14px 0 6px;font-size:13px">근로시간 단축 사용 내역 (총 ' + r.total + '회)</h4><div class="tbl-box"><table class="rec compact"><thead><tr><th>회차</th><th>적용기간</th><th>단축</th><th>1주 소정근로시간</th><th>상태</th><th>문서</th></tr></thead><tbody>' +
      r.list.map(function(y, i){ var e = y.data; var m = /1일 (\d+(?:\.\d+)?)시간 단축/.exec(e.content || ""); return '<tr class="' + (y.id === x.id ? "cur" : "") + '"><td><b>' + (i + 1) + '회차</b></td><td>' + esc((e.start || "") + " ~ " + (e.end || "")) + '</td><td>' + esc((e.tags || "").replace(" 근로시간 단축", "")) + (m ? " · 1일 " + m[1] + "h" : "") + '</td><td>' + (e.weekly_hours ? esc(e.weekly_hours) + "시간" : "") + '</td><td>' + esc(wtStatus(e)) + '</td><td style="font-size:12px">' + esc(e.basis || "") + '</td></tr>'; }).join("") + '</tbody></table></div>' : '';
    var m = showModal('<div style="display:flex;justify-content:space-between;gap:10px"><div>' + typeBadges(d) + ' <span class="badge ' + (wtStatus(d) === "종료" ? "neutral" : "good") + '">' + wtStatus(d) + '</span>' + (r ? ' <span class="badge neutral">' + r.n + '회차' + (r.total > 1 ? ' / 총 ' + r.total + '회' : '') + '</span>' : '') + '<h3 style="font-size:18px;margin-top:6px">' + esc(d.target || "") + '</h3><div class="hint" style="font-size:12.5px">' + esc([wtOrg(d), wtTeam(d)].filter(Boolean).join(" · ")) + '</div></div><button class="btn sm ghost" id="dx">닫기 ✕</button></div>' +
      '<div class="kv" style="margin-top:12px">' + def.fields.filter(function(f){ return ["type", "target", "org", "team", "content"].indexOf(f[0]) < 0; }).map(function(f){ var v = d[f[0]]; return '<div class="row"><span class="hint">' + f[1] + '</span><span>' + (v == null || v === "" ? '<span class="hint">-</span>' : esc(v) + (f[0] === "weekly_hours" ? "시간" : "")) + '</span></div>'; }).join("") +
      (d.op_flag ? '<div class="row"><span class="hint">운영여부(원본)</span><span>' + esc(d.op_flag) + '</span></div>' : '') + '</div>' +
      '<h4 style="margin:14px 0 6px;font-size:13px">세부 내용</h4><div class="wraptext" style="font-size:13.5px;line-height:1.65;background:var(--paper-0);border-radius:10px;padding:12px 14px">' + (d.content ? esc(d.content) : '<span class="hint">-</span>') + '</div>' + hist +
      '<div class="modal-actions" style="margin-top:14px"><span class="hint" style="font-size:11.5px;margin-right:auto">' + esc(x.updated_by || x.created_by || "") + ' · ' + esc(String(x.updated_at || x.created_at || "").slice(0, 10)) + '</span>' + (canEd ? '<button class="btn primary" id="dEd">수정</button>' : '') + '</div>', r && r.total > 1 ? "wide" : "mid");
    $("#dx", m).onclick = closeModal;
    if ($("#dEd", m)) $("#dEd", m).onclick = function(){ openRecord(c, tab, x, after); };
  }

  /* =====================================================================
     근태 위반자 관리: 대시보드 / 자동 필터링 / 원본 데이터 / 조치 대상 목록 / 메일 발송
     (그룹웨어가 바뀌면 열 매핑·기준값만 다시 맞추면 되도록 설정은 DB에 보관)
     ===================================================================== */
  var VIOL_TABS = [["dash", "대시보드"], ["filter", "자동 필터링"], ["raw", "원본 데이터"], ["targets", "조치 대상 목록"], ["mail", "메일 발송"]];
  var BUCKET = "portal-files";
  var ATT = { loaded: false, months: [], settings: {}, mails: [] };
  var violQ = "", violSite = "", dashYear = null, dashSite = "";
  var DEF_PARAMS = { workdays: "", minHours: "", maxHours: "", lateTime: "10:00", stdRest: 60, excludeLeaveHours: 6, workDayValues: "", excludeAlways: "", excludeMonth: "" };
  var FIELDS1 = [
    ["name", "성명", true, ["성명", "이름", "name"]], ["loginId", "로그인 아이디·이메일 (메일 발송용)", false, ["로그인 아이디", "로그인아이디", "아이디", "이메일", "email"]],
    ["dept", "부서", false, ["부서", "조직", "팀"]], ["date", "근무일", true, ["기준일", "근무일", "일자", "날짜", "date"]], ["dayType", "근무일구분", false, ["근무일구분"]],
    ["checkin", "출근시각", true, ["출근"]], ["checkout", "퇴근시각", true, ["퇴근"]], ["leave", "연차·부재 시간", false, ["부재", "연차", "휴가"]], ["rest", "휴게시간", false, ["휴게"]]
  ];
  var FIELDS2 = [["name", "성명", true, ["성명", "이름", "name"]], ["actual", "실근로시간·합계", true, ["실근로", "합계", "근로시간"]]];
  var F = { year: null, month: null, site: "", files: {}, result: null, ex: {}, restSelf: {}, savedId: null };

  function setting(k, dflt){ return ATT.settings[k] !== undefined ? ATT.settings[k] : dflt; }
  async function saveSetting(k, v){
    var r = await sb.from("portal_att_settings").upsert({ key: k, value: v, updated_by: me.email, updated_at: new Date().toISOString() }).select("key");
    if (r.error){ alert("설정을 저장하지 못했습니다: " + r.error.message); return false; }
    ATT.settings[k] = v; return true;
  }
  function sites(){ return setting("sites", ["(주)커넥트웨이브", "몰테일 한국법인"]); }
  async function loadAtt(force){
    if (ATT.loaded && !force) return;
    var r = await Promise.all([sb.from("portal_att_months").select("*").order("year").order("month"), sb.from("portal_att_settings").select("*"), sb.from("portal_att_mails").select("*").order("created_at"), loadRecs("att", "violations").catch(function(){ return []; }), loadRecs("att", "worktypes").catch(function(){ return []; })]);
    if (r[0].error) throw r[0].error;
    ATT.months = r[0].data || []; ATT.settings = {}; (r[1].data || []).forEach(function(s){ ATT.settings[s.key] = s.value; }); ATT.mails = r[2].data || [];
    ATT.loaded = true;
  }
  async function renderViol(c, sub){
    if (!VIOL_TABS.some(function(t){ return t[0] === sub; })) sub = "dash";
    var host = $("#cm");
    host.innerHTML = '<nav class="subtabs">' + VIOL_TABS.map(function(t){ return '<a href="#/c/att/violations/' + t[0] + '" class="' + (t[0] === sub ? "on" : "") + '">' + t[1] + '</a>'; }).join("") + '</nav><div id="vb"><p class="hint">불러오는 중…</p></div>';
    try { await loadAtt(); } catch(err){ $("#vb").innerHTML = '<div class="banner danger">불러오지 못했습니다: ' + esc(err.message) + '<br>포털 DB 설정(근태 위반자 관리 테이블)이 아직 적용되지 않았을 수 있습니다.</div>'; return; }
    if (!$("#vb")) return;
    if (!violQ){
      var dq = ATT.months.map(function(m){ return quarterOf(m.year, m.month); }).concat((S.recs["att.violations"] || []).map(function(x){ return x.data.quarter; })).filter(Boolean).sort();
      violQ = dq[dq.length - 1] || curQuarter();
    }
    ({ dash: vDash, filter: vFilter, raw: vRaw, targets: vTargets, mail: vMail })[sub](c);
  }
  function allQuarters(){
    var s = {}; ATT.months.forEach(function(m){ s[quarterOf(m.year, m.month)] = 1; });
    (S.recs["att.violations"] || []).forEach(function(x){ if (x.data.quarter) s[x.data.quarter] = 1; });
    s[curQuarter()] = 1;
    return Object.keys(s).sort().reverse();
  }
  function monthsOf(site){ return ATT.months.filter(function(m){ return !site || m.site === site; }); }
  function live(rows){ return (rows || []).filter(function(r){ return !r.ex; }); }

  /* ---------- parsing (규칙은 기존 근태 기록 관리 페이지와 동일) ---------- */
  function xSerial(v){ var d = new Date(Math.round((v - 25569) * 86400) * 1000); return d; }
  function pDate(v){
    if (v === undefined || v === null || v === "") return null;
    if (typeof v === "number"){ var d = xSerial(v); return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); }
    var s = String(v).trim(), m = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{4})(\d{2})(\d{2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    return null;
  }
  function pTime(v){
    if (v === undefined || v === null || v === "") return null;
    if (typeof v === "number"){ var f = v - Math.floor(v); return Math.round(f * 1440); }
    var m = String(v).match(/(\d{1,2}):(\d{2})/); return m ? (+m[1]) * 60 + (+m[2]) : null;
  }
  function pMin(v){
    if (v === undefined || v === null || v === "") return null;
    if (typeof v === "number") return v > 12 ? Math.round(v) : Math.round(v * 60);
    var s = String(v).trim(), m = s.match(/(\d{1,2}):(\d{2})/); if (m) return (+m[1]) * 60 + (+m[2]);
    var n = s.match(/(\d+(\.\d+)?)/); if (n) return s.indexOf("시간") >= 0 ? Math.round(parseFloat(n[1]) * 60) : Math.round(parseFloat(n[1]));
    return null;
  }
  function pHours(v){
    if (v === undefined || v === null || v === "") return 0;
    if (typeof v === "number") return v;
    var s = String(v).trim(), m = s.match(/^(\d{1,4}):(\d{2})(?::(\d{2}))?$/);
    if (m) return (+m[1]) + (+m[2]) / 60 + (m[3] ? (+m[3]) / 3600 : 0);
    var n = parseFloat(s.replace(/,/g, "")); return isNaN(n) ? 0 : n;
  }
  function hhmm(min){ if (min == null) return "-"; return pad(Math.floor(min / 60)) + ":" + pad(min % 60); }
  function fmtD(d){ return ymd(d) + "(" + DOW[d.getDay()] + ")"; }
  function guess(headers, fields, saved){
    var map = {};
    fields.forEach(function(f){
      if (saved && saved[f[0]] && headers.indexOf(saved[f[0]]) >= 0){ map[f[0]] = saved[f[0]]; return; }
      map[f[0]] = headers.filter(function(h){ return f[3].some(function(g){ return String(h).toLowerCase().indexOf(g.toLowerCase()) >= 0; }); })[0] || "";
    });
    return map;
  }
  function weekdaysIn(y, mo){ var n = 0, d = new Date(y, mo - 1, 1); while (d.getMonth() === mo - 1){ if (d.getDay() >= 1 && d.getDay() <= 5) n++; d.setDate(d.getDate() + 1); } return n; }
  function splitList(t){ return String(t || "").split(/[,\n]/).map(function(s){ return s.trim(); }).filter(Boolean); }

  function computeAll(){
    var p = F.params, f1 = F.files.f1, f2 = F.files.f2, res = { late: [], missing: [], under: [], over: [], rest: [], people: {} };
    var lateBase = pTime(p.lateTime) || 600, exLeave = (+p.excludeLeaveHours || 6) * 60, stdRest = +p.stdRest || 60;
    var always = splitList(p.excludeAlways), monthEx = splitList(p.excludeMonth), dayVals = splitList(p.workDayValues);
    var mStart = new Date(F.year, F.month - 1, 1), mEnd = new Date(F.year, F.month, 0);
    // 근무형태 현황: 단시간근로자·근로시간 단축자 → 개인별 기준
    var wt = {}; (S.recs["att.worktypes"] || []).forEach(function(x){ var d = x.data; if ((d.list || "worktype") !== "worktype" || !d.target) return;
      if (d.start && parseD(d.start) > mEnd) return; if (d.end && parseD(d.end) < mStart) return; if (d.ended) return; wt[d.target] = d; });
    function mvx(r, map, k){ return map[k] ? r[map[k]] : undefined; }
    var rows1 = f1 ? f1.rows.map(function(r){
      var date = pDate(mvx(r, f1.map, "date")), name = String(mvx(r, f1.map, "name") || "").trim();
      return { name: name, email: String(mvx(r, f1.map, "loginId") || "").trim(), dept: String(mvx(r, f1.map, "dept") || "").trim(), date: date,
        dayType: String(mvx(r, f1.map, "dayType") || "").trim(), cin: pTime(mvx(r, f1.map, "checkin")), cout: pTime(mvx(r, f1.map, "checkout")),
        leave: pMin(mvx(r, f1.map, "leave")) || 0, rest: pMin(mvx(r, f1.map, "rest")) };
    }).filter(function(r){ return r.name && r.date; }) : [];
    function workday(r){ var w = r.date.getDay(); if (w < 1 || w > 5) return false; if (dayVals.length && r.dayType) return dayVals.some(function(v){ return r.dayType.indexOf(v) >= 0; }); return true; }
    function note(name){ var n = []; if (wt[name]) n.push(wt[name].type + (wt[name].weekly_hours ? " 주" + wt[name].weekly_hours + "h" : "")); if (monthEx.some(function(e){ return name.indexOf(e) >= 0; })) n.push("이번 달 제외"); return n.join(" · "); }
    function exDefault(name){ return monthEx.some(function(e){ return name.indexOf(e) >= 0; }); }
    rows1.forEach(function(r){ if (!res.people[r.name]) res.people[r.name] = { email: r.email, dept: r.dept }; });
    rows1.forEach(function(r){
      if (!workday(r)) return;
      if (r.cin !== null && r.leave < exLeave){
        var thr = r.leave === 120 ? 780 : r.leave === 240 ? 840 : lateBase;
        if (r.cin > thr) res.late.push({ k: "late|" + r.name + "|" + ymd(r.date), name: r.name, dept: r.dept, email: r.email, date: fmtD(r.date), cin: hhmm(r.cin), cout: hhmm(r.cout), leave: r.leave ? hhmm(r.leave) : "-", late: hhmm(r.cin - thr), note: note(r.name), exd: exDefault(r.name) });
      }
      if (r.leave < exLeave && !always.some(function(e){ return r.name.indexOf(e) >= 0; }) && (r.cin === null || r.cout === null))
        res.missing.push({ k: "miss|" + r.name + "|" + ymd(r.date), name: r.name, dept: r.dept, email: r.email, date: fmtD(r.date), cin: r.cin === null ? "기록 없음" : hhmm(r.cin), cout: r.cout === null ? "기록 없음" : hhmm(r.cout), leave: r.leave ? hhmm(r.leave) : "-", note: note(r.name), exd: exDefault(r.name) });
    });
    rows1.forEach(function(r){ if (r.rest !== null && r.rest > stdRest) res.rest.push({ k: "rest|" + r.name + "|" + ymd(r.date), name: r.name, date: fmtD(r.date), rest: hhmm(r.rest), excess: r.rest - stdRest }); });
    var excess = {}; res.rest.forEach(function(r){ if (!F.restSelf[r.k]) excess[r.name] = (excess[r.name] || 0) + r.excess; });
    var minH = +p.minHours || 0, maxH = +p.maxHours || 0;
    if (f2 && minH){
      f2.rows.forEach(function(r){
        var name = String(r[f2.map.name] || "").trim(); if (!name) return;
        var actual = pHours(r[f2.map.actual]), base = minH, w = wt[name];
        if (w && w.weekly_hours && (wtHas(w, "단시간근로자") || wtHas(w, "근로시간 단축자"))) base = Math.round(minH * (+w.weekly_hours) / 40 * 100) / 100;
        var adj = actual + (excess[name] || 0) / 60;
        if (adj < base) res.under.push({ k: "under|" + name, name: name, dept: (res.people[name] || {}).dept || "", email: (res.people[name] || {}).email || "", actual: Math.round(actual * 100) / 100, excess: Math.round((excess[name] || 0) / 60 * 100) / 100, adj: Math.round(adj * 100) / 100, base: base, short_h: Math.round((base - adj) * 100) / 100, note: note(name), exd: exDefault(name) });
      });
    }
    if (maxH && rows1.length){
      var wk = {};
      rows1.forEach(function(r){ var w = r.date.getDay(); if (w < 1 || w > 5 || r.cin === null || r.cout === null) return; var t = r.cout - r.cin; if (t < 0) t += 1440; wk[r.name] = (wk[r.name] || 0) + Math.max(0, t - (r.rest || 0)) / 60; });
      Object.keys(wk).forEach(function(name){ var adj = wk[name] + (excess[name] || 0) / 60; if (adj > maxH) res.over.push({ k: "over|" + name, name: name, dept: (res.people[name] || {}).dept || "", email: (res.people[name] || {}).email || "", weekday: Math.round(wk[name] * 100) / 100, adj: Math.round(adj * 100) / 100, base: maxH, over_h: Math.round((adj - maxH) * 100) / 100, note: note(name), exd: exDefault(name) }); });
    }
    ["late", "missing", "under", "over"].forEach(function(k){ res[k].sort(function(a, b){ return a.name.localeCompare(b.name) || String(a.date || "").localeCompare(String(b.date || "")); }); });
    return res;
  }

  /* ---------- 자동 필터링 ---------- */
  function vFilter(c){
    var host = $("#vb"), w = can("att.violations", "write"), now = new Date();
    if (F.year == null){ F.year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(); F.month = now.getMonth() === 0 ? 12 : now.getMonth(); F.site = sites()[0]; }
    if (!F.params){ F.params = Object.assign({}, DEF_PARAMS, setting("params", {})); }
    var saved = ATT.months.filter(function(m){ return m.year === F.year && m.month === F.month && m.site === F.site; })[0];
    var wd = weekdaysIn(F.year, F.month);
    var h = '<div class="hint" style="font-size:12.5px;margin-bottom:12px">WORKS에서 내려받은 출퇴근 현황·근로시간 현황 엑셀을 올리면 지각·출퇴근 누락·의무 근로시간 미달·최대 근로시간 초과 대상을 자동으로 뽑습니다. 계산은 이 브라우저 안에서 하고, 「월 결과 저장」을 누르면 결과와 원본 파일이 포털에 보관됩니다. 그룹웨어가 바뀌면 「열 매핑」만 다시 맞추면 됩니다.</div>' +
      '<section class="panel" style="margin-top:0"><div class="step-h"><span class="n">1</span><b>기간·사업장</b></div><div class="rec-tools">' +
      '<select id="fy">' + [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map(function(y){ return '<option' + (y === F.year ? " selected" : "") + '>' + y + '</option>'; }).join("") + '</select>' +
      '<select id="fm">' + [1,2,3,4,5,6,7,8,9,10,11,12].map(function(m){ return '<option value="' + m + '"' + (m === F.month ? " selected" : "") + '>' + m + '월</option>'; }).join("") + '</select>' +
      '<select id="fs">' + sites().map(function(s){ return '<option' + (s === F.site ? " selected" : "") + '>' + esc(s) + '</option>'; }).join("") + '</select>' +
      (can("att.violations", "edit") ? '<button class="btn sm ghost" id="siteEd">사업장 목록 편집</button>' : '') +
      (saved ? '<span class="badge good">저장된 결과 있음 · ' + esc(String(saved.saved_at || "").slice(0, 10)) + ' ' + esc(saved.saved_by || "") + '</span>' + (F.savedId !== saved.id ? '<button class="btn sm" id="loadSaved">저장된 결과 불러오기</button>' : '') : '<span class="hint" style="font-size:12px">이 달은 아직 저장된 결과가 없습니다.</span>') + '</div></section>' +
      '<section class="panel"><div class="step-h"><span class="n">2</span><b>기준값</b><span class="hint" style="font-size:12px">이 달 평일 ' + wd + '일 · 공휴일은 빼고 소정근로일을 입력하면 의무(8H×소정근로일)·최대(+10H)가 자동 계산됩니다.</span></div>' +
      '<div class="pgrid">' +
      '<label>소정근로일<input id="pw" type="number" value="' + esc(F.params.workdays) + '" placeholder="' + wd + '"></label>' +
      '<label>월 의무 근로시간(h)<input id="pmin" type="number" step="0.01" value="' + esc(F.params.minHours) + '"></label>' +
      '<label>월 최대 근로시간(h)<input id="pmax" type="number" step="0.01" value="' + esc(F.params.maxHours) + '"></label>' +
      '<label>지각 기준 시각<input id="plate" value="' + esc(F.params.lateTime) + '"></label>' +
      '<label>표준 휴게(분)<input id="prest" type="number" value="' + esc(F.params.stdRest) + '"></label>' +
      '<label>누락 확인 제외 부재(시간 이상)<input id="pexl" type="number" value="' + esc(F.params.excludeLeaveHours) + '"></label>' +
      '<label>근무일구분 값(선택)<input id="pdv" value="' + esc(F.params.workDayValues) + '" placeholder="비우면 평일 전체"></label>' +
      '<label class="wide">누락 확인에서 항상 제외(퇴사예정·환경미화 등)<input id="pea" value="' + esc(F.params.excludeAlways) + '" placeholder="쉼표로 구분"></label>' +
      '<label class="wide">이번 달 제외(입사·복직 등)<input id="pem" value="' + esc(F.params.excludeMonth) + '" placeholder="쉼표로 구분 — 결과에 \'제외\'가 기본 체크"></label></div>' +
      '<p class="hint" style="font-size:12px;margin:8px 0 0">단시간근로자·근로시간 단축자는 <a href="#/c/att/worktypes">근무형태 현황</a>의 1주 소정근로시간 비율로 개인 의무 근로시간을 자동 계산합니다(예: 주 30시간 → 의무 × 30/40).</p></section>' +
      ['f1', 'f2'].map(function(k, i){
        var fl = F.files[k], title = k === "f1" ? "출퇴근 현황 업로드" : "근로시간 현황 업로드", desc = k === "f1" ? "WORKS 관리자서비스 › 근태 › 근태현황 › 출퇴근 현황 (지각·누락·최대 근로시간)" : "WORKS 관리자서비스 › 근태 › 근태현황 › 근로시간 현황 (의무 근로시간)";
        var fields = k === "f1" ? FIELDS1 : FIELDS2;
        return '<section class="panel"><div class="step-h"><span class="n">' + (i + 3) + '</span><b>' + title + '</b><span class="hint" style="font-size:12px">' + desc + '</span></div><div class="rec-tools">' +
          (w ? '<label class="btn sm primary" style="cursor:pointer">파일 선택<input type="file" accept=".xlsx,.xls,.csv" data-up="' + k + '" hidden></label>' : '') +
          (fl ? '<span><b>' + esc(fl.name) + '</b> · ' + fl.rows.length + '행</span>' : '<span class="hint" style="font-size:12.5px">아직 파일이 없습니다.</span>') + '</div>' +
          (fl ? '<details class="mapbox"><summary>열 매핑 확인·변경' + (fields.some(function(f){ return f[2] && !fl.map[f[0]]; }) ? ' <span class="badge danger">필수 열 미지정</span>' : '') + '</summary><div class="pgrid">' + fields.map(function(f){
            return '<label>' + esc(f[1]) + (f[2] ? " *" : "") + '<select data-map="' + k + '" data-f="' + f[0] + '"><option value="">(없음)</option>' + fl.headers.map(function(hd){ return '<option' + (hd === fl.map[f[0]] ? " selected" : "") + '>' + esc(hd) + '</option>'; }).join("") + '</select></label>'; }).join("") +
            '</div><p class="hint" style="font-size:12px">바꾼 매핑은 저장되어 다음 업로드에도 쓰입니다.</p></details>' : '') + '</section>';
      }).join("") +
      '<div id="fres"></div>';
    host.innerHTML = h;
    function readParams(){
      F.params.workdays = $("#pw").value; F.params.minHours = $("#pmin").value; F.params.maxHours = $("#pmax").value; F.params.lateTime = $("#plate").value;
      F.params.stdRest = $("#prest").value; F.params.excludeLeaveHours = $("#pexl").value; F.params.workDayValues = $("#pdv").value; F.params.excludeAlways = $("#pea").value; F.params.excludeMonth = $("#pem").value;
    }
    $("#fy").onchange = function(e){ F.year = +e.target.value; F.result = null; F.savedId = null; vFilter(c); };
    $("#fm").onchange = function(e){ F.month = +e.target.value; F.result = null; F.savedId = null; vFilter(c); };
    $("#fs").onchange = function(e){ F.site = e.target.value; F.result = null; F.savedId = null; vFilter(c); };
    if ($("#siteEd")) $("#siteEd").onclick = function(){ var v = window.prompt("사업장 목록 (쉼표로 구분)", sites().join(", ")); if (v == null) return; var l = splitList(v); if (!l.length) return; saveSetting("sites", l).then(function(ok){ if (ok){ F.site = l[0]; vFilter(c); } }); };
    $("#pw").addEventListener("input", function(){ var n = +$("#pw").value; if (n){ $("#pmin").value = n * 8; $("#pmax").value = n * 8 + 10; } });
    $all(".pgrid input", host).forEach(function(i){ i.addEventListener("change", function(){ readParams(); if (F.files.f1 || F.files.f2){ F.result = computeAll(); drawResult(c); } }); });
    $all("[data-up]", host).forEach(function(inp){ inp.onchange = function(){ var file = inp.files[0]; if (file) readUpload(c, inp.dataset.up, file); }; });
    $all("select[data-map]", host).forEach(function(s){ s.onchange = function(){ var fl = F.files[s.dataset.map]; fl.map[s.dataset.f] = s.value; saveSetting("map_" + s.dataset.map, fl.map); readParams(); F.result = computeAll(); vFilter(c); }; });
    if ($("#loadSaved")) $("#loadSaved").onclick = function(){ loadSavedMonth(saved); vFilter(c); };
    if (F.result) drawResult(c);
  }
  function loadSavedMonth(m){
    F.files = {}; F.savedId = m.id; F.params = Object.assign({}, DEF_PARAMS, m.params || {}); F.ex = {}; F.restSelf = {};
    F.result = { late: m.late || [], missing: m.missing || [], under: m.under || [], over: m.over || [], rest: [], people: {}, fromSaved: true };
    ["late", "missing", "under", "over"].forEach(function(k){ F.result[k].forEach(function(r){ F.ex[r.k] = !!r.ex; }); });
  }
  function readUpload(c, k, file){
    if (!window.XLSX){ alert("엑셀 읽기 도구를 불러오지 못했습니다. 새로고침 후 다시 시도하세요."); return; }
    var rd = new FileReader();
    rd.onload = function(e){
      try {
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
        if (!rows.length){ alert("데이터가 없는 파일입니다."); return; }
        var headers = Object.keys(rows[0]);
        F.files[k] = { name: file.name, file: file, rows: rows, headers: headers, map: guess(headers, k === "f1" ? FIELDS1 : FIELDS2, setting("map_" + k, null)) };
        if (F.savedId){ F.savedId = null; F.ex = {}; }
        F.result = computeAll(); vFilter(c);
      } catch(err){ alert("파일을 읽지 못했습니다: " + err.message); }
    };
    rd.readAsArrayBuffer(file);
  }
  var RES_DEF = {
    late: ["지각", [["성명", "name"], ["부서", "dept"], ["근무일", "date"], ["출근", "cin"], ["퇴근", "cout"], ["부재", "leave"], ["지각시간", "late"], ["비고", "note"]]],
    missing: ["출퇴근 체크 누락", [["성명", "name"], ["부서", "dept"], ["근무일", "date"], ["출근", "cin"], ["퇴근", "cout"], ["부재", "leave"], ["비고", "note"]]],
    under: ["의무 근로시간 미달", [["성명", "name"], ["부서", "dept"], ["실근로(h)", "actual"], ["과다휴게 보정(h)", "excess"], ["보정 후(h)", "adj"], ["기준(h)", "base"], ["미달(h)", "short_h"], ["비고", "note"]]],
    over: ["최대 근로시간 초과", [["성명", "name"], ["부서", "dept"], ["평일 근로(h)", "weekday"], ["보정 후(h)", "adj"], ["기준(h)", "base"], ["초과(h)", "over_h"], ["비고", "note"]]]
  };
  function isEx(r){ return Object.prototype.hasOwnProperty.call(F.ex, r.k) ? F.ex[r.k] : !!r.exd; }
  function drawResult(c){
    var host = $("#fres"), R = F.result, w = can("att.violations", "write"); if (!host || !R) return;
    var cnt = function(k){ return R[k].filter(function(r){ return !isEx(r); }).length; };
    var lateP = {}; R.late.forEach(function(r){ if (!isEx(r)) lateP[r.name] = 1; });
    var h = '<section class="panel"><div class="step-h"><span class="n">5</span><b>' + F.year + '년 ' + F.month + '월 · ' + esc(F.site) + ' 결과</b>' + (R.fromSaved ? '<span class="badge info">저장된 결과</span>' : '') + '</div>' +
      '<div class="kpis" style="margin:6px 0 12px">' +
      '<div class="kpi"><div class="k">지각</div><div class="v">' + cnt("late") + '<small>건</small></div><div class="s">' + Object.keys(lateP).length + '명</div></div>' +
      '<div class="kpi"><div class="k">출퇴근 누락</div><div class="v">' + cnt("missing") + '<small>건</small></div><div class="s">대상자 확인용</div></div>' +
      '<div class="kpi"><div class="k">의무 근로시간 미달</div><div class="v">' + cnt("under") + '<small>명</small></div><div class="s">' + (F.params.minHours ? "기준 " + F.params.minHours + "h" : '<span style="color:var(--danger-700)">기준값 미입력</span>') + '</div></div>' +
      '<div class="kpi"><div class="k">최대 근로시간 초과</div><div class="v">' + cnt("over") + '<small>명</small></div><div class="s">' + (F.params.maxHours ? "기준 " + F.params.maxHours + "h" : '<span style="color:var(--danger-700)">기준값 미입력</span>') + '</div></div></div>' +
      '<p class="hint" style="font-size:12px;margin:0 0 10px">확인 후 대상이 아니면 「제외」를 체크하세요. 제외한 건은 저장·분기 집계에서 빠집니다.</p>';
    ["late", "missing", "under", "over"].forEach(function(k){
      var d = RES_DEF[k], rows = R[k];
      h += '<details class="res-sec"' + (rows.length && k !== "missing" ? " open" : "") + '><summary><b>' + d[0] + '</b> <span class="hint">' + rows.length + '건 · 제외 ' + rows.filter(isEx).length + '</span></summary><div class="tbl-box" style="max-height:420px"><table class="rec compact"><thead><tr>' + d[1].map(function(cc){ return '<th>' + cc[0] + '</th>'; }).join("") + '<th>제외</th></tr></thead><tbody>' +
        (rows.length ? rows.map(function(r){ return '<tr class="' + (isEx(r) ? "ended" : "") + '">' + d[1].map(function(cc){ return '<td>' + esc(r[cc[1]] == null ? "" : r[cc[1]]) + '</td>'; }).join("") + '<td><input type="checkbox" data-ex="' + esc(r.k) + '"' + (isEx(r) ? " checked" : "") + (w ? "" : " disabled") + '></td></tr>'; }).join("") : '<tr><td colspan="' + (d[1].length + 1) + '" class="hint">대상이 없습니다.</td></tr>') +
        '</tbody></table></div></details>';
    });
    if (R.rest.length) h += '<details class="res-sec"><summary><b>과다 휴게시간 보정 확인</b> <span class="hint">' + R.rest.length + '건 — 표준 휴게(' + esc(F.params.stdRest) + '분)를 넘는 휴게는 근로시간으로 되돌려 미달·초과를 판단합니다. 본인이 직접 추가한 휴게는 체크하면 보정에서 뺍니다.</span></summary><div class="tbl-box" style="max-height:360px"><table class="rec compact"><thead><tr><th>성명</th><th>근무일</th><th>휴게시간</th><th>보정분</th><th>본인 추가(보정 안 함)</th></tr></thead><tbody>' +
      R.rest.map(function(r){ return '<tr><td>' + esc(r.name) + '</td><td>' + esc(r.date) + '</td><td>' + esc(r.rest) + '</td><td>' + r.excess + '분</td><td><input type="checkbox" data-rs="' + esc(r.k) + '"' + (F.restSelf[r.k] ? " checked" : "") + '></td></tr>'; }).join("") + '</tbody></table></div></details>';
    h += (w ? '<div class="modal-actions" style="margin-top:14px"><span class="hint" style="font-size:12px;margin-right:auto">저장하면 같은 연·월·사업장 결과를 덮어씁니다' + (R.fromSaved ? "" : " · 올린 원본 파일도 함께 보관합니다") + '.</span><button class="btn primary" id="saveMonth">월 결과 저장</button></div>' : '') + '</section>';
    host.innerHTML = h;
    $all("[data-ex]", host).forEach(function(cb){ cb.onchange = function(){ F.ex[cb.dataset.ex] = cb.checked; drawResult(c); }; });
    $all("[data-rs]", host).forEach(function(cb){ cb.onchange = function(){ F.restSelf[cb.dataset.rs] = cb.checked; F.result = computeAll(); drawResult(c); }; });
    if ($("#saveMonth")) $("#saveMonth").onclick = function(){ saveMonth(c, this); };
  }
  async function saveMonth(c, btn){
    var R = F.result, p = F.params;
    if (!R.fromSaved && (!p.minHours || !p.maxHours) && !confirm("의무·최대 근로시간 기준값이 비어 있어 미달·초과 결과가 없습니다. 그래도 저장할까요?")) return;
    btn.disabled = true; btn.textContent = "저장 중…";
    var prev = ATT.months.filter(function(m){ return m.year === F.year && m.month === F.month && m.site === F.site; })[0];
    var files = (prev && prev.files) || [], siteIdx = Math.max(0, sites().indexOf(F.site));
    for (var k in F.files){
      var fl = F.files[k]; if (!fl || !fl.file) continue;
      var ext = (fl.name.split(".").pop() || "xlsx").toLowerCase().replace(/[^a-z0-9]/g, "");
      var path = "att/" + F.year + "/" + pad(F.month) + "/site" + siteIdx + "/" + k + "-" + Date.now() + "." + ext;
      var up = await sb.storage.from(BUCKET).upload(path, fl.file, { upsert: false });
      if (up.error){ alert("원본 파일을 보관하지 못했습니다: " + up.error.message); btn.disabled = false; btn.textContent = "월 결과 저장"; return; }
      files = files.concat([{ kind: k === "f1" ? "출퇴근 현황" : "근로시간 현황", path: path, name: fl.name, size: fl.file.size, at: new Date().toISOString(), by: me.email }]);
      fl.file = null;
    }
    function pack(k){ return R[k].map(function(r){ var o = Object.assign({}, r); o.ex = isEx(r); delete o.exd; return o; }); }
    var rec = { year: F.year, month: F.month, site: F.site, params: p, late: pack("late"), missing: pack("missing"), under: pack("under"), over: pack("over"), files: files, saved_by: me.email, saved_at: new Date().toISOString() };
    var r = await sb.from("portal_att_months").upsert(rec, { onConflict: "year,month,site" }).select("*");
    btn.disabled = false; btn.textContent = "월 결과 저장";
    if (r.error || !r.data || !r.data.length){ alert("저장하지 못했습니다: " + errMsg(r)); return; }
    ATT.months = ATT.months.filter(function(m){ return !(m.year === F.year && m.month === F.month && m.site === F.site); }).concat([r.data[0]]);
    var keepParams = Object.assign({}, p); delete keepParams.workdays; delete keepParams.minHours; delete keepParams.maxHours; delete keepParams.excludeMonth;
    saveSetting("params", keepParams);
    loadSavedMonth(r.data[0]); violQ = quarterOf(F.year, F.month); logp("att.violations", "month", F.year + "-" + F.month + " " + F.site);
    toast(F.month + "월 결과를 저장했습니다. 조치 대상 목록에서 분기 집계에 반영하세요."); vFilter(c);
  }

  /* ---------- 원본 데이터 ---------- */
  function vRaw(c){
    var host = $("#vb"), list = ATT.months.slice().sort(function(a, b){ return b.year - a.year || b.month - a.month || a.site.localeCompare(b.site); });
    var rows = []; list.forEach(function(m){ (m.files || []).forEach(function(f){ rows.push({ m: m, f: f }); }); });
    host.innerHTML = '<div class="hint" style="font-size:12.5px;margin-bottom:12px">자동 필터링에서 「월 결과 저장」할 때 올린 원본 엑셀을 그대로 보관합니다. 권한이 있는 사람만 내려받을 수 있습니다.</div>' +
      '<div class="tbl-box"><table class="rec compact"><thead><tr><th>연월</th><th>사업장</th><th>종류</th><th>원본 파일명</th><th>크기</th><th>올린 사람</th><th>올린 날짜</th><th></th></tr></thead><tbody>' +
      (rows.length ? rows.map(function(x, i){ return '<tr><td>' + x.m.year + '-' + pad(x.m.month) + '</td><td>' + esc(x.m.site) + '</td><td>' + esc(x.f.kind) + '</td><td>' + esc(x.f.name) + '</td><td class="n">' + Math.round((x.f.size || 0) / 1024) + ' KB</td><td>' + esc(x.f.by || "") + '</td><td>' + esc(String(x.f.at || "").slice(0, 10)) + '</td><td><button class="btn sm" data-dl="' + i + '">내려받기</button></td></tr>'; }).join("")
        : '<tr><td colspan="8" class="hint" style="padding:18px">보관된 원본 파일이 없습니다.</td></tr>') + '</tbody></table></div>' +
      '<h3 style="margin:22px 0 8px;font-size:15px">저장된 월별 결과</h3><div class="tbl-box"><table class="rec compact"><thead><tr><th>연월</th><th>사업장</th><th>지각(건)</th><th>누락(건)</th><th>미달(명)</th><th>초과(명)</th><th>저장</th><th></th></tr></thead><tbody>' +
      (list.length ? list.map(function(m){ return '<tr><td>' + m.year + '-' + pad(m.month) + '</td><td>' + esc(m.site) + '</td><td class="n">' + live(m.late).length + '</td><td class="n">' + live(m.missing).length + '</td><td class="n">' + live(m.under).length + '</td><td class="n">' + live(m.over).length + '</td><td>' + esc(String(m.saved_at || "").slice(0, 10)) + ' ' + esc(m.saved_by || "") + '</td><td><button class="btn sm" data-open-m="' + m.id + '">결과 보기</button>' + (can("att.violations", "edit") ? ' <button class="btn sm danger" data-del-m="' + m.id + '">삭제</button>' : '') + '</td></tr>'; }).join("")
        : '<tr><td colspan="8" class="hint" style="padding:18px">저장된 결과가 없습니다.</td></tr>') + '</tbody></table></div>';
    $all("[data-dl]", host).forEach(function(b){ b.onclick = async function(){ var x = rows[+b.dataset.dl]; var r = await sb.storage.from(BUCKET).createSignedUrl(x.f.path, 120, { download: x.f.name }); if (r.error){ alert("내려받지 못했습니다: " + r.error.message); return; } window.open(r.data.signedUrl, "_blank"); }; });
    $all("[data-open-m]", host).forEach(function(b){ b.onclick = function(){ var m = ATT.months.filter(function(x){ return x.id === b.dataset.openM; })[0]; F.year = m.year; F.month = m.month; F.site = m.site; loadSavedMonth(m); location.hash = "#/c/att/violations/filter"; }; });
    $all("[data-del-m]", host).forEach(function(b){ b.onclick = async function(){
      var m = ATT.months.filter(function(x){ return x.id === b.dataset.delM; })[0];
      if (!confirm(m.year + "년 " + m.month + "월 " + m.site + " 저장 결과를 삭제할까요? 보관된 원본 파일 " + (m.files || []).length + "개도 함께 지웁니다.")) return;
      if ((m.files || []).length){ var rm = await sb.storage.from(BUCKET).remove(m.files.map(function(f){ return f.path; })); if (rm.error){ alert("원본 파일을 지우지 못했습니다: " + rm.error.message); return; } }
      var r = await sb.from("portal_att_months").delete().eq("id", m.id).select("id");
      if (r.error || !r.data || !r.data.length){ alert("삭제하지 못했습니다: " + errMsg(r)); return; }
      ATT.months = ATT.months.filter(function(x){ return x.id !== m.id; }); vRaw(c); }; });
  }

  /* ---------- 조치 대상 목록 (분기 집계 + 포함 여부) ---------- */
  function aggregateQuarter(q, site){
    var per = {};
    qMonths(q).forEach(function(ym){
      ATT.months.filter(function(m){ return m.year === ym[0] && m.month === ym[1] && (!site || m.site === site); }).forEach(function(m){
        function P(r){ var x = per[r.name] = per[r.name] || { name: r.name, dept: r.dept || "", email: r.email || "", site: m.site, late: 0, short_h: 0, missing: 0, over: 0, months: {} }; if (!x.email && r.email) x.email = r.email; if (!x.dept && r.dept) x.dept = r.dept; var mm = x.months[ym[1]] = x.months[ym[1]] || { late: 0, short_h: 0 }; return [x, mm]; }
        live(m.late).forEach(function(r){ var a = P(r); a[0].late++; a[1].late++; });
        live(m.missing).forEach(function(r){ P(r)[0].missing++; });
        live(m.under).forEach(function(r){ var a = P(r); a[0].short_h = Math.round((a[0].short_h + (+r.short_h || 0)) * 100) / 100; a[1].short_h = Math.round((a[1].short_h + (+r.short_h || 0)) * 100) / 100; });
        live(m.over).forEach(function(r){ P(r)[0].over++; });
      });
    });
    return per;
  }
  async function syncQuarter(c, q, site){
    var per = aggregateQuarter(q, site), key = "att.violations", recs = S.recs[key], n = 0, u = 0;
    var names = Object.keys(per).filter(function(k){ return per[k].late > 0 || per[k].short_h > 0; });
    for (var i = 0; i < names.length; i++){
      var a = per[names[i]], x = recs.filter(function(y){ return y.data.quarter === q && y.data.name === a.name; })[0];
      var auto = { late: a.late, short_h: a.short_h, missing: a.missing, months: a.months, site: a.site, synced_at: new Date().toISOString() };
      if (x){
        var d = Object.assign({}, x.data, { late: a.late, short_h: a.short_h, missing: a.missing, auto: auto });
        if (!d.email && a.email) d.email = a.email; if (!d.dept && a.dept) d.dept = a.dept;
        var r = await sb.from("portal_records").update({ data: d, updated_by: me.email, updated_at: new Date().toISOString() }).eq("id", x.id).select("*");
        if (r.error || !r.data || !r.data.length){ alert("반영하지 못했습니다: " + errMsg(r)); return; } Object.assign(x, r.data[0]); u++;
      } else {
        var d2 = { quarter: q, name: a.name, dept: a.dept, email: a.email, rank: "팀원", late: a.late, short_h: a.short_h, missing: a.missing, status: "대상 확인", auto: auto };
        var r2 = await sb.from("portal_records").insert({ cat: "att", menu: "violations", data: d2, updated_by: me.email }).select("*");
        if (r2.error || !r2.data || !r2.data.length){ alert("반영하지 못했습니다: " + errMsg(r2)); return; } recs.push(r2.data[0]); n++;
      }
    }
    logp(key, "sync", q + " 신규 " + n + " · 갱신 " + u); toast(qLabel(q) + " 집계 반영: 신규 " + n + "명 · 갱신 " + u + "명");
  }
  var tFilter = { q: "", status: "", inc: "" };
  function vTargets(c){
    var host = $("#vb"), key = "att.violations", rows = S.recs[key] || [], w = can(key, "write"), e = can(key, "edit"), today = todayStr();
    function canEditRow(x){ return e || (w && String(x.created_by || "").toLowerCase() === me.email); }
    var qs = allQuarters(); if (qs.indexOf(violQ) < 0) violQ = qs[0];
    var per = aggregateQuarter(violQ, ""), savedM = qMonths(violQ).map(function(ym){ return ATT.months.filter(function(m){ return m.year === ym[0] && m.month === ym[1]; }).length; });
    var list = rows.filter(function(x){ var d = x.data; return d.quarter === violQ && (!tFilter.status || d.status === tFilter.status) && (!tFilter.inc || (tFilter.inc === "in" ? !d.exclude : !!d.exclude)) ; })
      .sort(function(a, b){ return appliedStep(b.data) - appliedStep(a.data) || String(a.data.name).localeCompare(String(b.data.name)); });
    var inc = list.filter(function(x){ return !x.data.exclude; }), cnt = [0, 0, 0, 0, 0, 0, 0]; inc.forEach(function(x){ cnt[appliedStep(x.data)]++; });
    var notSynced = Object.keys(per).filter(function(n){ var a = per[n]; if (!(a.late > 0 || a.short_h > 0)) return false; var x = rows.filter(function(y){ return y.data.quarter === violQ && y.data.name === n; })[0]; return !x || !x.data.auto || x.data.late !== a.late || x.data.short_h !== a.short_h; }).length;
    var h = '<div class="rec-tools"><select id="tq">' + qs.map(function(q){ return '<option value="' + q + '"' + (q === violQ ? " selected" : "") + '>' + qLabel(q) + '</option>'; }).join("") + '</select>' +
      '<span class="hint" style="font-size:12px">저장된 월 결과: ' + qMonths(violQ).map(function(ym, i){ return ym[1] + "월 " + (savedM[i] ? "✓" : "–"); }).join(" · ") + '</span><span class="grow"></span>' +
      (w ? '<button class="btn sm primary" id="tSync"' + (Object.keys(per).length ? "" : " disabled") + '>월 결과로 분기 집계 반영' + (notSynced ? ' (' + notSynced + ')' : '') + '</button>' : '') + '</div>' +
      '<div class="hint" style="font-size:12.5px;margin-bottom:10px">자동 필터링에서 저장한 3개월 결과를 사람별로 합산해 지각 횟수·미달 시간을 채우고, 운영 기준에 따라 기준 단계를 계산합니다. 조치하지 않을 사람은 「포함」 체크를 풀고 사유를 남기세요. 수기 추가·엑셀 붙여넣기도 됩니다.</div>' +
      '<div class="mini-stats"><div class="ms">조치 대상(포함)<b>' + inc.length + '</b></div>' + [1, 2, 3, 4].map(function(i){ return '<div class="ms">' + STEP[i] + '<b>' + cnt[i] + '</b></div>'; }).join("") + '<div class="ms">제외<b>' + (list.length - inc.length) + '</b></div><div class="ms">정정 완료<b>' + list.filter(function(x){ return x.data.status === "정정 완료(제외)"; }).length + '</b></div></div>' +
      '<div class="rec-tools"><select id="tInc"><option value="">포함·제외 전체</option><option value="in"' + (tFilter.inc === "in" ? " selected" : "") + '>조치 포함만</option><option value="out"' + (tFilter.inc === "out" ? " selected" : "") + '>제외만</option></select>' +
      '<select id="tS"><option value="">전체 상태</option>' + REC_DEF.violations.fields[9][3].map(function(s){ return '<option' + (s === tFilter.status ? " selected" : "") + '>' + s + '</option>'; }).join("") + '</select>' +
      '<input type="search" id="tT" placeholder="성명·소속 검색" value="' + esc(tFilter.q) + '"><span class="grow"></span><button class="btn sm" id="tCsv">CSV 내려받기</button>' +
      (w ? '<button class="btn sm" id="tPaste">엑셀 붙여넣기</button><button class="btn sm" id="tAdd">+ 수기 추가</button>' : '') + '</div>' +
      '<div class="tbl-box"><table class="rec compact"><thead><tr><th>포함</th><th>성명</th><th>소속</th><th>구분</th>' + qMonths(violQ).map(function(ym){ return '<th>' + ym[1] + '월 지각</th>'; }).join("") + '<th>지각 계</th><th>미달 계</th><th>기준 단계</th><th>적용 단계</th><th>조치 주체</th><th>진행 상태</th><th>소명 기한</th><th>출처</th></tr></thead><tbody>' +
      (list.length ? list.map(function(x){
        var d = x.data, b = baseStep(d), s = appliedStep(d), months = (d.auto && d.auto.months) || {};
        var prev = rows.filter(function(y){ return y.data.name === d.name && y.data.quarter === prevQuarter(d.quarter); })[0];
        var overdue = d.due && d.due < today && ["대상 확인", "안내 발송", "소명·정정 중"].indexOf(d.status) >= 0;
        return '<tr class="clk' + (d.exclude ? " ended" : "") + '" data-rid="' + x.id + '" data-s="' + esc([d.name, d.dept, d.note, d.doc, d.email].join(" ")) + '"><td><input type="checkbox" data-inc="' + x.id + '"' + (d.exclude ? "" : " checked") + (canEditRow(x) ? "" : " disabled") + ' title="' + esc(d.exclude_reason || "") + '"></td><td><b>' + esc(d.name) + '</b></td><td>' + esc(d.dept || "") + '</td><td>' + esc(d.rank || "") + '</td>' +
          qMonths(violQ).map(function(ym){ var mm = months[ym[1]]; return '<td class="n">' + (mm ? mm.late : "") + '</td>'; }).join("") +
          '<td class="n"><b>' + esc(d.late == null ? "" : d.late) + '</b></td><td class="n">' + (d.short_h ? hm(d.short_h) : "") + '</td><td>' + stepBadge(b) + '</td><td>' + stepBadge(s) + (s > b ? ' <span class="hint" style="font-size:11px">상향</span>' : '') + (prev ? '<div class="hint" style="font-size:11px">직전: ' + STEP[appliedStep(prev.data)] + '</div>' : '') + '</td>' +
          '<td style="font-size:12px">' + esc(actor(d, s)) + '</td><td>' + esc(d.status || "") + '</td><td' + (overdue ? ' style="color:var(--danger-700);font-weight:700"' : '') + '>' + esc(d.due || "") + '</td><td>' + (d.auto ? '<span class="badge info">자동</span>' : '<span class="badge neutral">수기</span>') + '</td></tr>';
      }).join("") : '<tr><td colspan="16" class="hint" style="padding:18px">이 분기 조치 대상이 없습니다. 자동 필터링에서 월 결과를 저장한 뒤 「월 결과로 분기 집계 반영」을 누르세요.</td></tr>') + '</tbody></table></div>';
    host.innerHTML = h;
    function rer(){ vTargets(c); }
    $("#tq").onchange = function(ev){ violQ = ev.target.value; rer(); };
    $("#tInc").onchange = function(ev){ tFilter.inc = ev.target.value; rer(); };
    $("#tS").onchange = function(ev){ tFilter.status = ev.target.value; rer(); };
    // 검색은 표를 다시 그리지 않고 행만 숨기거나 보여서 입력창 포커스를 유지합니다 (한글 입력 유지)
    function applyQ(){ var q = tFilter.q.trim(); $all("#vb tr[data-s]").forEach(function(tr){ tr.style.display = !q || tr.dataset.s.indexOf(q) >= 0 ? "" : "none"; }); }
    applyQ();
    $("#tT").addEventListener("input", function(ev){ tFilter.q = ev.target.value; applyQ(); });
    if ($("#tSync")) $("#tSync").onclick = async function(){ this.disabled = true; await syncQuarter(c, violQ, ""); rer(); };
    if ($("#tAdd")) $("#tAdd").onclick = function(){ openRecord(c, "violations", null, rer); };
    if ($("#tPaste")) $("#tPaste").onclick = function(){ pasteRecords(c, rer); };
    $("#tCsv").onclick = function(){ downloadCsv("근태 조치 대상_" + violQ, [["포함", function(x){ return x.data.exclude ? "제외" : "포함"; }], ["제외 사유", function(x){ return x.data.exclude_reason; }], ["분기", function(x){ return x.data.quarter; }], ["성명", function(x){ return x.data.name; }], ["소속", function(x){ return x.data.dept; }], ["구분", function(x){ return x.data.rank; }], ["이메일", function(x){ return x.data.email; }], ["지각", function(x){ return x.data.late; }], ["미달(h)", function(x){ return x.data.short_h; }], ["누락", function(x){ return x.data.missing; }], ["기준 단계", function(x){ return STEP[baseStep(x.data)]; }], ["적용 단계", function(x){ return STEP[appliedStep(x.data)]; }], ["진행 상태", function(x){ return x.data.status; }], ["소명 기한", function(x){ return x.data.due; }], ["계획서·문서", function(x){ return x.data.doc; }], ["비고", function(x){ return x.data.note; }]], list); };
    $all("[data-inc]", host).forEach(function(cb){
      cb.onclick = function(ev){ ev.stopPropagation(); };
      cb.onchange = async function(){
        var x = rows.filter(function(y){ return y.id === cb.dataset.inc; })[0], d = Object.assign({}, x.data);
        if (!cb.checked){ var why = window.prompt(d.name + " 님을 조치 대상에서 제외하는 사유", d.exclude_reason || ""); if (why == null){ cb.checked = true; return; } d.exclude = true; d.exclude_reason = why; }
        else { delete d.exclude; }
        var r = await sb.from("portal_records").update({ data: d, updated_by: me.email, updated_at: new Date().toISOString() }).eq("id", x.id).select("*");
        if (r.error || !r.data || !r.data.length){ alert("저장하지 못했습니다: " + errMsg(r)); rer(); return; }
        Object.assign(x, r.data[0]); rer();
      };
    });
    $all("tr[data-rid]", host).forEach(function(tr){ tr.onclick = function(){ var x = rows.filter(function(y){ return y.id === tr.dataset.rid; })[0]; if (canEditRow(x)) openRecord(c, "violations", x, rer); }; });
  }
  function pasteRecords(c, after){
    var key = "att.violations";
    var m = showModal('<h3>엑셀에서 붙여넣기</h3><p class="hint">엑셀에서 아래 순서의 열을 복사해 붙여넣으세요(머리글 행은 있어도 됩니다).<br><b>성명 · 소속 · 구분(팀원/팀장/실장 이상) · 지각(회) · 미달(시간)</b></p>' +
      '<label class="hint" style="font-size:12.5px">분기<input id="pQ" value="' + esc(violQ || curQuarter()) + '"></label>' +
      '<textarea id="pT" rows="10" placeholder="홍길동&#9;개발팀&#9;팀원&#9;3&#9;2.5"></textarea><div id="pPrev" class="hint" style="font-size:12.5px"></div>' +
      '<div class="modal-actions"><button class="btn ghost" id="pNo">취소</button><button class="btn primary" id="pOk">추가</button></div>', "wide");
    function parse(){
      return $("#pT", m).value.split(/\r?\n/).map(function(l){ return l.split("\t"); }).filter(function(c2){ return c2[0] && c2[0].trim() && !/성명|이름/.test(c2[0]); }).map(function(c2){
        function num(v){ v = String(v || "").replace(/[^\d.]/g, ""); return v === "" ? undefined : +v; }
        return { name: c2[0].trim(), dept: (c2[1] || "").trim(), rank: (c2[2] || "팀원").trim() || "팀원", late: num(c2[3]), short_h: num(c2[4]) };
      });
    }
    $("#pT", m).addEventListener("input", function(){ var p = parse(); $("#pPrev", m).textContent = p.length + "명 인식됨"; });
    $("#pNo", m).onclick = closeModal;
    $("#pOk", m).onclick = async function(){
      var q = $("#pQ", m).value.trim(); if (!/^\d{4}-[1-4]Q$/.test(q)){ alert("분기는 2026-3Q 형식으로 입력하세요."); return; }
      var p = parse(); if (!p.length){ alert("붙여넣은 내용이 없습니다."); return; }
      var ins = p.map(function(d){ d.quarter = q; d.status = "대상 확인"; Object.keys(d).forEach(function(k){ if (d[k] === undefined) delete d[k]; }); return { cat: "att", menu: "violations", data: d, updated_by: me.email }; });
      var r = await sb.from("portal_records").insert(ins).select("*");
      if (r.error){ alert("추가하지 못했습니다: " + r.error.message); return; }
      S.recs[key] = S.recs[key].concat(r.data || []); violQ = q; logp(key, "paste", p.length + "명"); closeModal(); toast(p.length + "명을 추가했습니다."); after();
    };
  }

  /* ---------- 메일 발송 (1단계: 초안 자동 생성 + 발송·회신 기록) ---------- */
  var DEF_SUBJECT = "[HRM팀] {분기} 근태 현황 확인 및 정정 요청 안내";
  var DEF_TPL = "안녕하세요, {이름}님. HRM팀입니다.\n\n회사는 선택적 근로시간제를 운영하고 있으며, 구성원 여러분의 자유와 책임을 기반으로 근태를 관리하고 있습니다.\n\n최근 근태 현황을 점검한 결과, 아래와 같이 근태 미준수 내역이 확인되어 안내드립니다.\n\n<근태 현황>\n\n■ 지각\n{월별지각}\n- {분기} 누적 지각: {분기지각}회\n\n■ 의무 근로시간 미달\n{월별미달}\n- {분기} 누적 미달 시간: {분기미달}\n\n출퇴근 기록의 누락 또는 기타 불가피한 사유로 발생하였을 가능성을 고려하여 사실 확인 및 정정 기간을 부여하고자 합니다.\n\n근태 미준수 사유가 출퇴근 기록 누락인 경우에는 {정정기한}까지 \"근무 결과 신청\" 문서를 상신하여 정정해 주시기 바랍니다.\n\n기한 내 근태 정정이 이루어지는 경우, 해당 건은 근태 미준수에서 제외됩니다.\n\n정정이 이루어지지 않는 경우, 근태 미준수 대응 프로세스에 따라 단계별 조치가 진행될 수 있습니다.\n\n근태관리와 관련하여 개인적·업무적 사유가 있거나 회사 차원의 지원이 필요한 사항이 있다면 함께 검토할 수 있도록 공유 바랍니다.\n\n감사합니다.\n\nHRM팀 드림";
  function mailOf(q, name){ var l = ATT.mails.filter(function(m){ return m.quarter === q && m.name === name; }); return l[l.length - 1]; }
  function fillTpl(tpl, d, q, due){
    var ms = qMonths(q), mo = (d.auto && d.auto.months) || {};
    var qShort = q.slice(2, 4) + "년 " + q.slice(5, 6) + "분기";
    return tpl.replace(/\{이름\}/g, d.name || "").replace(/\{분기\}/g, qShort)
      .replace(/\{월별지각\}/g, ms.map(function(ym){ return "- " + ym[0] + "년 " + ym[1] + "월 : " + ((mo[ym[1]] && mo[ym[1]].late) || 0) + "회"; }).join("\n"))
      .replace(/\{분기지각\}/g, String(d.late || 0))
      .replace(/\{월별미달\}/g, ms.map(function(ym){ return "- " + ym[0] + "년 " + ym[1] + "월 : " + hm((mo[ym[1]] && mo[ym[1]].short_h) || 0); }).join("\n"))
      .replace(/\{분기미달\}/g, hm(d.short_h || 0))
      .replace(/\{정정기한\}/g, due ? md(due).replace(/^(\d+)\/(\d+)/, function(_, a, b){ return (+a) + "/" + (+b); }).replace(" (", "(") : "(정정 기한)");
  }
  function vMail(c){
    var host = $("#vb"), key = "att.violations", w = can(key, "write"), qs = allQuarters(); if (qs.indexOf(violQ) < 0) violQ = qs[0];
    var due = setting("due_" + violQ, ""), tpl = setting("mail_tpl", DEF_TPL), subj = setting("mail_subject", DEF_SUBJECT);
    var list = (S.recs[key] || []).filter(function(x){ return x.data.quarter === violQ && !x.data.exclude && appliedStep(x.data) >= 1; }).sort(function(a, b){ return String(a.data.name).localeCompare(String(b.data.name)); });
    var st = { none: 0, draft: 0, sent: 0, replied: 0 }; list.forEach(function(x){ var m = mailOf(violQ, x.data.name); st[!m ? "none" : m.status === "회신" ? "replied" : m.status === "발송" ? "sent" : "draft"]++; });
    var h = '<div class="rec-tools"><select id="mq">' + qs.map(function(q){ return '<option value="' + q + '"' + (q === violQ ? " selected" : "") + '>' + qLabel(q) + '</option>'; }).join("") + '</select>' +
      '<label class="hint" style="font-size:12.5px;display:flex;gap:6px;align-items:center">정정 기한<input type="date" id="mdue" value="' + esc(due) + '"' + (w ? "" : " disabled") + '></label><span class="grow"></span>' +
      (w ? '<button class="btn sm" id="mTpl">메일 양식 편집</button>' : '') + '<button class="btn sm" id="mTo">받는 사람 복사</button></div>' +
      '<div class="hint" style="font-size:12.5px;margin-bottom:10px">조치 대상 목록에서 「포함」인 사람에게 보낼 정정 요청 메일 본문을 자동으로 만듭니다. 「메일 열기」로 메일 프로그램에서 보내거나 「본문 복사」로 그룹웨어 메일에 붙여넣은 뒤, 보냈으면 「발송 완료」를 눌러 기록하세요. (자동 발송은 다음 단계에서 연결 예정)</div>' +
      '<div class="mini-stats"><div class="ms">메일 대상<b>' + list.length + '</b></div><div class="ms">미작성<b>' + st.none + '</b></div><div class="ms">초안<b>' + st.draft + '</b></div><div class="ms">발송<b>' + st.sent + '</b></div><div class="ms">회신<b>' + st.replied + '</b></div></div>' +
      '<div class="tbl-box"><table class="rec compact"><thead><tr><th>성명</th><th>소속</th><th>이메일</th><th>지각</th><th>미달</th><th>적용 단계</th><th>메일 상태</th><th></th></tr></thead><tbody>' +
      (list.length ? list.map(function(x){
        var d = x.data, ml = mailOf(violQ, d.name), s = !ml ? "미작성" : ml.status;
        return '<tr><td><b>' + esc(d.name) + '</b></td><td>' + esc(d.dept || "") + '</td><td>' + (w ? '<input class="em" data-em="' + x.id + '" value="' + esc(d.email || "") + '" placeholder="이메일 입력">' : esc(d.email || "")) + '</td>' +
          '<td class="n">' + esc(d.late || 0) + '회</td><td class="n">' + hm(d.short_h || 0) + '</td><td>' + stepBadge(appliedStep(d)) + '</td>' +
          '<td><span class="badge ' + (s === "회신" ? "good" : s === "발송" ? "info" : s === "초안" ? "warn" : "neutral") + '">' + s + '</span>' + (ml && ml.sent_at ? '<div class="hint" style="font-size:11px">' + esc(String(ml.sent_at).slice(0, 10)) + '</div>' : '') + '</td>' +
          '<td style="white-space:nowrap"><button class="btn sm" data-mv="' + x.id + '">초안 보기</button></td></tr>';
      }).join("") : '<tr><td colspan="8" class="hint" style="padding:18px">이 분기 메일 대상이 없습니다. 조치 대상 목록에서 대상을 확정하세요.</td></tr>') + '</tbody></table></div>';
    host.innerHTML = h;
    function rer(){ vMail(c); }
    $("#mq").onchange = function(e){ violQ = e.target.value; rer(); };
    $("#mdue").onchange = function(e){ saveSetting("due_" + violQ, e.target.value).then(rer); };
    $("#mTo").onclick = function(){ var t = list.map(function(x){ return x.data.email; }).filter(Boolean).join("; "); if (!t){ alert("이메일이 입력된 대상이 없습니다."); return; } navigator.clipboard.writeText(t).then(function(){ toast("받는 사람 " + t.split("; ").length + "명을 복사했습니다."); }); };
    if ($("#mTpl")) $("#mTpl").onclick = function(){
      var m = showModal('<h3>메일 양식 편집</h3><p class="hint">치환 항목: {이름} {분기} {월별지각} {분기지각} {월별미달} {분기미달} {정정기한}</p><label class="hint" style="font-size:12.5px">제목</label><input id="tS" value="' + esc(subj) + '"><label class="hint" style="font-size:12.5px">본문</label><textarea id="tB" rows="18" style="min-height:360px">' + esc(tpl) + '</textarea>' +
        '<div class="modal-actions"><button class="btn ghost" id="tR" style="margin-right:auto">기본 양식으로</button><button class="btn ghost" id="tN">취소</button><button class="btn primary" id="tO">저장</button></div>', "wide");
      $("#tN", m).onclick = closeModal; $("#tR", m).onclick = function(){ $("#tS", m).value = DEF_SUBJECT; $("#tB", m).value = DEF_TPL; };
      $("#tO", m).onclick = async function(){ if (await saveSetting("mail_subject", $("#tS", m).value) && await saveSetting("mail_tpl", $("#tB", m).value)){ closeModal(); toast("메일 양식을 저장했습니다."); rer(); } };
    };
    $all("input[data-em]", host).forEach(function(i){ i.onchange = async function(){ var x = list.filter(function(y){ return y.id === i.dataset.em; })[0], d = Object.assign({}, x.data, { email: i.value.trim() });
      var r = await sb.from("portal_records").update({ data: d, updated_by: me.email, updated_at: new Date().toISOString() }).eq("id", x.id).select("*"); if (r.error || !r.data || !r.data.length){ alert("저장하지 못했습니다: " + errMsg(r)); return; } Object.assign(x, r.data[0]); toast("이메일을 저장했습니다."); }; });
    $all("[data-mv]", host).forEach(function(b){ b.onclick = function(){ mailModal(c, list.filter(function(y){ return y.id === b.dataset.mv; })[0], rer); }; });
  }
  async function upsertMail(ml, patch){
    var r = ml ? await sb.from("portal_att_mails").update(Object.assign({ updated_at: new Date().toISOString() }, patch)).eq("id", ml.id).select("*")
               : await sb.from("portal_att_mails").insert(patch).select("*");
    if (r.error || !r.data || !r.data.length){ alert("메일 기록을 저장하지 못했습니다: " + errMsg(r)); return null; }
    if (ml) Object.assign(ml, r.data[0]); else ATT.mails.push(r.data[0]);
    return r.data[0];
  }
  function mailModal(c, x, after){
    var d = x.data, q = violQ, ml = mailOf(q, d.name), due = setting("due_" + q, ""), w = can("att.violations", "write");
    var subj = ml && ml.subject ? ml.subject : fillTpl(setting("mail_subject", DEF_SUBJECT), d, q, due);
    var body = ml && ml.body ? ml.body : fillTpl(setting("mail_tpl", DEF_TPL), d, q, due);
    var m = showModal('<div style="display:flex;justify-content:space-between;gap:10px"><h3>' + esc(d.name) + ' · 정정 요청 메일</h3><button class="btn sm ghost" id="mx">닫기 ✕</button></div>' +
      '<p class="hint">받는 사람: ' + esc(d.email || "이메일 없음 — 목록에서 입력하세요") + (ml ? ' · 상태: ' + esc(ml.status) + (ml.sent_at ? " (" + esc(String(ml.sent_at).slice(0, 10)) + ")" : "") : "") + '</p>' +
      '<label class="hint" style="font-size:12.5px">제목</label><input id="mS" value="' + esc(subj) + '"' + (w ? "" : " readonly") + '><label class="hint" style="font-size:12.5px">본문</label><textarea id="mB" rows="18" style="min-height:360px"' + (w ? "" : " readonly") + '>' + esc(body) + '</textarea>' +
      (ml && ml.reply_note ? '<div class="banner info" style="margin:0 0 10px">회신 내용: ' + esc(ml.reply_note) + '</div>' : '') +
      '<div class="modal-actions" style="flex-wrap:wrap">' + (ml && ml.body ? '<button class="btn ghost" id="mRe" style="margin-right:auto">양식으로 다시 만들기</button>' : '') +
      '<button class="btn" id="mCopy">본문 복사</button><button class="btn" id="mOpen"' + (d.email ? "" : " disabled") + '>메일 열기</button>' +
      (w ? '<button class="btn" id="mDraft">초안 저장</button><button class="btn primary" id="mSent">발송 완료 기록</button><button class="btn" id="mReply">회신 기록</button>' : '') + '</div>', "wide");
    function cur(){ return { subject: $("#mS", m).value, body: $("#mB", m).value }; }
    $("#mx", m).onclick = closeModal;
    if ($("#mRe", m)) $("#mRe", m).onclick = function(){ $("#mS", m).value = fillTpl(setting("mail_subject", DEF_SUBJECT), d, q, due); $("#mB", m).value = fillTpl(setting("mail_tpl", DEF_TPL), d, q, due); };
    $("#mCopy", m).onclick = function(){ navigator.clipboard.writeText(cur().body).then(function(){ toast("본문을 복사했습니다."); }); };
    $("#mOpen", m).onclick = function(){ var v = cur(); window.location.href = "mailto:" + encodeURIComponent(d.email) + "?subject=" + encodeURIComponent(v.subject) + "&body=" + encodeURIComponent(v.body); };
    var base = { quarter: q, name: d.name, email: d.email || "", kind: "정정 요청", record_id: x.id };
    if ($("#mDraft", m)) $("#mDraft", m).onclick = async function(){ var v = cur(); if (await upsertMail(ml, Object.assign({}, base, v, { status: ml && ml.status !== "초안" ? ml.status : "초안" }))){ toast("초안을 저장했습니다."); closeModal(); after(); } };
    if ($("#mSent", m)) $("#mSent", m).onclick = async function(){
      var v = cur(); if (!(await upsertMail(ml, Object.assign({}, base, v, { status: "발송", sent_at: new Date().toISOString(), sent_by: me.email })))) return;
      var nd = Object.assign({}, d); if (!nd.status || nd.status === "대상 확인") nd.status = "안내 발송"; if (due && !nd.due) nd.due = due;
      var r = await sb.from("portal_records").update({ data: nd, updated_by: me.email, updated_at: new Date().toISOString() }).eq("id", x.id).select("*"); if (!r.error && r.data && r.data.length) Object.assign(x, r.data[0]);
      logp("att.violations", "mail", d.name); toast("발송 완료로 기록했습니다."); closeModal(); after();
    };
    if ($("#mReply", m)) $("#mReply", m).onclick = async function(){
      var note = window.prompt("회신 내용 요약", (ml && ml.reply_note) || ""); if (note == null) return;
      var v = cur(); if (await upsertMail(ml, Object.assign({}, base, v, { status: "회신", replied_at: new Date().toISOString(), reply_note: note }))){ toast("회신을 기록했습니다."); closeModal(); after(); }
    };
  }

  /* ---------- 대시보드 ---------- */
  function vDash(c){
    var host = $("#vb"), years = {}; ATT.months.forEach(function(m){ years[m.year] = 1; }); var now = new Date(); years[now.getFullYear()] = 1;
    var ys = Object.keys(years).map(Number).sort().reverse(); if (dashYear == null) dashYear = ys[0];
    var ms = monthsOf(dashSite).filter(function(m){ return m.year === dashYear; });
    var by = {}; for (var i = 1; i <= 12; i++) by[i] = { late: 0, missing: 0, under: 0, over: 0, has: false };
    ms.forEach(function(m){ var b = by[m.month]; b.has = true; b.late += live(m.late).length; b.missing += live(m.missing).length; b.under += live(m.under).length; b.over += live(m.over).length; });
    var lastM = 0; for (var j = 12; j >= 1; j--) if (by[j].has){ lastM = j; break; }
    var prevM = 0; for (var k2 = lastM - 1; k2 >= 1; k2--) if (by[k2].has){ prevM = k2; break; }
    function kpi(label, key, unit){ var v = lastM ? by[lastM][key] : 0, pv = prevM ? by[prevM][key] : null, dl = pv == null ? "" : v - pv;
      return '<div class="kpi"><div class="k">' + label + '</div><div class="v">' + (lastM ? v : "-") + '<small>' + unit + '</small></div><div class="s">' + (lastM ? lastM + "월 기준" + (pv == null ? "" : " · " + prevM + "월 대비 " + (dl === 0 ? "변동 없음" : (dl > 0 ? "▲ " + dl : "▼ " + (-dl)))) : "저장된 결과 없음") + '</div></div>'; }
    function chart(title, key, unit){ var mx = Math.max.apply(null, [1].concat(Object.keys(by).map(function(x){ return by[x][key]; })));
      return '<section class="panel" style="margin-top:0"><div class="panel-head"><h2 style="font-size:15px">' + title + '</h2></div><div class="cols" style="--n:12;height:160px">' +
        Object.keys(by).map(function(mo){ var v = by[mo][key]; return '<div class="col" title="' + mo + '월: ' + (by[mo].has ? v + unit : "결과 없음") + '"><span class="cv2">' + (by[mo].has && v ? v : "") + '</span><i style="height:' + (v / mx * 100) + '%' + (by[mo].has ? "" : ";background:transparent") + '"></i><span class="cl">' + mo + '월</span></div>'; }).join("") + '</div></section>'; }
    var recs = (S.recs["att.violations"] || []);
    var qrows = [1, 2, 3, 4].map(function(n){ var q = dashYear + "-" + n + "Q", l = recs.filter(function(x){ return x.data.quarter === q && !x.data.exclude; }), cnt = [0, 0, 0, 0, 0, 0, 0]; l.forEach(function(x){ cnt[appliedStep(x.data)]++; });
      var sent = ATT.mails.filter(function(m){ return m.quarter === q && (m.status === "발송" || m.status === "회신"); }).length;
      return '<tr><td><b>' + n + '분기</b></td><td class="n">' + l.length + '</td>' + [1, 2, 3, 4].map(function(i){ return '<td class="n">' + cnt[i] + '</td>'; }).join("") + '<td class="n">' + l.filter(function(x){ return x.data.status === "정정 완료(제외)"; }).length + '</td><td class="n">' + sent + '</td></tr>'; }).join("");
    host.innerHTML = '<div class="rec-tools"><select id="dy">' + ys.map(function(y){ return '<option' + (y === dashYear ? " selected" : "") + '>' + y + '</option>'; }).join("") + '</select>' +
      '<select id="ds"><option value="">전체 사업장</option>' + sites().map(function(s){ return '<option' + (s === dashSite ? " selected" : "") + '>' + esc(s) + '</option>'; }).join("") + '</select>' +
      '<span class="hint" style="font-size:12px">자동 필터링에서 저장한 월별 결과(제외 건 빼고)를 기준으로 합니다.</span></div>' +
      '<div class="kpis">' + kpi("지각", "late", "건") + kpi("출퇴근 누락", "missing", "건") + kpi("의무 근로시간 미달", "under", "명") + kpi("최대 근로시간 초과", "over", "명") + '</div>' +
      '<div class="dash-grid">' + chart("월별 지각 건수", "late", "건") + chart("월별 출퇴근 누락 건수", "missing", "건") + chart("월별 의무 근로시간 미달 인원", "under", "명") + chart("월별 최대 근로시간 초과 인원", "over", "명") + '</div>' +
      '<section class="panel"><div class="panel-head"><div><h2 style="font-size:15px">분기별 조치 현황</h2><div class="desc">조치 대상 목록에서 「포함」인 인원 · 적용 단계 기준</div></div></div><div class="scrollx"><table class="tbl" style="min-width:560px"><thead><tr><th>분기</th><th>대상</th><th>안내</th><th>계획서 제출</th><th>면담</th><th>경고</th><th>정정 완료</th><th>메일 발송</th></tr></thead><tbody>' + qrows + '</tbody></table></div></section>' +
      '<section class="panel"><div class="panel-head"><h2 style="font-size:15px">월별 표</h2></div><div class="scrollx"><table class="tbl" style="min-width:560px"><thead><tr><th>월</th><th>지각(건)</th><th>출퇴근 누락(건)</th><th>의무 미달(명)</th><th>최대 초과(명)</th></tr></thead><tbody>' +
      Object.keys(by).map(function(mo){ var b = by[mo]; return '<tr><td>' + mo + '월</td>' + (b.has ? '<td class="n">' + b.late + '</td><td class="n">' + b.missing + '</td><td class="n">' + b.under + '</td><td class="n">' + b.over + '</td>' : '<td colspan="4" class="hint">저장된 결과 없음</td>') + '</tr>'; }).join("") + '</tbody></table></div></section>';
    $("#dy").onchange = function(e){ dashYear = +e.target.value; vDash(c); };
    $("#ds").onchange = function(e){ dashSite = e.target.value; vDash(c); };
  }

  /* =====================================================================
     ADMIN (portal permissions)
     ===================================================================== */
  function permKeys(){
    var g = [{ name: "홈", keys: HOME_KEYS }];
    CATS.forEach(function(c){ g.push({ name: c.name, keys: c.menus.map(function(m){ return [c.id + "." + m[0], m[1]]; }) }); });
    return g;
  }
  async function renderAdmin(){
    app.innerHTML = shell('<div class="cat-head"><div class="crumb"><a href="#/">홈</a> › 권한 관리</div><h1>권한 관리</h1></div><div class="cat-wrap"><div class="cat-main" id="am"><p class="hint">불러오는 중…</p></div></div>', "권한 관리");
    wireShell();
    var r = await Promise.all([sb.from("portal_access").select("*").order("email"), sb.from("portal_staff").select("*").order("sort")]);
    var users = r[0].data || [], staff = r[1].data || [];
    var groups = permKeys();
    var h = '<div class="banner info" style="margin-top:0">· 로그인 계정은 근로감독 대시보드와 같은 계정을 씁니다. 새 직원은 Supabase Authentication에서 계정(이메일·비밀번호)을 만든 뒤 여기에서 포털 권한을 주세요.<br>· 카테고리 안의 메뉴 권한이 모두 "없음"이면 그 카테고리는 화면에서 완전히 숨겨집니다. 권한: 읽기 &lt; 쓰기(추가) &lt; 편집(수정·삭제) &lt; 관리(문서 추가·삭제).<br>· 포털 권한은 근로감독 대시보드 권한과 별개입니다. 여기서 바꿔도 대시보드에는 영향이 없습니다.</div>' +
      '<section class="panel"><div class="panel-head"><div><h2>포털 사용자 (' + users.length + ')</h2></div><button class="btn primary sm" id="uAdd">+ 사용자 추가</button></div><div class="scrollx"><table class="tbl"><thead><tr><th>이름</th><th>이메일</th><th>팀</th><th>권한 요약</th><th></th></tr></thead><tbody>' +
      users.map(function(u){
        var p = u.perms || {}, pills = LV[p.admin] >= 4 ? '<span class="perm-pill"><b>전체 관리자</b></span>' :
          groups.map(function(g){ return g.keys.filter(function(k){ return LV[p[k[0]]] > 0; }).map(function(k){ return '<span class="perm-pill">' + esc(g.name === "홈" ? k[1] : g.name + "·" + k[1]) + ' ' + LV_LABEL[p[k[0]]] + '</span>'; }).join(""); }).join("");
        return '<tr><td><b>' + esc(u.name || "") + '</b></td><td>' + esc(u.email) + '</td><td>' + esc(u.team || "") + '</td><td>' + (pills || '<span class="hint">권한 없음</span>') + '</td><td><button class="btn sm" data-u="' + esc(u.email) + '">권한 설정</button></td></tr>';
      }).join("") + '</tbody></table></div></section>' +
      '<section class="panel"><div class="panel-head"><div><h2>업무분장 담당자 목록</h2><div class="desc">업무분장표·캘린더에서 고를 수 있는 담당자입니다. 순서대로 색이 정해집니다.</div></div><button class="btn sm" id="sAdd">+ 담당자 추가</button></div>' +
      '<table class="tbl" style="min-width:0"><thead><tr><th>순서</th><th>이름</th><th>팀</th><th>사용</th><th></th></tr></thead><tbody>' +
      staff.map(function(s){ return '<tr><td class="num">' + s.sort + '</td><td>' + chip(s.name) + '</td><td>' + esc(s.team || "") + '</td><td>' + (s.active ? "사용" : "숨김") + '</td><td><button class="btn sm" data-s="' + esc(s.name) + '">수정</button></td></tr>'; }).join("") + '</tbody></table></section>' +
      '<section class="panel"><div class="panel-head"><h2>최근 변경 이력</h2></div><div id="logBox" class="log">불러오는 중…</div></section>';
    $("#am").innerHTML = h;
    $("#uAdd").onclick = function(){ openUser(null, groups); };
    $all("[data-u]").forEach(function(b){ b.onclick = function(){ openUser(users.filter(function(u){ return u.email === b.dataset.u; })[0], groups); }; });
    $("#sAdd").onclick = function(){ openStaff(null, staff); };
    $all("[data-s]").forEach(function(b){ b.onclick = function(){ openStaff(staff.filter(function(s){ return s.name === b.dataset.s; })[0], staff); }; });
    var lg = await sb.from("portal_log").select("*").order("at", { ascending: false }).limit(80);
    $("#logBox").textContent = (lg.data || []).map(function(l){ return String(l.at).slice(0, 16).replace("T", " ") + "  " + l.email + "  [" + l.area + "/" + l.action + "] " + (l.detail || ""); }).join("\n") || "기록이 없습니다.";
  }
  function openUser(u, groups){
    var isNew = !u; u = u || { email: "", name: "", team: "HRM팀", perms: {} };
    var p = u.perms || {}, levels = ["none", "read", "write", "edit", "manage"];
    var m = showModal('<h3>' + (isNew ? "사용자 추가" : esc(u.name || u.email) + " 권한") + '</h3>' +
      '<form id="uf"><div class="perm-grid"><span>이메일</span><input name="email" type="email" value="' + esc(u.email) + '"' + (isNew ? " required" : " readonly") + '>' +
      '<span>이름</span><input name="name" value="' + esc(u.name || "") + '"><span>팀</span><input name="team" value="' + esc(u.team || "") + '">' +
      '<span><b>전체 관리자</b> <small class="hint">(모든 카테고리·권한 관리)</small></span><select name="admin"><option value="none">아니요</option><option value="manage"' + (LV[p.admin] >= 4 ? " selected" : "") + '>예</option></select>' +
      groups.map(function(g){ return '<div class="gh">' + esc(g.name) + '</div>' + g.keys.map(function(k){ return '<span>' + esc(k[1]) + '</span><select name="k:' + k[0] + '">' + levels.map(function(l){ return '<option value="' + l + '"' + ((p[k[0]] || "none") === l ? " selected" : "") + '>' + LV_LABEL[l] + '</option>'; }).join("") + '</select>'; }).join(""); }).join("") +
      '</div><div class="modal-actions" style="margin-top:16px">' + (!isNew ? '<button type="button" class="btn danger" id="uDel" style="margin-right:auto">포털 권한 삭제</button>' : '') + '<button type="button" class="btn ghost" id="uNo">취소</button><button class="btn primary">저장</button></div></form>', "mid");
    $("#uNo", m).onclick = closeModal;
    if ($("#uDel", m)) $("#uDel", m).onclick = async function(){
      if (u.email === me.email){ alert("내 계정의 권한은 삭제할 수 없습니다."); return; }
      if (!confirm(u.email + " 의 포털 권한을 삭제할까요? (로그인 계정 자체는 지워지지 않습니다)")) return;
      var x = await sb.from("portal_access").delete().eq("email", u.email).select("email");
      if (x.error || !x.data || !x.data.length){ alert("삭제하지 못했습니다: " + errMsg(x)); return; }
      logp("admin", "delete", u.email); closeModal(); renderAdmin();
    };
    $("#uf", m).addEventListener("submit", async function(e){
      e.preventDefault(); var fd = new FormData(e.target), perms = {};
      if (fd.get("admin") === "manage") perms.admin = "manage";
      fd.forEach(function(v, k){ if (k.indexOf("k:") === 0 && v !== "none") perms[k.slice(2)] = v; });
      var email = String(fd.get("email")).trim().toLowerCase();
      if (email === me.email && !perms.admin && LV[(me.perms || {}).admin] >= 4 && !confirm("내 관리자 권한을 해제하면 권한 관리 화면에 다시 들어올 수 없습니다. 계속할까요?")) return;
      var rec = { email: email, name: String(fd.get("name")).trim(), team: String(fd.get("team")).trim(), perms: perms, updated_at: new Date().toISOString() };
      var x = await sb.from("portal_access").upsert(rec).select("email");
      if (x.error || !x.data || !x.data.length){ alert("저장하지 못했습니다: " + errMsg(x)); return; }
      logp("admin", isNew ? "add" : "perm", email + " " + JSON.stringify(perms));
      if (email === me.email){ me.perms = perms; }
      closeModal(); toast("권한을 저장했습니다."); renderAdmin();
    });
  }
  function openStaff(s, staff){
    var isNew = !s; s = s || { name: "", team: "HRM팀 노무관리파트", sort: staff.length ? Math.max.apply(null, staff.map(function(x){ return x.sort; })) + 1 : 1, active: true };
    var m = showModal('<h3>' + (isNew ? "담당자 추가" : "담당자 수정") + '</h3><form class="f" id="sf"><label>이름<input name="name" value="' + esc(s.name) + '"' + (isNew ? " required" : " readonly") + '></label>' +
      '<label>팀<input name="team" value="' + esc(s.team || "") + '"></label><label>순서<input name="sort" type="number" value="' + s.sort + '"></label>' +
      '<label>사용<select name="active"><option value="1">사용</option><option value="0"' + (s.active ? "" : " selected") + '>숨김</option></select></label>' +
      '<div class="form-actions"><button type="button" class="btn ghost" id="sNo">취소</button><button class="btn primary">저장</button></div></form>', "mid");
    $("#sNo", m).onclick = closeModal;
    $("#sf", m).addEventListener("submit", async function(e){
      e.preventDefault(); var fd = new FormData(e.target);
      var rec = { name: String(fd.get("name")).trim(), team: String(fd.get("team")).trim(), sort: +fd.get("sort") || 0, active: fd.get("active") === "1" };
      var x = await sb.from("portal_staff").upsert(rec).select("name");
      if (x.error || !x.data || !x.data.length){ alert("저장하지 못했습니다: " + errMsg(x)); return; }
      var all = await sb.from("portal_staff").select("*").order("sort"); S.staff = (all.data || []).filter(function(z){ return z.active !== false; });
      closeModal(); renderAdmin();
    });
  }

  /* ---------- start ---------- */
  sb.auth.onAuthStateChange(function(ev){ if (ev === "SIGNED_OUT"){ me = null; renderLogin(); } });
  boot();
})();
