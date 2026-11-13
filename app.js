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
      items: ["연차/휴가", "연차 촉진", "리프레쉬 휴가"], menus: [["main", "휴가"]], src: ["연차/휴가", "리프레쉬 휴가"] },
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
        var u = window.prompt("링크 주소", "https://"); if (!u) return; var s = window.getSelection(); s.removeAllRanges(); s.addRange(saved); document.execCommand("createLink", false, u.trim()); dirty(); },
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
      sb.from("portal_pages").select("id,cat,menu,grp,grp_sort,sort,title,lead,updated_at,updated_by").order("grp_sort").order("sort")
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
    var ready = c.id === "att" || !!c.link;
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
    var ed = can("home.org", "edit"), q = orgQuery.trim();
    var openSet = window.__orgOpen || {};
    var groups = orgGroups();
    var total = S.org.length;
    var h = '<details class="og-wrap" id="orgWrap"' + (orgOpen || q ? " open" : "") + '><summary><span class="cv">▶</span><h2>노무관리파트 업무분장표</h2><span class="hint" style="font-size:12.5px">' + groups.length + '개 대분류 · ' + total + '개 업무</span>' +
      '<span class="legend" style="margin-left:auto">' + S.staff.map(function(s){ return chip(s.name); }).join("") + '</span></summary><div class="og-in">' +
      '<div class="sec-h"><div class="hint" style="font-size:12.5px">대분류를 눌러 펼치고, 업무명을 누르면 세부 내용이 열립니다.' + (ed ? ' 사업부 칸의 담당자를 누르면 바로 바꿀 수 있습니다.' : '') + '</div>' +
      '<div class="tools"><input type="search" id="orgQ" placeholder="업무·담당자 검색" value="' + esc(q) + '">' +
      '<button class="btn sm" id="orgAll">모두 펼치기</button><button class="btn sm" id="orgNone">모두 접기</button>' +
      (ed ? '<button class="btn sm primary" id="orgAdd">+ 업무 추가</button>' : '') + '</div></div>';
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
    host.innerHTML = h + '</div></details>';
    $("#orgWrap").addEventListener("toggle", function(e){ orgOpen = e.target.open; });
    $all("details.og", host).forEach(function(d){ d.addEventListener("toggle", function(){ window.__orgOpen = window.__orgOpen || {}; window.__orgOpen[d.dataset.g] = d.open; }); });
    $("#orgQ").addEventListener("input", function(e){ orgQuery = e.target.value; var pos = e.target.selectionStart; renderOrg(); var i = $("#orgQ"); i.focus(); try { i.setSelectionRange(pos, pos); } catch(x){} });
    $("#orgAll").onclick = function(){ $all("details.og", host).forEach(function(d){ d.open = true; }); };
    $("#orgNone").onclick = function(){ $all("details.og", host).forEach(function(d){ d.open = false; }); };
    if ($("#orgAdd")) $("#orgAdd").onclick = function(){ openOrgEdit(null); };
    $all("[data-open]", host).forEach(function(b){ b.onclick = function(){ openOrg(+b.dataset.open); }; });
    $all("[data-pick]", host).forEach(function(b){ b.onclick = function(e){ e.stopPropagation(); openPicker(b, +b.dataset.pick, b.dataset.u); }; });
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
  var faqQ = "", faqKind = "", faqPeriod = "12m";
  function faqDate(f){ return String(f.asked_on || f.updated_at || "").slice(0, 10); }
  // home card: search + add; titles open the FAQ page
  function renderFaq(){
    var host = $("#faqCard"); if (!host) return;
    var cats = ["전체"]; S.faq.forEach(function(f){ if (f.category && cats.indexOf(f.category) < 0) cats.push(f.category); });
    var w = can("home.faq", "write");
    var list = S.faq.filter(function(f){ return (faqCat === "전체" || f.category === faqCat) && (!faqQ || (f.question + " " + (f.answer || "")).indexOf(faqQ) >= 0); })
      .slice().sort(function(a, b){ return faqDate(b) < faqDate(a) ? -1 : faqDate(b) > faqDate(a) ? 1 : 0; });
    host.innerHTML = '<div class="sec-h"><h2><a href="#/faq" class="h-link">💬 FAQ ›</a></h2><div class="tools"><input type="search" id="fq" placeholder="질문 검색" value="' + esc(faqQ) + '" style="width:150px">' + (w ? '<button class="btn sm primary" id="fAdd">+ FAQ</button>' : '') + '</div></div>' +
      '<div class="faq-tabs">' + cats.map(function(c){ return '<button data-fc="' + esc(c) + '" class="' + (c === faqCat ? "on" : "") + '">' + esc(c) + '</button>'; }).join("") + '</div>' +
      '<ul class="faq-links">' + (list.length ? list.map(function(f){
        return '<li><a href="#/faq/' + encodeURIComponent(f.id) + '"><span class="q">Q</span><span class="tx">' + esc(f.question) + '</span>' + (f.category ? '<span class="badge neutral">' + esc(f.category) + '</span>' : '') + '</a></li>';
      }).join("") : '<li class="hint" style="font-size:13px;padding:8px">해당하는 FAQ가 없습니다.</li>') + '</ul>' +
      '<a class="btn sm" href="#/faq" style="margin-top:8px;align-self:flex-end">FAQ 화면에서 전체 보기 · 문의 분석 →</a>';
    $all("[data-fc]", host).forEach(function(b){ b.onclick = function(){ faqCat = b.dataset.fc; renderFaq(); }; });
    $("#fq").addEventListener("input", function(e){ faqQ = e.target.value; renderFaq(); var i = $("#fq"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
    if ($("#fAdd")) $("#fAdd").onclick = function(){ openFaq(null, renderFaq); };
  }
  function openFaq(f, after){
    var isNew = !f; f = f || { category: faqCat !== "전체" ? faqCat : "", question: "", answer: "", kind: "단순 반복", asked_on: todayStr() };
    var cats = []; S.faq.forEach(function(x){ if (x.category && cats.indexOf(x.category) < 0) cats.push(x.category); });
    CATS.forEach(function(c){ if (c.id !== "insp" && cats.indexOf(c.name) < 0) cats.push(c.name); });
    var m = showModal('<h3>' + (isNew ? "FAQ 추가" : "FAQ 수정") + '</h3><p class="hint">문의 날짜와 분류는 FAQ 화면의 문의 분석(카테고리 비율·기간별 건수)에 바로 반영됩니다.</p><form class="f" id="ff">' +
      '<label>분류<input name="category" list="fcl" value="' + esc(f.category || "") + '" placeholder="예: 근태, 휴가" required><datalist id="fcl">' + cats.map(function(c){ return '<option value="' + esc(c) + '">'; }).join("") + '</datalist></label>' +
      '<label>문의 날짜<input type="date" name="asked_on" value="' + esc(f.asked_on || "") + '"></label>' +
      '<label>구분<select name="kind">' + ["", "단순 반복", "개별 판단", "FAQ 미수록"].map(function(k){ return '<option' + (f.kind === k ? " selected" : "") + '>' + k + '</option>'; }).join("") + '</select></label>' +
      '<label class="full">질문<input name="question" value="' + esc(f.question) + '" required></label>' +
      '<label class="full">답변<textarea name="answer" rows="6" style="min-height:140px">' + esc(f.answer || "") + '</textarea></label>' +
      '<div class="form-actions">' + (!isNew ? '<button type="button" class="btn danger" id="fDel" style="margin-right:auto">삭제</button>' : '') + '<button type="button" class="btn ghost" id="fNo">취소</button><button class="btn primary">저장</button></div></form>', "mid");
    $("#fNo", m).onclick = closeModal;
    if ($("#fDel", m)) $("#fDel", m).onclick = async function(){
      if (!confirm("이 FAQ를 삭제할까요?")) return;
      var x = await sb.from("portal_faq").delete().eq("id", f.id).select("id");
      if (x.error || !x.data || !x.data.length){ alert("삭제하지 못했습니다: " + errMsg(x)); return; }
      S.faq = S.faq.filter(function(z){ return z.id !== f.id; }); closeModal(); after && after();
    };
    $("#ff", m).addEventListener("submit", async function(e){
      e.preventDefault(); var fd = new FormData(e.target);
      var rec = { category: String(fd.get("category") || "").trim() || null, kind: fd.get("kind") || null, asked_on: fd.get("asked_on") || null, question: String(fd.get("question")).trim(), answer: String(fd.get("answer") || "").trim(), updated_by: me.email, updated_at: new Date().toISOString() };
      if (isNew) rec.sort = S.faq.length ? Math.max.apply(null, S.faq.map(function(z){ return z.sort || 0; })) + 1 : 1;
      var x = isNew ? await sb.from("portal_faq").insert(rec).select("*") : await sb.from("portal_faq").update(rec).eq("id", f.id).select("*");
      if (x.error || !x.data || !x.data.length){ alert("저장하지 못했습니다: " + errMsg(x)); return; }
      if (isNew) S.faq.push(x.data[0]); else Object.assign(f, x.data[0]);
      logp("faq", isNew ? "add" : "edit", rec.question); closeModal(); toast("FAQ를 저장했습니다."); after && after();
    });
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
  function renderFaqPage(openId){
    if (openId){ faqCat = "전체"; faqQ = ""; faqKind = ""; }
    app.innerHTML = shell('<div class="cat-head"><div class="crumb"><a href="#/">홈</a> › FAQ</div><h1><span>💬</span>FAQ</h1><p class="hint" style="margin:4px 0 0;font-size:13px">자주 묻는 문의와 답변을 모으고, 카테고리별·기간별 문의 현황을 분석합니다. FAQ를 추가하거나 고치면 분석이 바로 갱신됩니다.</p></div>' +
      '<div class="cat-wrap"><div class="cat-main" id="fqMain"></div></div>', "FAQ");
    wireShell();
    drawFaqPage(openId);
  }
  function drawFaqPage(openId){
    var host = $("#fqMain"); if (!host) return;
    var w = can("home.faq", "write"), from = periodStart(faqPeriod);
    var dated = S.faq.filter(function(f){ return !!faqDate(f); });
    var inP = S.faq.filter(function(f){ var d = faqDate(f); return !from || (d && d >= from); });
    var noDate = S.faq.length - dated.length;
    // category share within period
    var byCat = {}; inP.forEach(function(f){ var c = f.category || "미분류"; byCat[c] = (byCat[c] || 0) + 1; });
    var catRows = Object.keys(byCat).map(function(c){ return [c, byCat[c]]; }).sort(function(a, b){ return b[1] - a[1] || a[0].localeCompare(b[0]); });
    var maxC = catRows.length ? catRows[0][1] : 0;
    // monthly series: months from period start (or first dated month, max 24) to this month
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
    var byKind = {}; inP.forEach(function(f){ var k = f.kind || "구분 없음"; byKind[k] = (byKind[k] || 0) + 1; });
    var rep = byKind["단순 반복"] || 0;
    var plabel = PERIODS.filter(function(p){ return p[0] === faqPeriod; })[0][1];

    var h = '<div class="rec-tools" role="group" aria-label="분석 기간">' + PERIODS.map(function(p){ return '<button class="btn sm' + (p[0] === faqPeriod ? " primary" : "") + '" data-pd="' + p[0] + '">' + p[1] + '</button>'; }).join("") +
      '<span class="grow"></span><span class="hint" style="font-size:12px">문의 날짜 기준' + (noDate ? ' · 날짜 없는 ' + noDate + '건은 기간 분석에서 제외' : '') + '</span></div>';
    h += '<div class="kpis">' +
      '<div class="kpi"><div class="k">' + esc(plabel) + ' 문의</div><div class="v">' + inP.length + '<small>건</small></div><div class="s">전체 ' + S.faq.length + '건</div></div>' +
      '<div class="kpi"><div class="k">이번 달</div><div class="v">' + cThis + '<small>건</small></div><div class="s">지난달 ' + cPrev + '건 · ' + (delta === 0 ? "변동 없음" : (delta > 0 ? "▲ " + delta : "▼ " + (-delta)) + "건") + '</div></div>' +
      '<div class="kpi"><div class="k">가장 많은 분류</div><div class="v" style="font-size:20px;font-family:var(--font-body)">' + (catRows[0] ? esc(catRows[0][0]) : "-") + '</div><div class="s">' + (catRows[0] ? catRows[0][1] + "건 · " + Math.round(catRows[0][1] / inP.length * 100) + "%" : "") + '</div></div>' +
      '<div class="kpi"><div class="k">단순 반복 비율</div><div class="v">' + (inP.length ? Math.round(rep / inP.length * 100) : 0) + '<small>%</small></div><div class="s">' + Object.keys(byKind).map(function(k){ return esc(k) + " " + byKind[k]; }).join(" · ") + '</div></div></div>';
    h += '<div class="an-grid"><section class="panel" style="margin-top:0"><div class="panel-head"><div><h2>카테고리별 문의 비율</h2><div class="desc">' + esc(plabel) + ' · ' + inP.length + '건</div></div></div>' +
      (catRows.length ? '<div class="hbars">' + catRows.map(function(r){ var pct = inP.length ? Math.round(r[1] / inP.length * 1000) / 10 : 0;
        return '<button class="hb' + (faqCat === r[0] ? " on" : "") + '" data-hc="' + esc(r[0]) + '" title="' + esc(r[0]) + ': ' + r[1] + '건 (' + pct + '%) · 눌러서 목록 거르기"><span class="hl">' + esc(r[0]) + '</span><span class="ht"><i style="width:' + Math.max(2, r[1] / maxC * 100) + '%"></i></span><span class="hv"><b>' + r[1] + '</b>건 · ' + pct + '%</span></button>'; }).join("") + '</div>'
        : '<p class="hint">이 기간에 문의가 없습니다.</p>') + '</section>' +
      '<section class="panel" style="margin-top:0"><div class="panel-head"><div><h2>기간별 문의 건수</h2><div class="desc">월별 · ' + months[0] + ' ~ ' + months[months.length - 1] + '</div></div></div>' +
      '<div class="cols" style="--n:' + months.length + '">' + months.map(function(k){ var v = byM[k] || 0;
        return '<div class="col" title="' + k + ': ' + v + '건"><span class="cv2">' + (v || "") + '</span><i style="height:' + (v / maxM * 100) + '%"></i><span class="cl">' + (k.slice(5) === "01" || k === months[0] ? k.slice(2, 4) + "." : "") + +k.slice(5) + '월</span></div>'; }).join("") + '</div></section></div>';
    // list
    var cats = ["전체"]; S.faq.forEach(function(f){ if (f.category && cats.indexOf(f.category) < 0) cats.push(f.category); });
    var list = S.faq.filter(function(f){ return (faqCat === "전체" || f.category === faqCat) && (!faqKind || f.kind === faqKind) && (!faqQ || (f.question + " " + (f.answer || "")).indexOf(faqQ) >= 0); })
      .slice().sort(function(a, b){ return faqDate(b) < faqDate(a) ? -1 : faqDate(b) > faqDate(a) ? 1 : 0; });
    h += '<section class="panel"><div class="panel-head"><div><h2>FAQ 목록</h2><div class="desc">' + list.length + '건</div></div>' +
      '<div class="rec-tools" style="margin:0"><select id="fkSel"><option value="">전체 구분</option>' + ["단순 반복", "개별 판단", "FAQ 미수록"].map(function(k){ return '<option' + (k === faqKind ? " selected" : "") + '>' + k + '</option>'; }).join("") + '</select>' +
      '<input type="search" id="fpq" placeholder="질문·답변 검색" value="' + esc(faqQ) + '">' + (w ? '<button class="btn sm primary" id="fpAdd">+ FAQ 추가</button>' : '') + '</div></div>' +
      '<div class="faq-tabs">' + cats.map(function(c){ return '<button data-fc="' + esc(c) + '" class="' + (c === faqCat ? "on" : "") + '">' + esc(c) + '</button>'; }).join("") + '</div>' +
      '<ul class="faq-list big">' + (list.length ? list.map(function(f){
        return '<li id="faq-' + esc(f.id) + '"><details' + (f.id === openId ? " open" : "") + '><summary><span class="q">Q</span><span style="flex:1">' + esc(f.question) + '</span>' +
          (f.category ? '<span class="badge info">' + esc(f.category) + '</span>' : '') + (f.kind ? '<span class="badge neutral">' + esc(f.kind) + '</span>' : '') + '<span class="hint mono" style="font-size:11.5px">' + esc(faqDate(f)) + '</span></summary>' +
          '<div class="a">' + esc(f.answer || "답변 준비 중") + (w ? '<div class="act"><button class="btn sm" data-fe="' + esc(f.id) + '">수정</button></div>' : '') + '</div></details></li>';
      }).join("") : '<li class="hint" style="font-size:13px">해당하는 FAQ가 없습니다.</li>') + '</ul></section>';
    host.innerHTML = h;
    function redraw(){ drawFaqPage(); }
    $all("[data-pd]", host).forEach(function(b){ b.onclick = function(){ faqPeriod = b.dataset.pd; redraw(); }; });
    $all("[data-hc]", host).forEach(function(b){ b.onclick = function(){ faqCat = faqCat === b.dataset.hc ? "전체" : b.dataset.hc; redraw(); }; });
    $all("[data-fc]", host).forEach(function(b){ b.onclick = function(){ faqCat = b.dataset.fc; redraw(); }; });
    $("#fkSel").onchange = function(e){ faqKind = e.target.value; redraw(); };
    $("#fpq").addEventListener("input", function(e){ faqQ = e.target.value; redraw(); var i = $("#fpq"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
    if ($("#fpAdd")) $("#fpAdd").onclick = function(){ openFaq(null, redraw); };
    $all("[data-fe]", host).forEach(function(b){ b.onclick = function(){ openFaq(S.faq.filter(function(f){ return f.id === b.dataset.fe; })[0], redraw); }; });
    if (openId){ var el = document.getElementById("faq-" + openId); if (el) setTimeout(function(){ el.scrollIntoView({ behavior: "smooth", block: "center" }); el.classList.add("flash-highlight"); }, 60); }
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
    if (c.id === "att" && menu === "manual"){ app.innerHTML = shell(head + '<div class="cat-wrap" id="cw"></div>', c.name); renderManual(c, key, sub); }
    else if (c.id === "att" && (menu === "violations" || menu === "worktypes")){ app.innerHTML = shell(head + '<div class="cat-wrap"><div class="cat-main" id="cm"></div></div>', c.name); renderRecords(c, menu); }
    else {
      app.innerHTML = shell(head + '<div class="cat-wrap"><div class="cat-main"><div class="soon-box"><div class="ic">' + c.ic + '</div><h2>' + esc(c.name) + ' 메뉴는 준비 중입니다</h2>' +
        '<p>근태 카테고리와 같은 틀(상단 메뉴 · 왼쪽 절차 · 관리표)로 이어서 구성할 예정입니다.</p>' +
        (c.src ? '<p class="hint" style="margin-top:16px">옮겨 올 노션 원문</p><ul>' + c.src.map(function(s){ return '<li>' + esc(s) + '</li>'; }).join("") + '</ul>' : '') +
        (c.link ? '<p><a class="btn primary" href="' + c.link + '" target="_blank" rel="noopener">근로감독 대시보드 열기 ↗</a></p>' : '') + '</div></div></div>', c.name);
    }
    wireShell();
  }

  /* ---------- manual (pages) ---------- */
  var manualEditing = false;
  async function renderManual(c, key, pid){
    var host = $("#cw"), pages = S.pages.filter(function(p){ return p.cat === c.id && p.menu === "manual"; });
    if (!pages.length){ host.innerHTML = '<div class="cat-main"><p class="hint">등록된 매뉴얼이 없습니다.</p></div>'; return; }
    var page = pages.filter(function(p){ return p.id === pid; })[0] || pages[0];
    var groups = [], gm = {};
    pages.forEach(function(p){ if (!gm[p.grp]){ gm[p.grp] = []; groups.push(p.grp); } gm[p.grp].push(p); });
    var side = '<aside class="side"><div class="side-title">근태관리 매뉴얼</div>' + groups.map(function(g){
      var open = gm[g].some(function(p){ return p.id === page.id; }) || g === groups[0];
      return '<div class="grp' + (open ? " open" : "") + '"><button class="grp-h" type="button">' + esc(g) + '<span class="chev">▶</span></button><ul>' +
        gm[g].map(function(p){ return '<li><a href="#/c/' + c.id + '/manual/' + encodeURIComponent(p.id) + '" class="' + (p.id === page.id ? "on" : "") + '">' + esc(p.title) + '</a></li>'; }).join("") + '</ul></div>';
    }).join("") + (can(key, "manage") ? '<div style="padding:12px 10px"><button class="btn sm" id="pgAdd">+ 문서 추가</button></div>' : '') + '</aside>';
    host.innerHTML = side + '<div class="cat-main"><div class="doc-wrap"><article class="doc" id="docA"><p class="hint">불러오는 중…</p></article><nav class="toc-r" id="tocR"></nav></div></div>';
    $all(".grp-h", host).forEach(function(b){ b.onclick = function(){ b.parentNode.classList.toggle("open"); }; });
    if ($("#pgAdd")) $("#pgAdd").onclick = function(){ addPage(c, groups, page.grp); };
    if (page.body_html == null){
      var r = await sb.from("portal_pages").select("body_html").eq("id", page.id).maybeSingle();
      page.body_html = (r.data && r.data.body_html) || "";
    }
    if (!$("#docA")) return;
    var idx = pages.indexOf(page), prev = pages[idx - 1], next = pages[idx + 1];
    var art = $("#docA"), ed = can(key, "edit");
    if (manualEditing && ed){
      art.innerHTML = '<div class="crumb">' + esc(c.name) + ' › ' + esc(page.grp) + ' · 편집 중</div>' + editorBar() +
        '<p class="ed-hint">제목·요약·본문을 화면에서 바로 고칩니다. 글자를 선택한 뒤 도구를 누르세요.</p>' +
        '<h1 id="edTitle" contenteditable="true">' + esc(page.title) + '</h1><p class="lead" id="edLead" contenteditable="true">' + esc(page.lead || "") + '</p>' +
        '<div id="edBody" class="body" contenteditable="true">' + cleanHtml(page.body_html) + '</div><textarea id="edHtml" class="ed-html" style="display:none"></textarea>' +
        '<div class="modal-actions" style="margin-top:24px">' + (can(key, "manage") ? '<button class="btn danger" id="pgDel" style="margin-right:auto">문서 삭제</button>' : '') + '<button class="btn ghost" id="pgNo">취소</button><button class="btn primary" id="pgOk">저장</button></div>';
      var st = wireEditor(art, function(){ window.__editDirty = true; });
      [$("#edTitle"), $("#edLead")].forEach(function(x){ x.addEventListener("input", function(){ st.dirty = true; window.__editDirty = true; }); x.addEventListener("keydown", function(e){ if (e.key === "Enter") e.preventDefault(); }); });
      $("#pgNo").onclick = function(){ if (st.dirty && !confirm("수정한 내용을 저장하지 않고 닫을까요?")) return; manualEditing = false; window.__editDirty = false; renderManual(c, key, page.id); };
      $("#pgOk").onclick = async function(){
        var upd = { title: $("#edTitle").textContent.trim() || page.title, lead: $("#edLead").textContent.trim(), body_html: st.getHtml(), updated_by: me.email, updated_at: new Date().toISOString() };
        var x = await sb.from("portal_pages").update(upd).eq("id", page.id).select("id");
        if (x.error || !x.data || !x.data.length){ alert("저장하지 못했습니다: " + errMsg(x)); return; }
        Object.assign(page, upd); logp("pages", "edit", page.title); manualEditing = false; window.__editDirty = false; toast("매뉴얼을 저장했습니다."); renderManual(c, key, page.id);
      };
      if ($("#pgDel")) $("#pgDel").onclick = async function(){
        if (!confirm("'" + page.title + "' 문서를 삭제할까요? 되돌릴 수 없습니다.")) return;
        var x = await sb.from("portal_pages").delete().eq("id", page.id).select("id");
        if (x.error || !x.data || !x.data.length){ alert("삭제하지 못했습니다: " + errMsg(x)); return; }
        S.pages = S.pages.filter(function(p){ return p.id !== page.id; }); manualEditing = false; window.__editDirty = false; location.hash = "#/c/" + c.id + "/manual";
      };
      return;
    }
    art.innerHTML = '<div class="crumb">' + esc(c.name) + ' › 근태관리 매뉴얼 › ' + esc(page.grp) + '</div><h1>' + esc(page.title) + '</h1>' +
      (page.lead ? '<p class="lead">' + esc(page.lead) + '</p>' : '') +
      '<div class="meta-line"><span class="tag b">' + esc(page.grp) + '</span>' + (page.updated_by ? '<span class="hint" style="font-size:12px">최종 수정 ' + esc(String(page.updated_at || "").slice(0, 10)) + ' · ' + esc(page.updated_by) + '</span>' : '') +
      (ed ? '<button class="btn sm" id="pgEdit" style="margin-left:auto">✎ 이 문서 수정</button>' : '') + '</div>' +
      '<div class="body">' + cleanHtml(page.body_html) + '</div>' +
      '<div class="pn">' + (prev ? '<a href="#/c/' + c.id + '/manual/' + encodeURIComponent(prev.id) + '"><small>이전</small>' + esc(prev.title) + '</a>' : '<span></span>') +
      (next ? '<a class="nx" href="#/c/' + c.id + '/manual/' + encodeURIComponent(next.id) + '"><small>다음</small>' + esc(next.title) + '</a>' : '') + '</div>';
    if ($("#pgEdit")) $("#pgEdit").onclick = function(){ manualEditing = true; renderManual(c, key, page.id); };
    $all(".body a", art).forEach(function(a){ var h = a.getAttribute("href") || ""; if (/^https?:/.test(h)){ a.target = "_blank"; a.rel = "noopener"; } });
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
  function addPage(c, groups, curGrp){
    var m = showModal('<h3>문서 추가</h3><form class="f" id="af"><label class="full">그룹<input name="grp" list="gl" value="' + esc(curGrp) + '" required><datalist id="gl">' + groups.map(function(g){ return '<option value="' + esc(g) + '">'; }).join("") + '</datalist></label>' +
      '<label class="full">문서 제목<input name="title" required></label><div class="form-actions"><button type="button" class="btn ghost" id="aNo">취소</button><button class="btn primary">만들기</button></div></form>', "mid");
    $("#aNo", m).onclick = closeModal;
    $("#af", m).addEventListener("submit", async function(e){
      e.preventDefault(); var fd = new FormData(e.target), grp = String(fd.get("grp")).trim();
      var same = S.pages.filter(function(p){ return p.cat === c.id && p.grp === grp; });
      var gs = same.length ? same[0].grp_sort : Math.max.apply(null, S.pages.map(function(p){ return p.grp_sort; }).concat([0])) + 10;
      var rec = { id: c.id + "-" + Date.now().toString(36), cat: c.id, menu: "manual", grp: grp, grp_sort: gs, sort: same.length ? Math.max.apply(null, same.map(function(p){ return p.sort; })) + 1 : 1, title: String(fd.get("title")).trim(), lead: "", body_html: "<h2>개요</h2><p>내용을 입력하세요.</p>", updated_by: me.email };
      var x = await sb.from("portal_pages").insert(rec).select("id,cat,menu,grp,grp_sort,sort,title,lead,updated_at,updated_by");
      if (x.error || !x.data || !x.data.length){ alert("만들지 못했습니다: " + errMsg(x)); return; }
      var np = x.data[0]; np.body_html = rec.body_html; S.pages.push(np);
      S.pages.sort(function(a, b){ return a.grp_sort - b.grp_sort || a.sort - b.sort; });
      closeModal(); manualEditing = true; location.hash = "#/c/" + c.id + "/manual/" + encodeURIComponent(np.id);
    });
  }

  /* ---------- records: 근태 위반자 관리 / 근무형태 현황 ---------- */
  var STEP = ["-", "안내", "계획서 제출", "면담", "경고", "견책 검토", "인사위원회 검토"];
  function lateStep(n){ n = +n || 0; return n <= 0 ? 0 : n <= 4 ? 1 : n <= 9 ? 2 : 3; }
  function shortStep(h){ h = +h || 0; return h <= 0 ? 0 : h < 1 ? 1 : h < 16 ? 2 : h < 40 ? 3 : 4; }
  function baseStep(d){ return Math.max(lateStep(d.late), shortStep(d.short_h)); }
  function stepBadge(i){ var cls = i <= 0 ? "neutral" : i === 1 ? "info" : i === 2 ? "warn" : "danger"; return '<span class="badge ' + cls + '">' + STEP[i] + '</span>'; }
  function actor(d, step){
    var rk = d.rank || "팀원";
    if (step === 3) return rk === "팀원" ? "1차 상위 직책자 면담" : "근태 담당자 면담";
    if (step >= 4) return rk === "팀원" ? "HR 파트장" : rk === "팀장" ? "HR 팀장" : "HR 실장";
    return step ? "HRM팀(근태 담당)" : "";
  }
  function prevQuarter(q){ var m = /^(\d{4})-(\d)Q$/.exec(q || ""); if (!m) return ""; var y = +m[1], n = +m[2] - 1; if (n < 1){ n = 4; y--; } return y + "-" + n + "Q"; }
  function curQuarter(){ var d = new Date(); return d.getFullYear() + "-" + (Math.floor(d.getMonth() / 3) + 1) + "Q"; }
  var REC_DEF = {
    violations: {
      title: "근태 위반자 관리", desc: "분기별 지각·의무 근로시간 미달 대상자와 대응 단계를 관리합니다. 기준 단계는 운영 기준(지각 1~4회 안내 / 5~9회 계획서 / 10회 이상 면담, 미달 1시간 미만 안내 / 1~16시간 계획서 / 16~40시간 면담 / 40시간 이상 경고)에 따라 자동 계산되고, 직전 분기 이력을 고려해 적용 단계를 올릴 수 있습니다.",
      fields: [
        ["quarter", "분기", "text", "예: 2026-3Q"], ["name", "성명", "text"], ["dept", "소속", "text"], ["rank", "구분", "select", ["팀원", "팀장", "실장 이상"]],
        ["late", "지각(회)", "number"], ["short_h", "미달(시간)", "number"], ["step", "적용 단계", "stepsel"],
        ["status", "진행 상태", "select", ["대상 확인", "안내 발송", "소명·정정 중", "정정 완료(제외)", "계획서 제출", "면담 완료", "경고", "종결"]],
        ["due", "소명 기한", "date"], ["doc", "계획서·문서", "text", "문서번호 또는 링크"], ["note", "비고", "textarea"]
      ]
    },
    worktypes: {
      title: "근무형태 현황", desc: "모바일 출퇴근 허용, 단축근무, 재택 예외, 새벽근무 등 기본 근무형태와 다르게 운영되는 인원·조직과 예외 처리 이력을 관리합니다. 개인 정보가 포함되므로 권한이 있는 인원만 열람합니다.",
      fields: [
        ["type", "구분", "select", ["모바일 출퇴근", "단축근무", "모성보호", "재택 예외", "새벽·야간근무", "시간외근로 예외", "계약·근무시간 예외", "휴가·휴직 예외", "기타 예외"]],
        ["target", "대상(성명·조직)", "text"], ["dept", "소속", "text"], ["content", "내용", "textarea"],
        ["start", "적용 시작", "date"], ["end", "적용 종료", "date"], ["basis", "요청자·근거", "text"], ["tags", "태그", "text", "쉼표로 구분"]
      ]
    }
  };
  var recFilter = { violations: { q: "", quarter: "", status: "" }, worktypes: { q: "", type: "", ended: false } };
  async function renderRecords(c, menu){
    var host = $("#cm"), key = c.id + "." + menu, def = REC_DEF[menu];
    if (!S.recs[key]){
      host.innerHTML = '<p class="hint">불러오는 중…</p>';
      var r = await sb.from("portal_records").select("*").eq("cat", c.id).eq("menu", menu).order("created_at");
      if (r.error){ host.innerHTML = '<div class="banner danger">불러오지 못했습니다: ' + esc(r.error.message) + '</div>'; return; }
      S.recs[key] = r.data || [];
    }
    if (!$("#cm")) return;
    var rows = S.recs[key], f = recFilter[menu], w = can(key, "write"), e = can(key, "edit"), today = todayStr();
    function canEditRow(x){ return e || (w && String(x.created_by || "").toLowerCase() === me.email); }
    var h = '<div class="sec-h"><div><h2>' + esc(def.title) + '</h2><div class="hint" style="font-size:12.5px;margin-top:4px;max-width:1100px">' + esc(def.desc) + '</div></div></div>';
    var list;
    if (menu === "violations"){
      var qs = []; rows.forEach(function(x){ if (x.data.quarter && qs.indexOf(x.data.quarter) < 0) qs.push(x.data.quarter); }); qs.sort().reverse();
      if (f.quarter === "" && qs.length) f.quarter = qs[0];
      list = rows.filter(function(x){ var d = x.data; return (!f.quarter || f.quarter === "*" || d.quarter === f.quarter) && (!f.status || d.status === f.status) && (!f.q || [d.name, d.dept, d.note, d.doc].join(" ").indexOf(f.q) >= 0); });
      var cnt = [0, 0, 0, 0, 0, 0, 0]; list.forEach(function(x){ var s = x.data.step != null && x.data.step !== "" ? +x.data.step : baseStep(x.data); cnt[s]++; });
      h += '<div class="mini-stats"><div class="ms">대상자<b>' + list.length + '</b></div>' + [1, 2, 3, 4].map(function(i){ return '<div class="ms">' + STEP[i] + '<b>' + cnt[i] + '</b></div>'; }).join("") +
        '<div class="ms">정정 완료(제외)<b>' + list.filter(function(x){ return x.data.status === "정정 완료(제외)"; }).length + '</b></div></div>';
      h += '<div class="rec-tools"><select id="fQ"><option value="*">전체 분기</option>' + qs.map(function(q){ return '<option' + (q === f.quarter ? " selected" : "") + '>' + q + '</option>'; }).join("") + '</select>' +
        '<select id="fS"><option value="">전체 상태</option>' + def.fields[7][3].map(function(s){ return '<option' + (s === f.status ? " selected" : "") + '>' + s + '</option>'; }).join("") + '</select>' +
        '<input type="search" id="fT" placeholder="성명·소속 검색" value="' + esc(f.q) + '"><span class="grow"></span>' +
        '<button class="btn sm" id="rCsv">CSV 내려받기</button>' + (w ? '<button class="btn sm" id="rPaste">엑셀 붙여넣기</button><button class="btn sm primary" id="rAdd">+ 대상자 추가</button>' : '') + '</div>';
      h += '<div class="tbl-box"><table class="rec"><thead><tr><th>분기</th><th>성명</th><th>소속</th><th>구분</th><th>지각</th><th>미달(h)</th><th>기준 단계</th><th>적용 단계</th><th>조치 주체</th><th>진행 상태</th><th>소명 기한</th><th>계획서·문서</th><th>비고</th><th></th></tr></thead><tbody>' +
        (list.length ? list.map(function(x){
          var d = x.data, b = baseStep(d), s = d.step != null && d.step !== "" ? +d.step : b;
          var prev = rows.filter(function(y){ return y.data.name === d.name && y.data.quarter === prevQuarter(d.quarter); })[0];
          var overdue = d.due && d.due < today && ["대상 확인", "안내 발송", "소명·정정 중"].indexOf(d.status) >= 0;
          return '<tr><td>' + esc(d.quarter) + '</td><td><b>' + esc(d.name) + '</b></td><td>' + esc(d.dept) + '</td><td>' + esc(d.rank) + '</td><td class="n">' + esc(d.late == null ? "" : d.late) + '</td><td class="n">' + esc(d.short_h == null ? "" : d.short_h) + '</td>' +
            '<td>' + stepBadge(b) + '</td><td>' + stepBadge(s) + (s > b ? ' <span class="hint" style="font-size:11px">상향</span>' : '') + (prev ? '<div class="hint" style="font-size:11px">직전 분기: ' + STEP[prev.data.step != null && prev.data.step !== "" ? +prev.data.step : baseStep(prev.data)] + '</div>' : '') + '</td>' +
            '<td style="font-size:12px">' + esc(actor(d, s)) + '</td><td>' + esc(d.status || "") + '</td><td' + (overdue ? ' style="color:var(--danger-700);font-weight:700"' : '') + '>' + esc(d.due || "") + '</td>' +
            '<td style="font-size:12px;max-width:200px;overflow-wrap:anywhere">' + linkify(d.doc) + '</td><td class="wrap" style="font-size:12px">' + esc(d.note || "") + '</td>' +
            '<td>' + (canEditRow(x) ? '<button class="btn sm" data-re="' + x.id + '">수정</button>' : '') + '</td></tr>';
        }).join("") : '<tr><td colspan="14" class="hint" style="padding:18px">해당 조건의 대상자가 없습니다.</td></tr>') + '</tbody></table></div>';
    } else {
      list = rows.filter(function(x){ var d = x.data, ended = d.end && d.end < today; return (f.ended || !ended) && (!f.type || d.type === f.type) && (!f.q || [d.target, d.dept, d.content, d.basis, d.tags].join(" ").indexOf(f.q) >= 0); });
      var byType = {}; rows.forEach(function(x){ if (!(x.data.end && x.data.end < today)) byType[x.data.type] = (byType[x.data.type] || 0) + 1; });
      h += '<div class="mini-stats"><div class="ms">적용 중<b>' + rows.filter(function(x){ return !(x.data.end && x.data.end < today); }).length + '</b></div>' + Object.keys(byType).map(function(t){ return '<div class="ms">' + esc(t) + '<b>' + byType[t] + '</b></div>'; }).join("") + '</div>';
      h += '<div class="rec-tools"><select id="fY"><option value="">전체 구분</option>' + def.fields[0][3].map(function(s){ return '<option' + (s === f.type ? " selected" : "") + '>' + s + '</option>'; }).join("") + '</select>' +
        '<input type="search" id="fT" placeholder="대상·내용 검색" value="' + esc(f.q) + '"><label class="hint" style="font-size:12.5px;display:flex;gap:4px;align-items:center"><input type="checkbox" id="fE"' + (f.ended ? " checked" : "") + '> 종료된 항목 포함</label><span class="grow"></span>' +
        '<button class="btn sm" id="rCsv">CSV 내려받기</button>' + (w ? '<button class="btn sm primary" id="rAdd">+ 항목 추가</button>' : '') + '</div>';
      h += '<div class="tbl-box"><table class="rec"><thead><tr><th>구분</th><th>대상</th><th>소속</th><th>내용</th><th>적용 기간</th><th>요청자·근거</th><th>태그</th><th>상태</th><th></th></tr></thead><tbody>' +
        (list.length ? list.map(function(x){
          var d = x.data, ended = d.end && d.end < today;
          return '<tr class="' + (ended ? "ended" : "") + '"><td><span class="badge info">' + esc(d.type || "-") + '</span></td><td><b>' + esc(d.target) + '</b></td><td>' + esc(d.dept || "") + '</td><td class="wrap">' + esc(d.content || "") + '</td>' +
            '<td style="white-space:nowrap;font-size:12px">' + esc(d.start || "") + (d.start || d.end ? " ~ " : "") + esc(d.end || "") + '</td><td style="font-size:12px">' + esc(d.basis || "") + '</td>' +
            '<td style="font-size:12px">' + esc(d.tags || "") + '</td><td>' + (ended ? '<span class="badge neutral">종료</span>' : '<span class="badge good">적용 중</span>') + '</td>' +
            '<td>' + (canEditRow(x) ? '<button class="btn sm" data-re="' + x.id + '">수정</button>' : '') + '</td></tr>';
        }).join("") : '<tr><td colspan="9" class="hint" style="padding:18px">해당 조건의 항목이 없습니다.</td></tr>') + '</tbody></table></div>';
    }
    host.innerHTML = h;
    function rer(){ renderRecords(c, menu); }
    if ($("#fQ")) $("#fQ").onchange = function(e){ f.quarter = e.target.value; rer(); };
    if ($("#fS")) $("#fS").onchange = function(e){ f.status = e.target.value; rer(); };
    if ($("#fY")) $("#fY").onchange = function(e){ f.type = e.target.value; rer(); };
    if ($("#fE")) $("#fE").onchange = function(e){ f.ended = e.target.checked; rer(); };
    $("#fT").addEventListener("input", function(e){ f.q = e.target.value; rer(); var i = $("#fT"); i.focus(); i.setSelectionRange(i.value.length, i.value.length); });
    $("#rCsv").onclick = function(){ downloadCsv(def, list, menu); };
    if ($("#rAdd")) $("#rAdd").onclick = function(){ openRecord(c, menu, null); };
    if ($("#rPaste")) $("#rPaste").onclick = function(){ pasteRecords(c, menu); };
    $all("[data-re]", host).forEach(function(b){ b.onclick = function(){ openRecord(c, menu, rows.filter(function(x){ return x.id === b.dataset.re; })[0]); }; });
  }
  function linkify(s){ if (!s) return ""; s = String(s); return /^https?:\/\//.test(s) ? '<a href="' + esc(s) + '" target="_blank" rel="noopener">문서 열기 ↗</a>' : esc(s); }
  function downloadCsv(def, list, menu){
    var cols = def.fields.map(function(f){ return f; });
    var lines = [cols.map(function(f){ return f[1]; }).concat(menu === "violations" ? ["기준 단계"] : []).join(",")];
    list.forEach(function(x){
      var d = x.data;
      var vals = cols.map(function(f){ var v = d[f[0]]; if (f[2] === "stepsel") v = STEP[v != null && v !== "" ? +v : baseStep(d)]; return v == null ? "" : String(v); });
      if (menu === "violations") vals.push(STEP[baseStep(d)]);
      lines.push(vals.map(function(v){ return '"' + v.replace(/"/g, '""') + '"'; }).join(","));
    });
    var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = def.title + "_" + todayStr() + ".csv"; a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); }, 1000);
  }
  function openRecord(c, menu, x){
    var key = c.id + "." + menu, def = REC_DEF[menu], isNew = !x, d = x ? x.data : (menu === "violations" ? { quarter: recFilter.violations.quarter && recFilter.violations.quarter !== "*" ? recFilter.violations.quarter : curQuarter(), rank: "팀원", status: "대상 확인" } : {});
    var m = showModal('<h3>' + esc(def.title) + ' · ' + (isNew ? "추가" : "수정") + '</h3>' + (menu === "violations" ? '<p class="hint">적용 단계를 비워 두면 기준 단계(자동 계산)가 그대로 적용됩니다.</p>' : '') +
      '<form class="f" id="rf">' + def.fields.map(function(f){
        var v = d[f[0]] == null ? "" : d[f[0]], full = f[2] === "textarea" ? " full" : "";
        if (f[2] === "select") return '<label>' + f[1] + '<select name="' + f[0] + '"><option value=""></option>' + f[3].map(function(o){ return '<option' + (o === v ? " selected" : "") + '>' + esc(o) + '</option>'; }).join("") + '</select></label>';
        if (f[2] === "stepsel") return '<label>' + f[1] + '<select name="step"><option value="">자동(기준 단계)</option>' + STEP.map(function(s, i){ return i ? '<option value="' + i + '"' + (String(v) === String(i) ? " selected" : "") + '>' + s + '</option>' : ''; }).join("") + '</select></label>';
        if (f[2] === "textarea") return '<label class="full">' + f[1] + '<textarea name="' + f[0] + '" rows="4">' + esc(v) + '</textarea></label>';
        return '<label class="' + full + '">' + f[1] + '<input name="' + f[0] + '" type="' + (f[2] === "number" ? "number\" step=\"0.01" : f[2]) + '" value="' + esc(v) + '"' + (f[3] && typeof f[3] === "string" ? ' placeholder="' + esc(f[3]) + '"' : '') + '></label>';
      }).join("") +
      '<div class="form-actions">' + (!isNew && can(key, "edit") ? '<button type="button" class="btn danger" id="rDel" style="margin-right:auto">삭제</button>' : '') + '<button type="button" class="btn ghost" id="rNo">취소</button><button class="btn primary">저장</button></div></form>', "wide");
    $("#rNo", m).onclick = closeModal;
    if ($("#rDel", m)) $("#rDel", m).onclick = async function(){
      if (!confirm("이 항목을 삭제할까요?")) return;
      var r = await sb.from("portal_records").delete().eq("id", x.id).select("id");
      if (r.error || !r.data || !r.data.length){ alert("삭제하지 못했습니다: " + errMsg(r)); return; }
      S.recs[key] = S.recs[key].filter(function(y){ return y.id !== x.id; }); logp(key, "delete", d.name || d.target); closeModal(); renderRecords(c, menu);
    };
    $("#rf", m).addEventListener("submit", async function(e){
      e.preventDefault(); var fd = new FormData(e.target), data = {};
      def.fields.forEach(function(f){ var v = fd.get(f[0]); v = v == null ? "" : String(v).trim(); if (f[2] === "number" && v !== "") v = +v; if (v !== "") data[f[0]] = v; });
      if (menu === "violations" && data.quarter && !/^\d{4}-[1-4]Q$/.test(data.quarter)){ alert("분기는 2026-3Q 형식으로 입력하세요."); return; }
      var r = isNew ? await sb.from("portal_records").insert({ cat: c.id, menu: menu, data: data, updated_by: me.email }).select("*")
                    : await sb.from("portal_records").update({ data: data, updated_by: me.email, updated_at: new Date().toISOString() }).eq("id", x.id).select("*");
      if (r.error || !r.data || !r.data.length){ alert("저장하지 못했습니다: " + errMsg(r)); return; }
      if (isNew) S.recs[key].push(r.data[0]); else Object.assign(x, r.data[0]);
      logp(key, isNew ? "add" : "edit", data.name || data.target); closeModal(); toast("저장했습니다."); renderRecords(c, menu);
    });
  }
  function pasteRecords(c, menu){
    var key = c.id + "." + menu;
    var m = showModal('<h3>엑셀에서 붙여넣기</h3><p class="hint">엑셀에서 아래 순서의 열을 복사해 붙여넣으세요(머리글 행은 있어도 됩니다).<br><b>성명 · 소속 · 구분(팀원/팀장/실장 이상) · 지각(회) · 미달(시간)</b></p>' +
      '<label class="hint" style="font-size:12.5px">분기<input id="pQ" value="' + esc(recFilter.violations.quarter && recFilter.violations.quarter !== "*" ? recFilter.violations.quarter : curQuarter()) + '"></label>' +
      '<textarea id="pT" rows="10" placeholder="홍길동&#9;개발팀&#9;팀원&#9;3&#9;2.5"></textarea><div id="pPrev" class="hint" style="font-size:12.5px"></div>' +
      '<div class="modal-actions"><button class="btn ghost" id="pNo">취소</button><button class="btn primary" id="pOk">추가</button></div>', "wide");
    function parse(){
      return $("#pT", m).value.split(/\r?\n/).map(function(l){ return l.split("\t"); }).filter(function(c2){ return c2[0] && c2[0].trim() && !/성명|이름/.test(c2[0]); }).map(function(c2){
        function num(v){ v = String(v || "").replace(/[^\d.]/g, ""); return v === "" ? undefined : +v; }
        return { name: c2[0].trim(), dept: (c2[1] || "").trim(), rank: (c2[2] || "팀원").trim() || "팀원", late: num(c2[3]), short_h: num(c2[4]) };
      });
    }
    $("#pT", m).addEventListener("input", function(){ var p = parse(); $("#pPrev", m).textContent = p.length + "명 인식됨" + (p.length ? " (예: " + p[0].name + " / 지각 " + (p[0].late || 0) + "회 / 미달 " + (p[0].short_h || 0) + "h)" : ""); });
    $("#pNo", m).onclick = closeModal;
    $("#pOk", m).onclick = async function(){
      var q = $("#pQ", m).value.trim(); if (!/^\d{4}-[1-4]Q$/.test(q)){ alert("분기는 2026-3Q 형식으로 입력하세요."); return; }
      var p = parse(); if (!p.length){ alert("붙여넣은 내용이 없습니다."); return; }
      var ins = p.map(function(d){ d.quarter = q; d.status = "대상 확인"; Object.keys(d).forEach(function(k){ if (d[k] === undefined) delete d[k]; }); return { cat: c.id, menu: menu, data: d, updated_by: me.email }; });
      var r = await sb.from("portal_records").insert(ins).select("*");
      if (r.error){ alert("추가하지 못했습니다: " + r.error.message); return; }
      S.recs[key] = S.recs[key].concat(r.data || []); recFilter.violations.quarter = q; logp(key, "paste", p.length + "명"); closeModal(); toast(p.length + "명을 추가했습니다."); renderRecords(c, menu);
    };
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
