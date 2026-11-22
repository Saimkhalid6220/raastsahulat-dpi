"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import Image from "next/image";
import { demoDistricts, demoNames, demoScams, syntheticNames } from "@/lib/fixtures";
import { prepareDocumentUpload, scanFixtures, type DocumentUpload, type ScanFixture } from "@/lib/syntheticScan";
import type { ConsentScope } from "@/types";
import { ResourceLoading, Spinner } from "./loading";
import { errorText, formatDate, Icon, listen, money, Notice, Panel, request, RequestError, Status, useResource, Workspace, type CaseItem, type NavItem } from "./shared";

type Lang = "en" | "ur";
type ClaimFixture = { storageId: string; name: string };
const scopeLabels: Record<ConsentScope, [string, string]> = {
  NADRA_IDENTITY: ["Identity verification", "شناخت کی تصدیق"],
  BISP_POVERTY_SCORE: ["Eligibility registry", "اہلیت کا ریکارڈ"],
  RAAST_DISBURSEMENT: ["Demo payment", "ڈیمو ادائیگی"],
  HELPER_DELEGATION: ["Community helper", "کمیونٹی مددگار"],
};
const alternateNames = ["Amina Bibi", "Amina Beevi", "Amina B.", "آمنہ بی بی"];
type ConsentData = { citizenId: string; records: { _id: string; scopes: ConsentScope[]; granteeName: string; status: "ACTIVE" | "REVOKED"; grantedAt: string; revokedAt?: string }[] };

function CaseList({ cases, lang, onResume }: { cases: CaseItem[]; lang: Lang; onResume?: (record: CaseItem) => void }) {
  const [audio, setAudio] = useState("");
  if (!cases.length) return <p className="muted">{lang === "en" ? "Your submitted applications will appear here." : "آپ کی جمع شدہ درخواستیں یہاں نظر آئیں گی۔"}</p>;
  return <div className="list">{cases.map((record) => {
    const explanation = record.status === "NEEDS_MORE_PROOF" ? lang === "ur" ? "افسر نے مزید ثبوت مانگا ہے۔ اسی درخواست میں نیا نمونہ شامل کریں۔" : "An officer needs more proof. Add a new sample to this application." : record.decision?.[lang];
    return <div className="list-item" key={record.id}>
    <div><strong>{record.caseNumber}</strong><small>{money(record.amount)} · {formatDate(record.createdAt)}</small>
      {explanation && <p>{explanation}</p>}
      {record.transactionId && <small>{record.transactionId}</small>}
      {record.paymentError && <small>{lang === "en" ? "The demo payment needs attention." : "ڈیمو ادائیگی کو توجہ درکار ہے۔"}</small>}
    </div>
    <div className="row"><Status value={record.status} />{explanation && <button className="button" onClick={() => { if (!listen(explanation, lang)) setAudio("Speech playback is unavailable on this device."); }}><Icon name="audio" size={17} />{lang === "en" ? "Listen" : "سنیں"}</button>}
      {onResume && ["DRAFT", "NEEDS_MORE_PROOF"].includes(record.status) && <button className="button" onClick={() => onResume(record)}>{record.status === "DRAFT" ? lang === "ur" ? "مسودہ کھولیں" : "Resume draft" : lang === "ur" ? "ثبوت شامل کریں" : "Add proof"}</button>}
    </div>
  </div>; })}{audio && <Notice>{audio}</Notice>}</div>;
}

function UploadField({ value, onChange, lang, onBusy, onInvalid }: { value?: DocumentUpload; onChange: (image?: DocumentUpload) => void; lang: Lang; onBusy: (busy: boolean) => void; onInvalid?: (invalid: boolean) => void }) {
  const [error, setError] = useState("");
  const ur = lang === "ur";
  return <div className="stack">
    <label>{ur ? "فرضی دستاویز کی تصویر" : "Upload a synthetic document"}<input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      setError(""); onBusy(true); onChange(undefined); onInvalid?.(false);
      void prepareDocumentUpload(file).then(onChange).catch((failure: Error) => {
        setError(failure.message); onInvalid?.(true);
      }).finally(() => onBusy(false));
    }} /></label>
    {value && <div className="row"><Image src={`data:${value.type};base64,${value.image}`} unoptimized alt="Synthetic document preview" width={180} height={86} style={{ objectFit: "contain" }} />
      <a className="button" href={`data:${value.type};base64,${value.image}`} download={`raast-synthetic-card.${value.type.split("/")[1]}`}>{ur ? "تصویر محفوظ کریں" : "Download image"}</a>
      <button type="button" className="button" onClick={() => onChange(undefined)}>{ur ? "تصویر ہٹائیں" : "Remove image"}</button></div>}
    {error && <Notice tone="danger">{error}</Notice>}
  </div>;
}

type PendingClaim = { key: string; draft: boolean; amount: number; image?: string };
type ClaimProgress = { step: number; name: string; amount: string; variant: ScanFixture; upload?: DocumentUpload; pending?: PendingClaim; invalidUpload?: boolean };

function subscribeOnline(change: () => void) {
  window.addEventListener("online", change);
  window.addEventListener("offline", change);
  return () => {
    window.removeEventListener("online", change);
    window.removeEventListener("offline", change);
  };
}

function loadProgress(key: string, initial: ClaimProgress): ClaimProgress {
  try {
    const saved = localStorage.getItem(key);
    return saved ? { ...initial, ...JSON.parse(saved) } : initial;
  } catch {
    return initial;
  }
}

function ClaimForm({ lang, onSave, sample, resume }: { lang: Lang; onSave: () => void; sample: ClaimFixture; resume?: CaseItem }) {
  const proofOnly = resume?.status === "NEEDS_MORE_PROOF";
  const storageKey = `raast-citizen-draft:${sample.storageId}:${resume?.id ?? "new"}`;
  const initial: ClaimProgress = { step: proofOnly ? 2 : 1, name: sample.name, amount: String(resume?.amount ?? 10000), variant: "CLEAR" };
  const [progress, setProgress] = useState(() => loadProgress(storageKey, initial));
  const [saved, setSaved] = useState<CaseItem>();
  const [error, setError] = useState("");
  const [voice, setVoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const ur = lang === "ur";
  const sampleNames = sample.name === demoNames[0] ? alternateNames : [sample.name];
  const { step, name, amount, variant, upload, pending, invalidUpload } = progress;
  const locked = busy || Boolean(pending);
  const validAmount = Number.isInteger(Number(amount)) && Number(amount) >= 1 && Number(amount) <= 100000;

  function saveProgress(next: ClaimProgress) {
    setProgress(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }

  function speak(text: string) {
    if (!listen(text, lang)) setVoice(ur ? "آواز دستیاب نہیں ہے۔" : "Speech playback is unavailable.");
  }

  function speakInput(field: "name" | "amount") {
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
      const transcript = results[0]?.[0]?.transcript.trim() ?? "";
      if (field === "amount") {
        const aliases: Record<string, string> = { "five thousand": "5000", "ten thousand": "10000", "fifteen thousand": "15000", "پانچ ہزار": "5000", "دس ہزار": "10000", "پندرہ ہزار": "15000" };
        const digits = transcript.replace(/[۰-۹٠-٩]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩".indexOf(digit) % 10)).replace(/[,،\s]/g, "");
        const value = aliases[transcript.toLowerCase()] ?? (/^\d+$/.test(digits) ? digits : "");
        if (Number(value) >= 1 && Number(value) <= 100000) { saveProgress({ ...progress, amount: value }); setVoice(""); return; }
      } else {
        const match = sampleNames.find((item) => item.toLowerCase() === transcript.toLowerCase());
        if (match) { saveProgress({ ...progress, name: match }); setVoice(""); return; }
      }
      setVoice(field === "amount" ? ur ? "مثلاً دس ہزار کہیں۔" : "Try saying ten thousand." : ur ? "دیا گیا فرضی نام کہیں۔" : "Say one of the displayed synthetic names.");
    };
    recognition.onerror = () => setVoice(ur ? "مائیک سے آواز نہیں مل سکی۔" : "The microphone could not capture speech.");
    try { recognition.start(); } catch { recognition.onerror(); }
  }

  async function makeSample() {
    return request<{ image: string }>("/api/documents/sample", "POST", { name, variant });
  }

  async function send(draft = false) {
    setBusy(true);
    setError("");
    let payload = pending;
    try {
      if (!payload) {
        const image = draft ? undefined : upload?.image ?? (await makeSample()).image;
        payload = { key: crypto.randomUUID(), draft, amount: Number(amount), image };
        saveProgress({ ...progress, pending: payload });
      }
      const body = { requestedAmountPKR: payload.amount, idempotencyKey: payload.key, documentImage: payload.image };
      const { record } = await request<{ record: CaseItem }>(resume ? `/api/cases/${resume.id}` : "/api/cases", "POST", resume ? body : { ...body, draft: payload.draft });
      setSaved(record);
      try { localStorage.removeItem(storageKey); } catch { /* The server has a copy. */ }
      setProgress(initial);
      onSave();
    } catch (failure) {
      if (payload && failure instanceof RequestError && failure.status < 500 && failure.code !== "CONSENT_REVOKED") {
        saveProgress({ ...progress, pending: undefined });
      }
      setError(errorText(failure));
    } finally {
      setBusy(false);
    }
  }

  const title = step === 1 ? ur ? "امداد کی رقم اور نام" : "Relief amount and name" : ur ? "فرضی دستاویز کا نمونہ" : "Synthetic document sample";
  const instructions = step === 1
    ? ur ? "فرضی نام منتخب کریں اور امداد کی رقم درج کریں۔ اگلے مرحلے کے لیے آگے دبائیں۔" : "Choose the synthetic name and enter or say the relief amount. Choose Continue when ready."
    : ur ? "فرضی تصویر شامل کریں یا نمونہ منتخب کریں۔ جانچ کے لیے درخواست جمع کریں۔" : "Upload a synthetic card or choose a sample. Submit to have the image checked.";
  if (saved) return <Panel title={ur ? "درخواست محفوظ ہے" : "Application received"}>
    <div className="stack"><CaseList cases={[saved]} lang={lang} />{!resume && <button className="button" onClick={() => setSaved(undefined)}>{ur ? "نئی درخواست" : "Start another application"}</button>}</div>
  </Panel>;

  return <Panel title={title} action={<button type="button" className="button" onClick={() => speak(instructions)}><Icon name="audio" size={17} />{ur ? "سوال سنیں" : "Listen to question"}</button>}>
    <form className="form-stack" onSubmit={(event) => {
      event.preventDefault();
      if (invalidUpload && step === 2) return;
      if (pending) void send();
      else if (step === 1) saveProgress({ ...progress, step: 2 });
      else void send();
    }}>
      <fieldset className="form-stack" disabled={locked || preparing}>
        {step === 1 ? <>
          <label>{ur ? "فرضی نام" : "Synthetic name"}<select value={name} onChange={(event) => saveProgress({ ...progress, name: event.target.value, upload: undefined })}>{sampleNames.map((item) => <option key={item}>{item}</option>)}</select></label>
          <button type="button" className="button" onClick={() => speakInput("name")}><Icon name="voice" size={18} />{ur ? "نام بولیں" : "Say the name"}</button>
          <label>{ur ? "درخواست کی رقم (روپے)" : "Requested amount (PKR)"}<input required type="number" min={1} max={100000} value={amount} onChange={(event) => saveProgress({ ...progress, amount: event.target.value })} /></label>
          <div className="row">{["5000", "10000", "15000"].map((value) => <button key={value} type="button" className="button" aria-pressed={amount === value} onClick={() => saveProgress({ ...progress, amount: value })}>{money(Number(value))}</button>)}
            <button type="button" className="button" onClick={() => speakInput("amount")}><Icon name="voice" size={18} />{ur ? "رقم بولیں" : "Say the amount"}</button></div>
        </> : <>
          <label>{ur ? "دستاویز کا نمونہ" : "Sample scan condition"}<select value={variant} onChange={(event) => saveProgress({ ...progress, variant: event.target.value as ScanFixture, upload: undefined, invalidUpload: false })}>
            {scanFixtures.map((item) => <option key={item} value={item}>{item === "CLEAR" ? ur ? "واضح" : "Clear sample" : item === "BLURRY" ? ur ? "دھندلی" : "Blurry sample" : ur ? "رد و بدل شدہ" : "Tampered sample"}</option>)}
          </select></label>
          <button type="button" className="button" disabled={!online} onClick={() => {
            setBusy(true); setError("");
            void makeSample().then(({ image }) => saveProgress({ ...progress, upload: { image, type: "image/png" }, invalidUpload: false }))
              .catch((failure) => setError(errorText(failure))).finally(() => setBusy(false));
          }}>{ur ? "نمونہ دکھائیں" : "Preview sample"}</button>
          <UploadField key={variant} value={upload} onChange={(image) => saveProgress({ ...progress, upload: image, invalidUpload: false })}
            lang={lang} onBusy={setPreparing} onInvalid={(invalid) => { if (invalid) saveProgress({ ...progress, upload: undefined, invalidUpload: true }); }} />
          {invalidUpload && <p className="muted">{ur ? "دوسری تصویر منتخب کریں یا نمونہ دکھائیں۔" : "Choose another file or preview the demo sample to continue."}</p>}
          <p className="muted">{ur ? "صرف فرضی دستاویز دیں۔ منتخب نمونہ یا اپ لوڈ کی گئی تصویر جانچی جائے گی۔" : "Use synthetic cards only. The server reads the uploaded image or scans the selected sample."}</p>
        </>}
      </fieldset>
      {voice && <Notice>{voice}</Notice>}
      {!online && <Notice>{ur ? "آپ آف لائن ہیں۔ دوبارہ رابطہ ہونے پر درخواست بھیجیں۔" : "You’re offline. Send the application when you reconnect."}</Notice>}
      {storageError && <Notice>{ur ? "یہ براؤزر مسودہ محفوظ نہیں کر سکا۔" : "This browser couldn’t save your progress on this device."}</Notice>}
      {pending && !busy && <Notice>{ur ? "بھیجنے کی تصدیق نہیں ہوئی۔ دوبارہ کوشش کریں۔" : "Submission hasn’t been confirmed. Retry using the same application."}</Notice>}
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="row">
        {step === 2 && !proofOnly && !pending && <button type="button" className="button" disabled={busy} onClick={() => saveProgress({ ...progress, step: 1 })}>{ur ? "واپس" : "Back"}</button>}
        <button className="button primary" disabled={busy || preparing || !validAmount || (step === 2 && invalidUpload) || (!online && (Boolean(pending) || step === 2))}>{busy && <Spinner />}{busy ? ur ? "محفوظ ہو رہی ہے…" : "Saving…" : pending ? ur ? "دوبارہ کوشش کریں" : "Retry submission" : step === 1 ? ur ? "آگے" : "Continue" : ur ? "درخواست جمع کریں" : "Submit application"}</button>
        {!resume && !pending && <button type="button" className="button" disabled={busy || !online || !validAmount} onClick={() => void send(true)}>{ur ? "مسودہ محفوظ کریں" : "Save draft"}</button>}
      </div>
    </form>
  </Panel>;
}

function ScamCheck({ lang }: { lang: Lang }) {
  const reviews = useResource<{ reports: { _id: string; channel: string; reviewStatus: string; reviewVerdict?: string; createdAt: string }[] }>("/api/scam-check");
  const [sender, setSender] = useState("");
  const [rawContent, setRawContent] = useState("");
  const [channel, setChannel] = useState("SMS");
  const [upload, setUpload] = useState<DocumentUpload>();
  const [preparing, setPreparing] = useState(false);
  const [result, setResult] = useState<{ verdict: string; simpleAdviceEn: string; simpleAdviceUr: string; redFlags: string[]; needsReview: boolean }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const ur = lang === "ur";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      setResult(await request("/api/scam-check", "POST", channel === "DOCUMENT_IMAGE" ? { channel, documentImage: upload?.image } : { channel, rawContent, senderHeader: sender }));
      reviews.refresh();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }
  return <Panel title={ur ? "مشکوک پیغام چیک کریں" : "Check a suspicious message"} action={<button className="button" onClick={() => { setSender(demoScams[0][0]); setRawContent(demoScams[0][1]); setChannel("SMS"); }}>{ur ? "ڈیمو پیغام" : "Load demo SMS"}</button>}>
    <form className="form-stack" onSubmit={submit}>
      <label>{ur ? "ذریعہ" : "Channel"}<select value={channel} onChange={(event) => setChannel(event.target.value)}><option>SMS</option><option value="WHATSAPP">WhatsApp</option><option value="DOCUMENT_IMAGE">{ur ? "دستاویز کا نمونہ" : "Document sample"}</option></select></label>
      {channel === "DOCUMENT_IMAGE" ? <UploadField value={upload} onChange={setUpload} lang={lang} onBusy={setPreparing} /> : <>
        <label>{ur ? "بھیجنے والا" : "Sender label"}<input maxLength={40} value={sender} onChange={(event) => setSender(event.target.value)} placeholder="8171-HELP" /></label>
        <label>{ur ? "فرضی پیغام" : "Synthetic message"}<textarea value={rawContent} maxLength={1000} required onChange={(event) => setRawContent(event.target.value)} /></label>
      </>}
      <div><button className="button primary" disabled={busy || preparing || (channel === "DOCUMENT_IMAGE" && !upload)}>{busy && <Spinner />}{busy ? ur ? "جانچ جاری ہے…" : "Checking…" : channel === "DOCUMENT_IMAGE" ? ur ? "دستاویز چیک کریں" : "Check document" : ur ? "پیغام چیک کریں" : "Check message"}</button></div>
      {error && <Notice tone="danger">{error}</Notice>}
      {result && <div className="stack" aria-live="polite">
        <Status value={result.verdict} />
        <p>{ur ? result.simpleAdviceUr : result.simpleAdviceEn}</p>
        {result.needsReview && <Notice>{ur ? "یہ رپورٹ افسر کی جانچ کے لیے بھیج دی گئی ہے۔" : "This report was sent to an officer for review."}</Notice>}
        <div><button type="button" className="button" onClick={() => { if (!listen(ur ? result.simpleAdviceUr : result.simpleAdviceEn, lang)) setError("Speech playback is unavailable."); }}><Icon name="audio" size={17} />{ur ? "سنیں" : "Listen"}</button></div>
      </div>}
    </form>
    <div className="stack">
      <div className="split-row"><strong>{ur ? "افسر کی جانچ" : "Officer reviews"}</strong><button type="button" className="button" disabled={reviews.loading} onClick={reviews.refresh}>{ur ? "تازہ کریں" : "Refresh reviews"}</button></div>
      <ResourceLoading resource={reviews} label={ur ? "رپورٹس لوڈ ہو رہی ہیں…" : "Loading reviews…"} />
      {reviews.error && <Notice tone="danger">{reviews.error}</Notice>}
      {reviews.data?.reports.length === 0 && <p className="muted">{ur ? "کوئی رپورٹ زیر جانچ نہیں ہے۔" : "Your reports sent for officer review will appear here."}</p>}
      {reviews.data?.reports.map((report) => <div key={report._id} className="list-item">
        <span>{report.channel === "DOCUMENT_IMAGE" ? ur ? "دستاویز" : "Document" : report.channel} · {formatDate(report.createdAt)}</span>
        {report.reviewStatus === "PENDING" ? <span>{ur ? "افسر کی جانچ کا انتظار" : "Waiting for an officer"}</span> : <Status value={report.reviewVerdict ?? "UNSURE"} />}
      </div>)}
    </div>
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
  const instructions = ur ? "ہر سروس کی اجازت یہاں دیکھیں۔ اجازت دینے کے لیے رسائی دیں اور اجازت ختم کرنے کے لیے رسائی واپس لیں دبائیں۔" : "Review each service’s permission. Choose Grant access to share, or Withdraw access now to stop sharing.";
  return <Panel title={ur ? "میرا ڈیٹا اور اجازت" : "My data and consent"} action={<button className="button" onClick={() => { if (!listen(instructions, lang)) setFailure(ur ? "آواز دستیاب نہیں ہے۔" : "Speech playback is unavailable."); }}><Icon name="audio" size={17} />{ur ? "اجازت کی ہدایات سنیں" : "Listen to consent instructions"}</button>}>
    <div className="stack">
      <p className="muted">{ur ? "آپ کسی بھی وقت رسائی واپس لے سکتے ہیں۔" : "Control which demo services and helpers can access your synthetic records."}</p>
      <ResourceLoading resource={consent} label={ur ? "اجازتیں لوڈ ہو رہی ہیں…" : "Loading permissions…"}
        refreshLabel={ur ? "اجازتیں تازہ ہو رہی ہیں…" : "Updating permissions…"} />
      {(failure || error) && <Notice tone="danger">{failure || error}</Notice>}{notice && <Notice tone="success">{notice}</Notice>}
      {data && <div className="list">{(Object.keys(scopeLabels) as ConsentScope[]).filter((scope) => hasHelper || scope !== "HELPER_DELEGATION").map((scope) => {
        const records = data.records.filter((record) => record.scopes.includes(scope));
        const active = records.some((record) => record.status === "ACTIVE");
        return <div className="list-item" key={scope}>
          <div><strong>{scopeLabels[scope][ur ? 1 : 0]}</strong><small><Status value={active ? "ACTIVE" : records.length ? "REVOKED" : "NOT_GRANTED"} /></small>
            {records.length > 0 && <details><summary>{ur ? "اجازت کی تاریخ" : "Permission history"}</summary><ul>{records.map((record) => <li key={record._id}>{record.granteeName} · {formatDate(record.grantedAt)}{record.revokedAt ? ` → ${formatDate(record.revokedAt)}` : ""}</li>)}</ul></details>}
          </div>
          <button className={active ? "button danger" : "button"} disabled={Boolean(busy)} onClick={() => void change(scope, active)}>
            {busy === scope && <Spinner />}{busy === scope ? ur ? "محفوظ ہو رہی ہے…" : "Saving…" : active ? ur ? "رسائی واپس لیں" : "Withdraw access now" : ur ? "رسائی دیں" : "Grant access"}
          </button>
        </div>;
      })}</div>}
    </div>
  </Panel>;
}

type Profile = { fullNameRaw: string; district: string; householdIncomePKR?: number; isWidowOrDisabled: boolean };

function ProfileCorrection({ lang, onSave }: { lang: Lang; onSave: (profile: Profile) => void }) {
  const profile = useResource<Profile>("/api/profile");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const ur = lang === "ur";

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const income = String(fields.get("income") ?? "");
    setBusy(true); setError(""); setSaved(false);
    try {
      onSave(await request<Profile>("/api/profile", "PATCH", {
        fullNameRaw: fields.get("name"), district: fields.get("district"),
        householdIncomePKR: income ? Number(income) : null, isWidowOrDisabled: fields.has("eligible"),
      }));
      setSaved(true);
      profile.refresh();
    } catch (failure) { setError(errorText(failure)); }
    finally { setBusy(false); }
  }

  return <Panel title={ur ? "فرضی پروفائل درست کریں" : "Correct synthetic profile"}>
    <ResourceLoading resource={profile} label={ur ? "پروفائل لوڈ ہو رہا ہے…" : "Loading profile…"} />
    {(profile.error || error) && <Notice tone="danger">{profile.error || error}</Notice>}
    {saved && <Notice tone="success">{ur ? "پروفائل درست کر دیا گیا۔" : "Profile correction saved."}</Notice>}
    {profile.data && <form className="form-stack" onSubmit={update}>
      <label>{ur ? "فرضی نام" : "Synthetic name"}<select name="name" defaultValue={profile.data.fullNameRaw}>{syntheticNames.map((name) => <option key={name}>{name}</option>)}</select></label>
      <label>{ur ? "ضلع" : "District"}<select name="district" defaultValue={profile.data.district}>{demoDistricts.map((district) => <option key={district}>{district}</option>)}</select></label>
      <label>{ur ? "فرضی گھریلو آمدنی" : "Synthetic household income (PKR)"}<input type="number" name="income" min={0} max={100000} defaultValue={profile.data.householdIncomePKR} /></label>
      <label className="row"><input type="checkbox" name="eligible" defaultChecked={profile.data.isWidowOrDisabled} />{ur ? "بیوہ یا معذوری" : "Widowed or disabled"}</label>
      <button className="button primary" disabled={busy || profile.loading}>{busy && <Spinner />}{ur ? "درستگی محفوظ کریں" : "Save correction"}</button>
    </form>}
  </Panel>;
}

export default function Citizen({ fixture, hasHelper }: { fixture: ClaimFixture | null; hasHelper: boolean }) {
  const [screen, setScreen] = useState("home");
  const [lang, setLang] = useState<Lang>("en");
  const [profileName, setProfileName] = useState(fixture?.name);
  const [resume, setResume] = useState<CaseItem>();
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

  function navigate(next: string) { setResume(undefined); setScreen(next); }

  return <Workspace role="Citizen" active={screen} nav={nav} onNavigate={navigate}>
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
      {screen === "home" && <div className="grid-3">{nav.slice(1, 4).map((item, index) => <button className="service-card" key={item.id} onClick={() => navigate(item.id)}><span className={`tile-icon ${["", "amber", "blue"][index]}`}><Icon name={item.icon} size={29} /></span><h2>{item.label}</h2><p className="muted">{descriptions[index]}</p></button>)}</div>}
      {(screen === "home" || screen === "cases") && <Panel title={ur ? "میری درخواستیں" : "My applications"}>
        <ResourceLoading resource={cases} label={ur ? "درخواستیں لوڈ ہو رہی ہیں…" : "Loading applications…"}
          refreshLabel={ur ? "درخواستیں تازہ ہو رہی ہیں…" : "Updating applications…"} />
        {cases.error && <Notice tone="danger">{cases.error}</Notice>}
        {cases.data && <CaseList lang={lang} cases={screen === "home" ? cases.data.cases.slice(0, 3) : cases.data.cases} onResume={(record) => { setResume(record); setScreen("apply"); }} />}
      </Panel>}
      {screen === "apply" && (fixture && profileName
        ? <ClaimForm key={resume?.id ?? "new"} lang={lang} sample={{ ...fixture, name: profileName }} resume={resume} onSave={cases.refresh} />
        : <Notice tone="danger">{ur ? "فرضی پروفائل دستیاب نہیں ہے۔" : "Your synthetic profile is unavailable."}</Notice>)}
      {screen === "scam" && <ScamCheck lang={lang} />}
      {screen === "consent" && <><ConsentCenter lang={lang} hasHelper={hasHelper} /><ProfileCorrection lang={lang} onSave={(profile) => setProfileName(profile.fullNameRaw)} /></>}
    </div>
  </Workspace>;
}
