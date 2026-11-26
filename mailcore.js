/* 자동 메일 공통 모듈 — 포털 화면(app.js)과 발송기(scripts/send-mail.mjs)가 같이 씁니다.
   치환 칸 · 받는 사람/참조 결정 · 메일용 HTML 변환 · 퇴직자 연차 정산 메일 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MailCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var DOW = ["일", "월", "화", "수", "목", "금", "토"];
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function parse(s) { if (!s) return null; var p = String(s).slice(0, 10).split("-"); if (p.length < 3) return null; return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function ymd(d) { return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate()); }
  function addDay(s, n) { var d = parse(s); if (!d) return ""; d.setUTCDate(d.getUTCDate() + n); return ymd(d); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function prevWeekday(s) { var d = addDay(s, -1); while (d) { var w = parse(d).getUTCDay(); if (w !== 0 && w !== 6) return d; d = addDay(d, -1); } return ""; }
  function monthsText(a, b) {
    var A = parse(a), B = parse(b); if (!A || !B || B < A) return "";
    var e = parse(addDay(b, 1)), m = (e.getUTCFullYear() - A.getUTCFullYear()) * 12 + e.getUTCMonth() - A.getUTCMonth(), dd = e.getUTCDate() - A.getUTCDate();
    if (dd < 0) { m--; var pm = new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 0)).getUTCDate(); dd += pm; }
    return (m > 0 ? m + "개월" : "") + (dd > 0 ? (m > 0 ? " " : "") + dd + "일" : "") || "0일";
  }
  function retOf(d) { return d.return_date || (d.end ? addDay(d.end, 1) : ""); }
  // 치환 칸: [이름, 설명, 쓰는 곳(all|absence|leave|wt), 값 구하기, 날짜 여부]
  var VARS = [
    ["이름", "대상자 이름", "all", function (d) { return d.target; }],
    ["소속", "사업부", "all", function (d) { return d.org; }],
    ["팀", "팀", "all", function (d) { return d.team; }],
    ["구분", "휴직·휴가 종류 / 근무형태", "all", function (d) { return d.type; }],
    ["시작일", "기록의 시작일", "all", function (d) { return d.start; }, 1],
    ["종료일", "기록의 종료일", "all", function (d) { return d.end; }, 1],
    ["일수", "일수", "all", function (d) { return d.days; }],
    ["담당자", "보내는 담당자 이름", "all", function (d, c) { return c.sender; }],
    ["오늘", "발송일", "all", function (d, c) { return c.today; }, 1],
    ["휴직 예정일", "휴직 시작일", "absence", function (d) { return d.start; }, 1],
    ["마지막 출근일", "시작일 직전 평일", "absence,leave", function (d) { return d.start ? prevWeekday(d.start) : ""; }, 1],
    ["복직일", "복직일(없으면 종료 다음 날)", "absence,leave", function (d) { return retOf(d); }, 1],
    ["휴직 기간", "시작일 ~ 종료일", "absence,leave", function (d) { return d.start ? d.start + " ~ " + (d.end || "") : ""; }],
    ["휴직 개월수", "달력 기준 기간(예: 10개월 0일)", "absence", function (d) { return d.start && d.end ? monthsText(d.start, d.end) : ""; }],
    ["문서번호", "휴직원·휴가 문서번호", "absence,leave", function (d) { return d.basis; }],
    ["복직원 문서번호", "복직원 문서번호", "absence,leave", function (d) { return d.return_doc; }],
    ["자녀 생년월일", "자녀 생년월일(실제 출산일)", "absence,leave,wt", function (d) { return d.birth; }, 1],
    ["출산 예정일", "출산 예정일", "absence,leave,wt", function (d) { return d.due_date; }, 1],
    ["돌봄 대상 가족", "가족돌봄 대상", "absence,leave,wt", function (d) { return d.family; }],
    ["1주 소정근로시간", "단축근무 1주 시간", "wt", function (d) { return d.weekly_hours ? d.weekly_hours + "시간" : ""; }],
    ["단축 사유", "육아기·임신기·가족돌봄", "wt", function (d) { return d.short_reason; }],
    ["개인 메일", "기록에 적힌 개인 메일", "absence,leave", function (d) { return d.email; }]
  ];
  var VAR_MAP = {}; VARS.forEach(function (v) { VAR_MAP[v[0]] = v; });
  function varsFor(kind) { return VARS.filter(function (v) { return v[2] === "all" || !kind || v[2].split(",").indexOf(kind) >= 0; }); }
  function fmtDate(s, f) { var d = parse(s); if (!d) return s; if (f === "요일") return s + "(" + DOW[d.getUTCDay()] + ")"; if (f === "한글") return d.getUTCFullYear() + "년 " + (d.getUTCMonth() + 1) + "월 " + d.getUTCDate() + "일(" + DOW[d.getUTCDay()] + ")"; if (f === "점") return String(d.getUTCFullYear()).slice(2) + "." + pad(d.getUTCMonth() + 1) + "." + pad(d.getUTCDate()); return s; }
  // {이름} {복직일|요일} 등을 대상자 값으로 바꾼다. opt.html: 값을 HTML로 이스케이프, opt.mark: 빈 값 표시(미리보기용)
  function fill(tpl, d, ctx, opt) {
    d = d || {}; ctx = ctx || {}; opt = opt || {}; var missing = [];
    var out = String(tpl || "").replace(/\{([^{}|]+)(?:\|([^{}]+))?\}/g, function (m0, k, f) {
      k = k.trim(); var v = VAR_MAP[k]; if (!v) return m0;
      var val = v[3](d, ctx); if (val != null && val !== "" && v[4] && f) val = fmtDate(String(val), f.trim());
      if (val == null || val === "") { missing.push(k); return opt.mark ? '<mark class="mv-miss">' + esc(k) + ' 없음</mark>' : "-"; }
      return opt.html ? esc(val) : String(val);
    });
    if (opt.report) return { text: out, missing: missing };
    return out;
  }
  // 받는 사람 · 참조: { self, selfPersonal, leader, ids:[], extra:"" } (예전 규칙의 문자열은 extra로 읽음)
  function normSpec(v) {
    if (v && typeof v === "object") return { self: !!v.self, selfPersonal: !!v.selfPersonal, leader: !!v.leader, sameTeam: !!v.sameTeam, ids: (v.ids || []).slice(), teams: (v.teams || []).slice(), extra: v.extra || "" };
    return { self: false, selfPersonal: false, leader: false, sameTeam: false, ids: [], teams: [], extra: String(v || "") };
  }
  function splitMails(s) { return String(s || "").split(/[,;\s]+/).map(function (x) { return x.trim(); }).filter(function (x) { return /@/.test(x); }); }
  function pdata(p) { return p.data || p; }
  function active(p) { var x = pdata(p); return !x.inactive; }
  // 조직도 기준 팀 구성원(퇴사·제외 표시된 사람 제외)
  function teamMembers(people, org, team) { org = String(org || "").trim(); team = String(team || "").trim(); if (!team) return [];
    return people.filter(function (p) { var x = pdata(p); return active(p) && (x.kind === "직원" || x.kind === "직책자" || !x.kind) && String(x.team || "").trim() === team && (!org || String(x.org || "").trim() === org); }).map(pdata); }
  function findSelf(people, d) {
    var nm = String(d.target || "").trim(); if (!nm) return null;
    var l = people.filter(function (p) { var x = pdata(p); return String(x.target || "").trim() === nm && active(p); });
    if (l.length > 1) { var o = l.filter(function (p) { return (pdata(p).org || "") === (d.org || ""); }); if (o.length) l = o; }
    return l[0] ? pdata(l[0]) : null;
  }
  function scopeList(x) { return String(x.scope || "").split(/[,\n]/).map(function (s) { return s.trim(); }).filter(Boolean); }
  function findLeaders(people, d) {
    var team = String(d.team || "").trim(), org = String(d.org || "").trim(), nm = String(d.target || "").trim();
    var leaders = people.filter(active).map(pdata).filter(function (x) { return x.kind === "직책자" && String(x.target || "").trim() !== nm; });
    var byTeam = team ? leaders.filter(function (x) { return scopeList(x).some(function (s) { return s === team || s === org + " " + team || s === org + "/" + team || s === org + " › " + team; }); }) : [];
    if (byTeam.length) return byTeam;
    return org ? leaders.filter(function (x) { return scopeList(x).indexOf(org) >= 0; }) : [];
  }
  // 반환: { list:[{email,name,why}], missing:[사유] }
  function resolve(spec, d, people) {
    spec = normSpec(spec); people = people || []; d = d || {};
    var list = [], missing = [], seen = {};
    function add(email, name, why) { email = String(email || "").trim(); if (!/@/.test(email)) return; var k = email.toLowerCase(); if (seen[k]) return; seen[k] = 1; list.push({ email: email, name: name || "", why: why }); }
    if (spec.self) { var me = findSelf(people, d); if (me && me.email) add(me.email, d.target, "대상자 본인"); else missing.push("대상자 본인 회사 메일(주소록에 " + (d.target || "이름") + " 없음)"); }
    if (spec.selfPersonal) { var pm = d.email || ((findSelf(people, d) || {}).email2); if (pm) add(pm, d.target, "대상자 개인 메일"); else missing.push("대상자 개인 메일(기록·주소록에 없음)"); }
    if (spec.leader) { var ls = findLeaders(people, d); if (ls.length) ls.forEach(function (x) { add(x.email, x.target, "상위 직책자"); }); else missing.push("상위 직책자(" + [d.org, d.team].filter(Boolean).join(" ") + " 담당 직책자 미지정)"); }
    if (spec.sameTeam) { var tm = teamMembers(people, d.org, d.team); if (tm.length) tm.forEach(function (x) { add(x.email, x.target, "같은 팀"); }); else missing.push("대상자와 같은 팀(" + [d.org, d.team].filter(Boolean).join(" ") + ") 구성원이 조직도에 없음"); }
    spec.teams.forEach(function (t) { var tm2 = teamMembers(people, t.org, t.team); if (tm2.length) tm2.forEach(function (x) { add(x.email, x.target, (t.org ? t.org + " " : "") + t.team); }); else missing.push((t.org ? t.org + " " : "") + t.team + " 구성원이 조직도에 없음"); });
    spec.ids.forEach(function (id) { var p = people.filter(function (q) { return q.id === id; })[0]; if (p) add(pdata(p).email, pdata(p).target, pdata(p).role || pdata(p).kind || "명단"); else missing.push("명단에서 지워진 사람"); });
    splitMails(spec.extra).forEach(function (e) { add(e, "", "직접 입력"); });
    return { list: list, missing: missing };
  }
  function specEmpty(spec) { spec = normSpec(spec); return !spec.self && !spec.selfPersonal && !spec.leader && !spec.sameTeam && !spec.ids.length && !spec.teams.length && !splitMails(spec.extra).length; }
  // 포털 편집기 HTML → 메일용(클래스 대신 인라인 스타일)
  var NOTE_C = { info: ["#eff6ff", "#93c5fd"], tip: ["#ecfdf5", "#86efac"], warn: ["#fffbeb", "#fcd34d"], danger: ["#fef2f2", "#fca5a5"] };
  function emailHtml(html) {
    var h = String(html || "");
    h = h.replace(/<span class="mvar">([\s\S]*?)<\/span>/g, "$1");
    h = h.replace(/<div class="note (info|tip|warn|danger)"[^>]*>/g, function (m, k) { var c = NOTE_C[k]; return '<div style="background:' + c[0] + ';border-left:4px solid ' + c[1] + ';border-radius:6px;padding:10px 14px;margin:10px 0">'; });
    h = h.replace(/<span class="nt">([\s\S]*?)<\/span>/g, '<b style="display:block;margin-bottom:4px">$1</b>');
    h = h.replace(/<table([^>]*)>/g, function (m, a) { return '<table' + a.replace(/\sclass="[^"]*"/, "") + ' style="border-collapse:collapse;width:100%;margin:8px 0;font-size:13px">'; });
    h = h.replace(/<(td|th)(\s[^>]*)?>/g, function (m, t, a) { var st = ""; a = String(a || "").replace(/\sstyle="([^"]*)"/, function (x, s) { st = s; return ""; }); return "<" + t + a + ' style="border:1px solid #d1d5db;padding:6px 9px;vertical-align:top;' + (t === "th" ? "background:#f3f4f6;font-weight:700;text-align:left;" : "") + st + '">'; });
    h = h.replace(/<span class="red">/g, '<span style="color:#b91c1c">').replace(/<span class="blue">/g, '<span style="color:#1d4ed8">');
    h = h.replace(/<span class="fs-s">/g, '<span style="font-size:12px">').replace(/<span class="fs-l">/g, '<span style="font-size:17px">').replace(/<span class="fs-xl">/g, '<span style="font-size:20px">');
    h = h.replace(/<details[^>]*>\s*<summary>([\s\S]*?)<\/summary>/g, '<div><b>$1</b>').replace(/<\/details>/g, "</div>").replace(/<div class="acc-b">/g, "<div>");
    h = h.replace(/\sclass="[^"]*"/g, "");
    return '<div style="font-family:\'Malgun Gothic\',\'Apple SD Gothic Neo\',sans-serif;font-size:14px;line-height:1.7;color:#111827">' + h + "</div>";
  }
  function htmlToText(html) {
    return String(html || "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n").replace(/<li[^>]*>/gi, "· ").replace(/<\/t[dh]>/gi, "\t").replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  // 퇴직자 연차 정산 메일(머리말은 설정 화면에서 편집, 내역 표는 자동)
  function r2(x) { return Math.round(x * 100) / 100; }
  var SETTLE_HEAD = "<p>{대상월} 퇴직자 연차 정산 내역{추가}을 공유드립니다. (급여일 {급여일} 기준)</p>";
  function settleMail(ym, rows, pay, cfg, extra) {
    cfg = cfg || {}; var ymL = ym.replace("-", "년 ") + "월";
    function rep(s) { return String(s || "").replace(/\{대상월\}/g, ymL).replace(/\{급여일\}/g, pay).replace(/\{인원\}/g, rows.length + "명").replace(/\{추가\}/g, extra ? " 추가분" : ""); }
    var head = rep(cfg.head_html || SETTLE_HEAD), foot = rep(cfg.foot_html || "");
    var tbl = rows.length ? '<table class="t"><thead><tr><th>No</th><th>이름</th><th>소속</th><th>입사일</th><th>퇴사일</th><th>입사일 기준</th><th>회계연도 기준</th><th>차이</th><th>퇴직연도 잔여</th><th>미사용 보상휴가</th><th>최종 지급 일수</th><th>비고</th></tr></thead><tbody>' +
      rows.map(function (o, i) { var d = o.data, R = d.result || {}; return "<tr><td>" + (i + 1) + "</td><td><b>" + esc(d.target) + "</b></td><td>" + esc([d.org, d.team].filter(Boolean).join(" ")) + "</td><td>" + esc(d.join) + "</td><td>" + esc(d.retire) + "</td><td>" + esc(R.hTotal) + "일</td><td>" + esc(R.fTotal) + "일</td><td>" + esc(R.diffPay) + "일</td><td>" + esc(r2((+R.curF || 0) + (+R.curM || 0) - (+R.used || 0))) + "일</td><td>" + (d.comp === "" || d.comp == null ? '<span class="red">미입력(확인 필요)</span>' : esc(d.comp) + "일") + "</td><td><b>" + esc(R.final) + "일</b></td><td>" + esc(d.note || "") + "</td></tr>"; }).join("") + "</tbody></table>"
      : "<p>이번 달 퇴직자 정산 기록이 없습니다.</p>";
    var html = head + tbl + foot;
    return { subject: "[연차 정산]" + (extra ? "[추가] " : " ") + ymL + " 퇴직자 연차 정산 내역 (" + rows.length + "명)", html: html, emailHtml: emailHtml(html), text: htmlToText(html) };
  }
  return { teamMembers: teamMembers, VARS: VARS, varsFor: varsFor, fill: fill, fmtDate: fmtDate, normSpec: normSpec, resolve: resolve, specEmpty: specEmpty, splitMails: splitMails, emailHtml: emailHtml, htmlToText: htmlToText, settleMail: settleMail, SETTLE_HEAD: SETTLE_HEAD, esc: esc, addDay: addDay };
});
