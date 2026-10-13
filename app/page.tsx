"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DateResult, Person, Shortlist } from "@/lib/types";
import { rankFor } from "@/lib/rank";
import { parseLines } from "@/lib/parse";

type Tab = "profiles" | "dates" | "rankings";
type Stage = "idle" | "profiles" | "triage" | "dating" | "done";
const K = 4; // dates per person after triage

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

export default function Home() {
  const [raw, setRaw] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [dates, setDates] = useState<DateResult[]>([]);
  const [shortlists, setShortlists] = useState<Record<string, Shortlist>>({});
  const [stage, setStage] = useState<Stage>("idle");
  const [tab, setTab] = useState<Tab>("profiles");
  const [selPerson, setSelPerson] = useState<string | null>(null);
  const [selDate, setSelDate] = useState<string | null>(null);
  const [rankPerson, setRankPerson] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [datePlan, setDatePlan] = useState({ total: 0 });
  const peopleRef = useRef<Person[]>([]);
  const [health, setHealth] = useState<{ mode: string; anthropic: boolean; apify: boolean } | null>(null);
  useEffect(() => { fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => {}); }, []);

  const say = (m: string) => setLog((l) => [...l.slice(-80), m]);
  const patch = (id: string, p: Partial<Person>) => {
    peopleRef.current = peopleRef.current.map((x) => (x.id === id ? { ...x, ...p } : x));
    setPeople(peopleRef.current);
  };
  const byId = useMemo(() => Object.fromEntries(people.map((p) => [p.id, p])), [people]);
  const name = (id: string) => byId[id]?.profile?.name ?? id;
  const parsed = useMemo(() => parseLines(raw), [raw]);
  const bad = parsed.filter((p) => !p.linkedin || !p.instagram);
  const ready = people.filter((p) => p.status === "ready");

  async function run() {
    const rows = parsed.filter((p) => p.linkedin && p.instagram);
    const init: Person[] = rows.map((r, i) => ({ id: `p${i + 1}`, linkedin: r.linkedin, instagram: r.instagram, status: "queued" }));
    peopleRef.current = init; setPeople(init); setDates([]); setShortlists({}); setLog([]); setTab("profiles"); setStage("profiles");

    // 1. scrape both sources + analyze each person
    await pool(init, 4, async (p) => {
      try {
        patch(p.id, { status: "scraping" }); say(`Scraping LinkedIn + Instagram for ${p.id}...`);
        const scraped = await post<Person["scraped"]>("/api/scrape", { linkedin: p.linkedin, instagram: p.instagram });
        patch(p.id, { status: "analyzing", scraped, avatar: scraped!.instagram.avatar });
        say(`Agent ${p.id} reading ${scraped!.linkedin.source} + ${scraped!.instagram.source}...`);
        const { profile } = await post<{ profile: Person["profile"] }>("/api/analyze", { scraped, linkedin: p.linkedin, instagram: p.instagram });
        patch(p.id, { status: "ready", profile }); say(`Profile ready: ${profile!.name}`);
      } catch (e: any) { patch(p.id, { status: "failed", error: e.message }); say(`FAILED ${p.id}: ${e.message}`); }
    });

    const good = peopleRef.current.filter((p) => p.status === "ready");
    if (good.length < 2) { setStage("done"); say("Need at least 2 analyzed people to date."); return; }

    // 2. triage: each agent picks who it wants to meet (avoids O(n^2) dates)
    setStage("triage"); say("Each agent is scanning the pool and picking who to meet...");
    const sl: Record<string, Shortlist> = {};
    await pool(good, 4, async (p) => {
      try {
        const { picks } = await post<{ picks: Shortlist }>("/api/shortlist", { me: p.profile, others: good.filter((o) => o.id !== p.id).map((o) => ({ id: o.id, profile: o.profile })), k: K });
        sl[p.id] = picks; setShortlists({ ...sl });
        say(`${p.profile!.name} wants to meet: ${picks.map((x) => byId[x.id]?.profile?.name ?? peopleRef.current.find((q) => q.id === x.id)?.profile?.name).join(", ")}`);
      } catch (e: any) { say(`Triage failed for ${p.id}: ${e.message}`); }
    });

    // 3. dates, deduped pairs (A picked B or B picked A)
    const pairs = new Map<string, [string, string]>();
    for (const [a, picks] of Object.entries(sl)) for (const pk of picks) { const key = [a, pk.id].sort().join("|"); if (!pairs.has(key)) pairs.set(key, [a, pk.id]); }
    const list = [...pairs.values()];
    setDatePlan({ total: list.length }); setStage("dating"); setTab("dates"); say(`${list.length} dates scheduled.`);
    const done: DateResult[] = [];
    await pool(list, 5, async ([a, b]) => {
      const pa = peopleRef.current.find((p) => p.id === a)!.profile!, pb = peopleRef.current.find((p) => p.id === b)!.profile!;
      try {
        const r = await post<Omit<DateResult, "id" | "a" | "b">>("/api/date", { a: pa, b: pb, rounds: 3 });
        done.push({ id: `${a}-${b}`, a, b, ...r }); setDates([...done]);
        say(`Date done: ${pa.name} x ${pb.name} -> ${r.verdictA.score}/${r.verdictB.score}`);
      } catch (e: any) { say(`Date failed ${pa.name} x ${pb.name}: ${e.message}`); }
    });
    setStage("done"); setTab("rankings"); say("All dates complete. Rankings ready.");
  }

  const exportJson = () => {
    const blob = new Blob([JSON.stringify({ people, dates, shortlists }, null, 1)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "demo.json"; a.click();
  };
  async function loadDemo() {
    const r = await fetch("/demo.json"); if (!r.ok) return alert("No /demo.json found. Run a cohort, hit Export, and save the file to public/demo.json.");
    const d = await r.json(); peopleRef.current = d.people; setPeople(d.people); setDates(d.dates); setShortlists(d.shortlists); setStage("done"); setTab("rankings");
  }

  const ids = ready.map((p) => p.id);
  const steps: [Stage, string, string][] = [["profiles", "1 - Read", "LinkedIn + Instagram -> profile"], ["triage", "2 - Triage", "Agents pick who to meet"], ["dating", "3 - Date", "Agents date on behalf"], ["done", "4 - Rank", "Mutual-fit rankings"]];
  const order = ["idle", "profiles", "triage", "dating", "done"];

  return (
    <div className="wrap">
      <div className="lbl">Orbit Dates</div>
      <h1>Your agent dates so you don't have to.</h1>
      <p className="sub">Paste a LinkedIn and a public Instagram per person. Each person gets an agent that reads them, goes on dates with every other agent, and returns a ranking of who fits best.</p>

      {health?.mode === "fixture" && <div className="card err">FIXTURE MODE: all profiles, dates and scores below are synthetic test data. No model was called. Not real agent activity.</div>}
      {health && health.mode === "live" && !health.anthropic && <div className="card err">ANTHROPIC_API_KEY is not configured on the server, so analysis and dating cannot run. Add it to .env.local (or your host's env vars) and restart.</div>}
      {health && health.mode === "live" && health.anthropic && !health.apify && <div className="card status">APIFY_TOKEN not set: scraping falls back to public page meta tags only (thin data, profiles will be low confidence).</div>}

      <div className="card">
        <div className="lbl" style={{ marginTop: 0 }}>One person per line: LinkedIn URL, Instagram URL ({parsed.filter((p) => p.linkedin && p.instagram).length} valid)</div>
        <textarea rows={7} value={raw} onChange={(e) => setRaw(e.target.value)} disabled={stage !== "idle" && stage !== "done"}
          placeholder={"https://www.linkedin.com/in/someone, https://www.instagram.com/someone\nhttps://www.linkedin.com/in/other, https://www.instagram.com/other"} />
        {bad.length > 0 && <p className="err">Line {bad.map((b) => b.line).join(", ")}: needs both a LinkedIn and an Instagram URL.</p>}
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={run} disabled={parsed.filter((p) => p.linkedin && p.instagram).length < 2 || (stage !== "idle" && stage !== "done")}>Send the agents out</button>
          <button className="ghost" onClick={loadDemo}>Load finished demo</button>
          {people.length > 0 && <button className="ghost" onClick={exportJson}>Export run (JSON)</button>}
        </div>
      </div>

      {stage !== "idle" && <>
        <div className="steps">{steps.map(([s, t, d]) => {
          const cur = order.indexOf(stage), me = order.indexOf(s), on = cur >= me;
          const pct = s === "profiles" ? (people.length ? (100 * (people.filter((p) => p.status === "ready" || p.status === "failed").length)) / people.length : 0) : s === "dating" ? (datePlan.total ? (100 * dates.length) / datePlan.total : 0) : on && cur > me ? 100 : 0;
          return <div key={s} className={"step" + (on ? " on" : "")}><b>{t}</b><span className="status">{d}</span><div className="bar"><i style={{ width: (cur > me ? 100 : pct) + "%" }} /></div></div>;
        })}</div>
        <div className="card feed">{log.map((l, i) => <div key={i}>{l}</div>)}</div>

        <div className="tabs">{(["profiles", "dates", "rankings"] as Tab[]).map((t) => <div key={t} className={"tab" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t === "profiles" ? `Profiles (${ready.length}/${people.length})` : t === "dates" ? `Dates (${dates.length})` : "Rankings"}</div>)}</div>

        {tab === "profiles" && (selPerson && byId[selPerson]?.profile ? <ProfilePage p={byId[selPerson]} back={() => setSelPerson(null)} /> :
          <div className="grid">{people.map((p) => (
            <div key={p.id} className="card" style={{ cursor: p.profile ? "pointer" : "default" }} onClick={() => p.profile && setSelPerson(p.id)}>
              <div className="row"><Avatar p={p} /><div><b>{p.profile?.name ?? p.id}</b><div className="status">{p.profile?.headline ?? ""}</div></div></div>
              <div className={"status " + (p.status === "ready" ? "ok" : p.status === "failed" ? "bad" : "")} style={{ marginTop: 8 }}>{p.status}{p.error ? `: ${p.error}` : ""}</div>
              {p.profile && <div style={{ marginTop: 6 }}>{p.profile.hobbies.slice(0, 4).map((h) => <span key={h} className="pill">{h}</span>)}</div>}
            </div>))}</div>)}

        {tab === "dates" && (selDate ? <DatePage d={dates.find((d) => d.id === selDate)!} name={name} back={() => setSelDate(null)} /> :
          <div className="grid">{dates.map((d) => (
            <div key={d.id} className="card" style={{ cursor: "pointer" }} onClick={() => setSelDate(d.id)}>
              <b>{name(d.a)} x {name(d.b)}</b>
              <div className="row" style={{ marginTop: 6 }}><span className="score">{d.verdictA.score}</span><span className="status">/</span><span className="score">{d.verdictB.score}</span></div>
              <div className="status">{d.verdictA.chemistry}</div>
              <div className="chat"><div className="msg"><small>{name(d.a)}</small>{d.turns[0]?.text}</div></div>
            </div>))}{dates.length === 0 && <div className="status">Dates will stream in here as the agents finish them.</div>}</div>)}

        {tab === "rankings" && (
          <div className="two">
            <div className="card"><h2>Who</h2>{ready.map((p) => <div key={p.id} className="rank" onClick={() => setRankPerson(p.id)} style={{ background: rankPerson === p.id ? "var(--card2)" : undefined }}><Avatar p={p} /><div><b>{p.profile!.name}</b><div className="status">{p.profile!.headline}</div></div></div>)}</div>
            <div className="card">{rankPerson ? <><h2>Best fits for {name(rankPerson)}</h2>
              {rankFor(rankPerson, ids, dates, shortlists).slice(0, 10).map((r, i) => (
                <div key={r.id} className="rank" onClick={() => r.dateId && (setSelDate(r.dateId), setTab("dates"))}>
                  <div className="no">{i + 1}</div>
                  <div><b>{name(r.id)}</b> {!r.dated && <span className="pill s">not dated</span>}<div className="status">{r.reason}</div>{r.dated && <div className="status">You {r.mine} - them {r.theirs}. Tap to read the date.</div>}</div>
                  <div className="score">{r.score}</div>
                </div>))}</> : <div className="status">Pick a person to see their ranked matches.</div>}</div>
          </div>)}
      </>}
    </div>
  );
}

function Avatar({ p }: { p: Person }) {
  return p.avatar ? <img className="av" src={`https://wsrv.nl/?url=${encodeURIComponent(p.avatar)}&w=88&h=88&fit=cover`} alt="" /> : <div className="av">{(p.profile?.name ?? p.id)[0]}</div>;
}

function ProfilePage({ p, back }: { p: Person; back: () => void }) {
  const pr = p.profile!;
  const L = ({ t, xs, s }: { t: string; xs: string[]; s?: boolean }) => <><div className="lbl">{t}</div>{xs.map((x) => <span key={x} className={"pill" + (s ? " s" : "")}>{x}</span>)}</>;
  return (
    <div className="card">
      <button className="ghost" onClick={back}>Back</button>
      <div className="row" style={{ margin: "14px 0" }}><Avatar p={p} /><div><h2 style={{ margin: 0 }}>{pr.name}</h2><div className="status">{pr.headline} - {pr.location} - confidence: {pr.confidence}</div></div></div>
      <p>{pr.summary}</p><p><i>Looking for: {pr.looking_for}</i></p>
      <div className="two"><div><L t="Needs" xs={pr.needs} /><L t="Hobbies" xs={pr.hobbies} /><L t="Interests" xs={pr.interests} /></div>
        <div><L t="Values" xs={pr.values} /><L t="Personality" xs={pr.personality} /><L t="Dealbreakers" xs={pr.dealbreakers} s /></div></div>
      <div className="lbl">Communication style</div><div>{pr.communication_style}</div>
      <div className="lbl">Lifestyle</div><div>{pr.lifestyle}</div>
      <div className="lbl">Evidence the agent found</div><ul>{pr.evidence.map((e, i) => <li key={i} className="status">{e}</li>)}</ul>
      <div className="status">Sources: <a href={p.linkedin} target="_blank">LinkedIn</a> ({p.scraped?.linkedin.source}) - <a href={p.instagram} target="_blank">Instagram</a> ({p.scraped?.instagram.source})</div>
    </div>
  );
}

function DatePage({ d, name, back }: { d: DateResult; name: (id: string) => string; back: () => void }) {
  const V = ({ who, v }: { who: string; v: DateResult["verdictA"] }) => (
    <div className="card"><div className="row"><b>{who}'s agent</b><span className="score">{v.score}</span><span className="status">{v.would_see_again ? "would see again" : "would not see again"}</span></div>
      <div>{v.reason}</div><div className="lbl">Needs met</div>{v.needs_met.map((x) => <span key={x} className="pill">{x}</span>)}<div className="lbl">Friction</div>{v.friction.map((x) => <span key={x} className="pill s">{x}</span>)}</div>);
  return (
    <div><button className="ghost" onClick={back}>Back</button>
      <h2 style={{ marginTop: 14 }}>{name(d.a)} x {name(d.b)}</h2>
      <div className="chat">{d.turns.map((t, i) => <div key={i} className={"msg " + t.speaker}><small>{name(t.speaker === "a" ? d.a : d.b)}</small>{t.text}</div>)}</div>
      <div className="two"><V who={name(d.a)} v={d.verdictA} /><V who={name(d.b)} v={d.verdictB} /></div></div>
  );
}
