"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { demoNames, demoScams } from "@/lib/fixtures";
import { compressImage, scanFixtures, syntheticDocument, type ScanFixture } from "@/lib/syntheticScan";
import type { ConsentScope } from "@/types";
import { ResourceLoading, Spinner } from "./loading";
import { errorText, formatDate, Icon, listen, money, Notice, Panel, request, Status, useResource, Workspace, type CaseItem, type NavItem } from "./shared";

type Lang = "en" | "ur";
type ClaimFixture = { cnic: string; name: string };
const scopeLabels: Record<ConsentScope, [string, string]> = {
  NADRA_IDENTITY: ["Identity verification", "شناخت کی تصدیق"],
  BISP_POVERTY_SCORE: ["Eligibility registry", "اہلیت کا ریکارڈ"],
  RAAST_DISBURSEMENT: ["Demo payment", "ڈیمو ادائیگی"],
  HELPER_DELEGATION: ["Community helper", "کمیونٹی مددگار"],
};
const alternateNames = ["Amina Bibi", "Amina Beevi", "Amina B.", "آمنہ بی بی"];
type ConsentData = { citizenId: string; records: { scopes: ConsentScope[]; status: "ACTIVE" | "REVOKED"; grantedAt: string; revokedAt?: string }[] };

function CaseList({ cases, lang }: { cases: CaseItem[]; lang: Lang }) {
  const [audio, setAudio] = useState("");
  if (!cases.length) return <p className="muted">{lang === "en" ? "Your submitted applications will appear here." : "آپ کی جمع شدہ درخواستیں یہاں نظر آئیں گی۔"}</p>;
  return <div className="list">{cases.map((record) => <div className="list-item" key={record.id}>
    <div><strong>{record.caseNumber}</strong><small>{money(record.amount)} · {formatDate(record.createdAt)}</small>
      {record.decision && <p>{record.decision[lang]}</p>}
      {record.transactionId && <small>{record.transactionId}</small>}
      {record.paymentError && <small>{lang === "en" ? "The demo payment needs attention." : "ڈیمو ادائیگی کو توجہ درکار ہے۔"}</small>}
    </div>
    <div className="row"><Status value={record.status} />{record.decision && <button className="button" onClick={() => { if (!listen(record.decision![lang], lang)) setAudio("Speech playback is unavailable on this device."); }}><Icon name="audio" size={17} />{lang === "en" ? "Listen" : "سنیں"}</button>}</div>
  </div>)}{audio && <Notice>{audio}</Notice>}</div>;
}

function ClaimForm({ lang, onSave, sample }: { lang: Lang; onSave: () => void; sample: ClaimFixture }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(sample.name);
  const [amount, setAmount] = useState("10000");
  const [fixture, setFixture] = useState<ScanFixture>("CLEAR");
  const [preview, setPreview] = useState<{ url: string; bytes: number }>();
  const [saved, setSaved] = useState<CaseItem>();
  const [error, setError] = useState("");
  const [voice, setVoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const ur = lang === "ur";
  const sampleNames = sample.name === demoNames[0] ? alternateNames : [sample.name];
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  function voiceName() {
    type Recognition = {
      lang: string; onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onerror: (() => void) | null; start: () => void;
    };
    const browser = window as typeof window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
    const Constructor = browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
    if (!Constructor) { setVoice(ur ? "اس براؤزر میں مائیک دستیاب نہیں ہے۔" : "Speech input is unavailable on this device."); return; }
    const recognition = new Constructor();
    recognition.lang = ur ? "ur-PK" : "en-PK";
    recognition.onresult = ({ results }) => {
      const transcript = results[0]?.[0]?.transcript.trim();
      const match = sampleNames.find((item) => item.toLowerCase() === transcript?.toLowerCase());
      if (match) { setName(match); setVoice(""); }
      else setVoice(ur ? "دیا گیا فرضی نام کہیں۔" : "Say one of the displayed synthetic names.");
    };
    recognition.onerror = () => setVoice(ur ? "مائیک سے آواز نہیں مل سکی۔" : "The microphone could not capture speech.");
    try { recognition.start(); } catch { setVoice("The microphone is unavailable."); }
  }

  async function send(draft = false) {
    setBusy(true);
    setError("");
    const key = idempotencyKey || window.crypto.randomUUID();
    setIdempotencyKey(key);
    try {
      const { record } = await request<{ record: CaseItem }>("/api/cases", "POST", {
        requestedAmountPKR: Number(amount), draft,
        idempotencyKey: draft ? window.crypto.randomUUID() : key,
        ...(draft ? {} : { extractedDocData: syntheticDocument(sample.cnic, name, fixture) }),
      });
      setSaved(record);
      setIdempotencyKey("");
      onSave();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  const title = step === 1 ? ur ? "امداد کی رقم اور نام" : "Relief amount and name" : ur ? "فرضی دستاویز کا نمونہ" : "Synthetic document sample";
  if (saved) return <Panel title={ur ? "درخواست محفوظ ہے" : "Application received"}>
    <div className="stack">
      <CaseList cases={[saved]} lang={lang} />
      <button className="button" onClick={() => { setSaved(undefined); setStep(1); }}>{ur ? "نئی درخواست" : "Start another application"}</button>
    </div>
  </Panel>;
  return <Panel title={title} action={<button className="button" onClick={() => { if (!listen(title, lang)) setVoice("Speech playback is unavailable."); }}><Icon name="audio" size={17} />{ur ? "سوال سنیں" : "Listen to question"}</button>}>
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault();
      if (step === 1) setStep(2);
      else void send();
    }}>
      {step === 1 ? <>
        <label>{ur ? "فرضی نام" : "Synthetic name"}<select value={name} onChange={(event) => { setName(event.target.value); setIdempotencyKey(""); }}>{sampleNames.map((item) => <option key={item}>{item}</option>)}</select></label>
        <button type="button" className="button" onClick={voiceName}><Icon name="voice" size={18} />{ur ? "نام بولیں" : "Say the name"}</button>
        <label>{ur ? "درخواست کی رقم (روپے)" : "Requested amount (PKR)"}<input required type="number" min={1} max={100000} value={amount} onChange={(event) => { setAmount(event.target.value); setIdempotencyKey(""); }} /></label>
      </> : <>
        <label>{ur ? "دستاویز کی حالت" : "Sample scan condition"}<select value={fixture} onChange={(event) => { setFixture(event.target.value as ScanFixture); setIdempotencyKey(""); }}>
          {scanFixtures.map((item) => <option key={item} value={item}>{item === "CLEAR" ? ur ? "واضح" : "Clear sample" : item === "BLURRY" ? ur ? "دھندلی" : "Blurry sample" : ur ? "رد و بدل شدہ" : "Tampered sample"}</option>)}
        </select></label>
        <label>{ur ? "فرضی تصویر دیکھیں (اختیاری)" : "Preview a synthetic image (optional)"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void compressImage(file).then((blob) => { setPreview({ url: URL.createObjectURL(blob), bytes: blob.size }); setError(""); })
            .catch((failure) => setError(failure instanceof Error ? failure.message : "Could not preview the image."));
        }} /></label>
        {preview && <div className="row"><Image src={preview.url} unoptimized alt="Compressed synthetic document preview" width={120} height={84} style={{ objectFit: "contain" }} /><span className="muted">{Math.ceil(preview.bytes / 1000)} KB WebP · {ur ? "مقامی پیش منظر" : "Local preview"}</span></div>}
        <p className="muted">{ur ? "جانچ میں منتخب فرضی نمونہ استعمال ہو گا۔" : "The selected fixture supplies the mock OCR and QR readings."}</p>
      </>}
      {voice && <Notice>{voice}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="row">
        {step === 2 && <button type="button" className="button" onClick={() => setStep(1)}>{ur ? "واپس" : "Back"}</button>}
        <button className="button primary" disabled={busy}>{busy && <Spinner />}{busy ? ur ? "محفوظ ہو رہی ہے…" : "Saving…" : step === 1 ? ur ? "آگے" : "Continue" : ur ? "درخواست جمع کریں" : "Submit application"}</button>
        <button type="button" className="button" disabled={busy || Number(amount) < 1 || Number(amount) > 100000} onClick={() => void send(true)}>{ur ? "مسودہ محفوظ کریں" : "Save draft"}</button>
      </div>
    </form>
  </Panel>;
}

function ScamCheck({ lang }: { lang: Lang }) {
  const [sender, setSender] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [channel, setChannel] = useState("SMS");
  const [documentFixture, setDocumentFixture] = useState<ScanFixture>("CLEAR");
  const [result, setResult] = useState<{ verdict: string; simpleAdviceEn: string; simpleAdviceUr: string; redFlags: string[] }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ur = lang === "ur";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setResult(await request("/api/scam-check", "POST", { channel, rawContent, senderHeader: sender, ...(channel === "DOCUMENT_IMAGE" ? { documentFixture } : {}) }));
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  return <Panel title={ur ? "مشکوک پیغام چیک کریں" : "Check a suspicious message"} action={<button className="button" onClick={() => { setSender(demoScams[0][0]); setRawContent(demoScams[0][1]); setChannel("SMS"); }}>{ur ? "ڈیمو پیغام" : "Load demo SMS"}</button>}>
    <form className="form-stack" onSubmit={submit}>
      <label>{ur ? "ذریعہ" : "Channel"}<select value={channel} onChange={(event) => setChannel(event.target.value)}><option>SMS</option><option value="WHATSAPP">WhatsApp</option><option value="DOCUMENT_IMAGE">{ur ? "دستاویز کا نمونہ" : "Document sample"}</option></select></label>
      {channel === "DOCUMENT_IMAGE" && <label>{ur ? "نمونہ" : "Fixture"}<select value={documentFixture} onChange={(event) => setDocumentFixture(event.target.value as ScanFixture)}>{scanFixtures.map((item) => <option key={item}>{item}</option>)}</select></label>}
      <label>{ur ? "بھیجنے والا" : "Sender label"}<input maxLength={40} value={sender} onChange={(event) => setSender(event.target.value)} placeholder="8171-HELP" /></label>
      <label>{ur ? "فرضی پیغام" : "Synthetic message"}<textarea value={rawContent} maxLength={1000} required onChange={(event) => setRawContent(event.target.value)} /></label>
      <div><button className="button primary" disabled={busy}>{busy && <Spinner />}{busy ? ur ? "جانچ جاری ہے…" : "Checking message…" : ur ? "پیغام چیک کریں" : "Check message"}</button></div>
      {error && <Notice tone="danger">{error}</Notice>}
      {result && <div className="stack" aria-live="polite">
        <Status value={result.verdict} />
        <p>{ur ? result.simpleAdviceUr : result.simpleAdviceEn}</p>
        <div><button type="button" className="button" onClick={() => { if (!listen(ur ? result.simpleAdviceUr : result.simpleAdviceEn, lang)) setError("Speech playback is unavailable."); }}><Icon name="audio" size={17} />{ur ? "سنیں" : "Listen"}</button></div>
      </div>}
    </form>
  </Panel>;
}

function ConsentCenter({ lang, hasHelper }: { lang: Lang; hasHelper: boolean }) {
  const consent = useResource<ConsentData>("/api/consent");
  const { data, error, refresh } = consent;
  const [failure, setFailure] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<ConsentScope>();
  const ur = lang === "ur";

  async function change(scope: ConsentScope, active: boolean) {
    setBusy(scope);
    setFailure("");
    try {
      await request("/api/consent", active ? "DELETE" : "POST", { scope });
      setNotice(active ? ur ? "رسائی واپس لے لی گئی۔" : "Access withdrawn." : ur ? "رسائی دے دی گئی۔" : "Access granted.");
      refresh();
    } catch (error) { setFailure(errorText(error)); }
    finally { setBusy(undefined); }
  }
  return <Panel title={ur ? "میرا ڈیٹا اور اجازت" : "My data and consent"}>
    <div className="stack">
      <p className="muted">{ur ? "آپ کسی بھی وقت رسائی واپس لے سکتے ہیں۔" : "Control which demo services and helpers can access your synthetic records."}</p>
      <ResourceLoading resource={consent} label={ur ? "اجازتیں لوڈ ہو رہی ہیں…" : "Loading permissions…"}
        refreshLabel={ur ? "اجازتیں تازہ ہو رہی ہیں…" : "Updating permissions…"} />
      {(failure || error) && <Notice tone="danger">{failure || error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
      {data && <div className="list">{(Object.keys(scopeLabels) as ConsentScope[]).filter((scope) => hasHelper || scope !== "HELPER_DELEGATION").map((scope) => {
        const records = data.records.filter((record) => record.scopes.includes(scope));
        const active = records.some((record) => record.status === "ACTIVE");
        return <div className="list-item" key={scope}>
          <div><strong>{scopeLabels[scope][ur ? 1 : 0]}</strong><small><Status value={active ? "ACTIVE" : records.length ? "REVOKED" : "NOT_GRANTED"} /></small></div>
          <button className={active ? "button danger" : "button"} disabled={Boolean(busy)} onClick={() => void change(scope, active)}>
            {busy === scope && <Spinner />}{busy === scope ? ur ? "محفوظ ہو رہی ہے…" : "Saving…" : active ? ur ? "رسائی واپس لیں" : "Withdraw access now" : ur ? "رسائی دیں" : "Grant access"}
          </button>
        </div>;
      })}</div>}
    </div>
  </Panel>;
}

export default function Citizen({ fixture, hasHelper }: { fixture: ClaimFixture | null; hasHelper: boolean }) {
  const [screen, setScreen] = useState("home");
  const [lang, setLang] = useState<Lang>("en");
  const ur = lang === "ur";
  const cases = useResource<{ cases: CaseItem[] }>("/api/cases");
  const nav: NavItem[] = [
    { id: "home", icon: "home", label: ur ? "مرکزی صفحہ" : "Overview" },
    { id: "apply", icon: "claim", label: ur ? "امداد کی درخواست" : "Apply for relief" },
    { id: "scam", icon: "message", label: ur ? "جعلی پیغام" : "Scam Shield" },
    { id: "consent", icon: "consent", label: ur ? "ڈیٹا اور اجازت" : "Data & consent" },
    { id: "cases", icon: "queue", label: ur ? "میری درخواستیں" : "My cases" },
  ];
  const descriptions = ur ? ["فرضی امداد کی درخواست دیں۔", "مشکوک پیغام کی جانچ کریں۔", "اپنے ڈیٹا کی رسائی کنٹرول کریں۔"] :
    ["Start or save an emergency relief application.", "Check a suspicious SMS or WhatsApp message.", "See who has access and withdraw it at any time."];

  return <Workspace role="Citizen" active={screen} nav={nav} onNavigate={setScreen}>
    <div className="stack" lang={lang} dir={ur ? "rtl" : "ltr"}>
      <section className={screen === "home" ? "hero" : "page-heading"}>
        <div className="hero-head">
          <div>
            {screen === "home" && <p className="eyebrow">{ur ? "شہری خدمات" : "Citizen services"}</p>}
            <h1>{screen === "home" ? ur ? "آپ کا امدادی پورٹل" : "Your relief portal" : nav.find(({ id }) => id === screen)?.label}</h1>
            {screen === "home" && <p>{ur ? "امداد کی درخواست دیں، پیغام چیک کریں یا اپنے ڈیٹا کی رسائی دیکھیں۔" : "Apply for relief, check a suspicious message, or manage access to your information."}</p>}
          </div>
          <button className="button" onClick={() => setLang(ur ? "en" : "ur")} aria-label={ur ? "Switch to English" : "Switch to Urdu"}><Icon name="globe" size={18} />{ur ? "English" : "اردو"}</button>
        </div>
      </section>
      {screen === "home" && <div className="grid-3">{nav.slice(1, 4).map((item, index) => <button className="service-card" key={item.id} onClick={() => setScreen(item.id)}><span className={`tile-icon ${["", "amber", "blue"][index]}`}><Icon name={item.icon} size={29} /></span><h2>{item.label}</h2><p className="muted">{descriptions[index]}</p></button>)}</div>}
      {(screen === "home" || screen === "cases") && <Panel title={ur ? "میری درخواستیں" : "My applications"}>
        <ResourceLoading resource={cases} label={ur ? "درخواستیں لوڈ ہو رہی ہیں…" : "Loading applications…"}
          refreshLabel={ur ? "درخواستیں تازہ ہو رہی ہیں…" : "Updating applications…"} />
        {cases.error && <Notice tone="danger">{cases.error}</Notice>}
        {cases.data && <CaseList lang={lang} cases={screen === "home" ? cases.data.cases.slice(0, 3) : cases.data.cases} />}
      </Panel>}
      {screen === "apply" && (fixture
        ? <ClaimForm lang={lang} sample={fixture} onSave={cases.refresh} />
        : <Notice tone="danger">{ur ? "فرضی پروفائل دستیاب نہیں ہے۔" : "Your synthetic profile is unavailable."}</Notice>)}
      {screen === "scam" && <ScamCheck lang={lang} />}
      {screen === "consent" && <ConsentCenter lang={lang} hasHelper={hasHelper} />}
    </div>
  </Workspace>;
}
