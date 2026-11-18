// 자동 메일 발송기 (GitHub Actions에서 평일 오전 실행)
// 근태 › 자동 메일의 규칙(list: rule)을 읽어 대상자를 계산하고, 발송 대기열(list: queue)을 만들고,
// "발송 대기" 상태인 메일을 SMTP로 보냅니다. 규칙이 꺼져 있으면 아무것도 만들지 않습니다.
import { createClient } from "@supabase/supabase-js";
import nodemailer from "nodemailer";
import { createRequire } from "module";
const MailCore = createRequire(import.meta.url)("../mailcore.js");   // 포털과 같은 치환 칸 · 받는 사람 결정 · 메일용 HTML

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, SMTP_USER, SMTP_PASS } = process.env;
const SMTP_HOST = process.env.SMTP_HOST || "smtp.worksmobile.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SENDER = process.env.MAIL_SENDER_NAME || "HRM팀 노무관리파트";
const DRY = String(process.env.DRY_RUN || "").toLowerCase() === "true";
if (!SUPABASE_SERVICE_KEY) { console.log("SUPABASE_SERVICE_KEY 없음: 종료"); process.exit(0); }

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } });
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
const kst = new Date(Date.now() + 9 * 3600 * 1000);           // 한국 시각 기준 날짜
const today = ymd(kst);
const addDay = (s, n) => { const d = new Date(s + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };

async function recs(cat, menu) {
  const out = []; let from = 0;
  for (;;) {
    const r = await sb.from("portal_records").select("*").eq("cat", cat).eq("menu", menu).range(from, from + 999);
    if (r.error) throw r.error;
    out.push(...r.data); if (r.data.length < 1000) break; from += 1000;
  }
  return out;
}
const types = (d) => String(d.type || "").split(",").map((s) => s.trim()).filter(Boolean);

function sourceRecs(all, rule) {
  const [kind, t] = String(rule.source || "").split(":");
  const tagq = String(rule.tagq || "").trim();
  let list = kind === "wt"
    ? all.wt.filter((x) => (x.data.list || "worktype") === "worktype" && types(x.data).includes(t))
    : (kind === "absence" ? all.absence : all.leave).filter((x) => t === "*" || x.data.type === t);
  list = list.filter((x) => !x.data.prior);   // 입사 전(타사) 사용 기록은 메일 대상에서 제외
  if (tagq) list = list.filter((x) => [x.data.tags, x.data.type, x.data.content].join(" ").includes(tagq));
  return list;
}
const eventDate = (rule, d) => rule.event === "end" ? d.end : rule.event === "return" ? (d.return_date || (d.end ? addDay(d.end, 1) : "")) : d.start;

function dueTargets(all, rule) {
  const out = [];
  for (const x of sourceRecs(all, rule)) {
    const ev = eventDate(rule, x.data); if (!ev) continue;
    if (rule.when === "monthly") {
      const last = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + 1, 0)).getUTCDate();
      const day = Math.min(Number(rule.day) || 1, last);
      if (kst.getUTCDate() !== day) continue;
      const base = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth() + (rule.scope === "next" ? 1 : 0), 1));
      if (ev.slice(0, 7) === ymd(base).slice(0, 7)) out.push({ rec: x, date: ev, due: today });
    } else {
      const due = addDay(ev, Number(rule.offset) || 0);
      if (due <= today && due >= addDay(today, -3)) out.push({ rec: x, date: ev, due });   // 주말·휴일에 걸린 건은 3일까지 뒤늦게 처리
    }
  }
  return out;
}
const CTX = { sender: SENDER, today };
const fill = (tpl, d) => MailCore.fill(tpl, d, CTX);
const bodyHtmlOf = (rule) => rule.body_html || String(rule.body || "").split(/\r?\n/).map((l) => "<p>" + (MailCore.esc(l) || "<br>") + "</p>").join("");
// 받는 사람: 새 형식(rcpt_to) → 예전 고정 수신자(to) → 예전 기본값(기록의 개인 메일, 없으면 주소록)
function rcpt(rule, d, which) {
  if (which === "cc") return MailCore.resolve(rule.rcpt_cc || { extra: rule.cc || "" }, d, people);
  if (rule.rcpt_to) return MailCore.resolve(rule.rcpt_to, d, people);
  if (rule.to) return MailCore.resolve({ extra: rule.to }, d, people);
  return MailCore.resolve(d.email ? { selfPersonal: true } : { self: true }, d, people);
}
function build(rule, d) {
  const to = rcpt(rule, d, "to"), cc = rcpt(rule, d, "cc");
  const html = MailCore.fill(bodyHtmlOf(rule), d, CTX, { html: true });
  return { email: to.list.map((x) => x.email).join(", "), cc: cc.list.map((x) => x.email).join(", "), warn: to.missing.concat(cc.missing),
    subject: fill(rule.subject, d), body: MailCore.htmlToText(html), body_html: MailCore.emailHtml(html) };
}
async function insert(data) { const r = await sb.from("portal_records").insert({ cat: "att", menu: "automail", data, created_by: "auto-mail", updated_by: "auto-mail" }).select("*"); if (r.error) throw r.error; return r.data[0]; }
async function patch(x, p) { const data = { ...x.data, ...p }; const r = await sb.from("portal_records").update({ data, updated_by: "auto-mail", updated_at: new Date().toISOString() }).eq("id", x.id); if (r.error) throw r.error; x.data = data; }

const am = await recs("att", "automail");
const all = { wt: await recs("att", "worktypes"), absence: await recs("absence", "status"), leave: await recs("leave", "status") };
const rules = am.filter((x) => x.data.list === "rule" && x.data.enabled === true);
const people = am.filter((x) => x.data.list === "people");
const queue = am.filter((x) => x.data.list === "queue");
const keys = new Set(queue.map((x) => x.data.key));
let made = 0, sent = 0, failed = 0, noaddr = 0;

for (const rx of rules) {
  const rule = rx.data;
  for (const t of dueTargets(all, rule)) {
    const key = rx.id + "|" + t.rec.id + "|" + t.date;
    if (keys.has(key)) continue;
    const d = t.rec.data, m = build(rule, d);
    const row = { list: "queue", key, rule_id: rx.id, rule_name: rule.target, rec_id: t.rec.id, target: d.target || "", org: d.org || "", ...m, due: t.due,
      status: !m.email ? "주소 필요" : rule.mode === "auto" ? "발송 대기" : "승인 대기" };
    if (DRY) { console.log("[dry] would queue:", rule.target, "→", row.target, row.status); continue; }
    queue.push(await insert(row)); keys.add(key); made++;
  }
}
// 주소가 생긴 건은 다시 대기 상태로
for (const x of queue.filter((q) => q.data.status === "주소 필요")) {
  const rule = (am.find((r) => r.id === x.data.rule_id) || {}).data || {};
  const rec = [...all.wt, ...all.absence, ...all.leave].find((r) => r.id === x.data.rec_id);
  const m = rec ? build(rule, rec.data) : null;
  if (m && m.email && !DRY) await patch(x, { ...m, status: rule.mode === "auto" ? "발송 대기" : "승인 대기" }); else noaddr++;
}
// ── 월별 퇴직자 연차 정산 메일 (휴가 › 연차유급휴가 관리) ──
// 급여일(25일, 주말·공휴일이면 직전 영업일) 기준 영업일 5일 전부터 급여일 전까지, 그달 퇴사자 정산 내역을 한 번 보낸다.
const HO_FIXED = ["01-01", "03-01", "05-05", "06-06", "08-15", "10-03", "10-09", "12-25"];
const HO_VAR = { 2025: ["01-27", "01-28", "01-29", "01-30", "03-03", "05-05", "05-06", "06-03", "10-05", "10-06", "10-07", "10-08"],
  2026: ["02-16", "02-17", "02-18", "03-02", "05-24", "05-25", "06-03", "08-17", "09-24", "09-25", "09-26", "09-28", "10-05"],
  2027: ["02-06", "02-07", "02-08", "02-09", "05-13", "08-16", "10-04", "10-11", "10-14", "10-15", "10-16", "10-18", "12-27"],
  2028: ["01-26", "01-27", "01-28", "05-02", "10-02", "10-03", "10-04"] };
const isBiz = (s) => { const w = new Date(s + "T00:00:00Z").getUTCDay(); const md = s.slice(5); return w !== 0 && w !== 6 && !HO_FIXED.includes(md) && !(HO_VAR[+s.slice(0, 4)] || []).includes(md); };
function settleSendDate(ym) { let pay = ym + "-25"; while (!isBiz(pay)) pay = addDay(pay, -1); let d = pay, n = 0; while (n < 5) { d = addDay(d, -1); if (isBiz(d)) n++; } return { pay, send: d }; }
const r2 = (x) => Math.round(x * 100) / 100;
// 대상자별로 「어느 메일에 포함됐는지 · 발송됐는지」를 정산 기록(data.mail)에 남긴다.
// 첫 메일 뒤에 그달 퇴사자가 더 등록되면 급여일 전까지 [추가] 메일로 그 사람만 보낸다.
let ann = [];
const annById = {};
try {
  ann = await recs("leave", "annual"); ann.forEach((x) => { annById[x.id] = x; });
  const acfg = ann.find((x) => x.data.list === "config");
  const ym = today.slice(0, 7), sd = settleSendDate(ym);
  const monthMails = queue.filter((q) => q.data.kind === "annual-settle" && q.data.month === ym);
  const inMail = (x) => x.data.mail && x.data.mail.month === ym && x.data.mail.status !== "실패";
  const pending = ann.filter((x) => x.data.list === "settle" && String(x.data.retire || "").slice(0, 7) === ym && !inMail(x)).sort((a, b) => String(a.data.retire).localeCompare(String(b.data.retire)));
  const first = !monthMails.length;
  const hasTo = acfg && (acfg.data.rcpt_to ? !MailCore.specEmpty(acfg.data.rcpt_to) : /@/.test(acfg.data.to || ""));
  if (acfg && acfg.data.enabled && hasTo && today >= sd.send && today < sd.pay && (first || pending.length)) {
    const rows = pending, akey = "annual-settle|" + ym + "|" + (monthMails.length + 1);
    const mm = MailCore.settleMail(ym, rows, sd.pay, acfg.data, !first);
    const to = MailCore.resolve(acfg.data.rcpt_to || { extra: acfg.data.to || "" }, {}, people), cc = MailCore.resolve(acfg.data.rcpt_cc || { extra: acfg.data.cc || "" }, {}, people);
    const row = { list: "queue", kind: "annual-settle", month: ym, round: first ? "정기" : "추가", key: akey, rule_name: "퇴직자 연차 정산(월별)" + (first ? "" : " 추가분"), target: "퇴직자 " + rows.length + "명", org: "",
      email: to.list.map((x) => x.email).join(", "), cc: cc.list.map((x) => x.email).join(", "), warn: to.missing.concat(cc.missing),
      people: rows.map((o) => ({ id: o.id, target: o.data.target, org: o.data.org || "", retire: o.data.retire, final: (o.data.result || {}).final })),
      subject: mm.subject, body: mm.text, body_html: mm.emailHtml, due: sd.send, status: to.list.length ? "발송 대기" : "주소 필요" };
    if (DRY) console.log("[dry] would queue annual settle mail:", row.round, ym, rows.map((o) => o.data.target).join(", ") || "(0명)", "send", sd.send, "pay", sd.pay);
    else {
      queue.push(await insert(row)); keys.add(akey); made++;
      for (const o of rows) await patch(o, { mail: { month: ym, key: akey, status: "발송 대기", queued: today } });
      await patch(acfg, { sent_month: ym, last_sent: today });
    }
  } else if (DRY) console.log("[dry] annual settle mail: not due or nothing new (send", sd.send, "pay", sd.pay + ", 미포함 " + pending.length + "명)");
} catch (e) { console.log("연차 정산 메일 처리 중 오류:", e.message || e); }
// 정산 메일 발송 결과를 대상자 기록에 반영
async function markPeople(x, status, extra) {
  if (x.data.kind !== "annual-settle") return;
  for (const p of x.data.people || []) { const o = annById[p.id]; if (o) { try { await patch(o, { mail: { ...(o.data.mail || {}), month: x.data.month, key: x.data.key, status, ...extra } }); } catch (e) { console.log("대상자 상태 기록 실패:", p.target, e.message || e); } } }
}

const ready = queue.filter((q) => q.data.status === "발송 대기");
if (ready.length && !DRY) {
  if (!SMTP_USER || !SMTP_PASS) console.log("SMTP_USER / SMTP_PASS 가 없어 " + ready.length + "건을 보내지 못했습니다.");
  else {
    const tr = nodemailer.createTransport({ host: SMTP_HOST, port: SMTP_PORT, secure: SMTP_PORT === 465, auth: { user: SMTP_USER, pass: SMTP_PASS } });
    for (const x of ready) {
      try {
        await tr.sendMail({ from: `"${SENDER}" <${SMTP_USER}>`, to: x.data.email, cc: x.data.cc || undefined, subject: x.data.subject, text: x.data.body, html: x.data.body_html || undefined });
        const at = new Date().toISOString();
        await patch(x, { status: "발송 완료", sent_at: at, error: "" }); sent++; await markPeople(x, "발송 완료", { sent_at: at });
      } catch (e) { const er = String(e.message || e).slice(0, 300); await patch(x, { status: "실패", error: er }); failed++; await markPeople(x, "실패", { error: er }); }
    }
  }
}
const msg = `규칙 ${rules.length}개 · 새로 만든 메일 ${made}건 · 발송 ${sent}건 · 실패 ${failed}건 · 주소 필요 ${noaddr}건` + (DRY ? " (dry run)" : "");
console.log(today, msg);
if (!DRY) {
  const cfg = am.find((x) => x.data.list === "config");
  const stamp = { list: "config", last_run: today + " " + pad(kst.getUTCHours()) + ":" + pad(kst.getUTCMinutes()), last_msg: msg };
  if (cfg) await patch(cfg, stamp); else await insert(stamp);
}
