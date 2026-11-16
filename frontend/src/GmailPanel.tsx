import { useEffect, useRef, useState } from "react";
import Dialog from "./Dialog";

type Message = { id: string; subject: string; sender: string; received_at: number; job_ids: string[]; suggested_stage: string | null };
type Status = { available: boolean; connected: boolean; email: string | null; last_sync: number | null; has_more: boolean; messages: Message[] };
type Props = {
  api: (path: string, method?: string, body?: unknown) => Promise<any>;
  jobs: { id: string; title: string; company: string }[];
  onJobs: () => void;
};
const verifierKey = "alongside.gmail.verifier";

export default function GmailPanel({ api, jobs, onJobs }: Props) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(false);
  const [disconnect, setDisconnect] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const apiRef = useRef(api);
  apiRef.current = api;
  const completion = useRef<Promise<unknown> | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const state = fragment.get("gmail_state");
        if (state) {
          const verifier = sessionStorage.getItem(verifierKey);
          if (!verifier) throw new Error("Start the Gmail connection again in this browser.");
          // StrictMode can rerun effects. Reuse the single-use completion request.
          completion.current ??= apiRef.current("/api/gmail/complete", "POST", { state, browser_verifier: verifier });
          await completion.current;
          sessionStorage.removeItem(verifierKey);
          if (active) setNotice("Gmail connected. Check the mailbox below, then sync when you’re ready.");
        } else if (fragment.has("gmail_error")) {
          throw new Error("Google authorization was cancelled, expired, or could not be completed. Please connect again.");
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Gmail connection failed");
      } finally {
        if (active) {
          if (window.location.hash.startsWith("#gmail_")) window.history.replaceState(null, "", window.location.pathname + window.location.search);
          try {
            const next = await apiRef.current("/api/gmail/status");
            if (active) setStatus(next);
          } catch (e) {
            if (active) setError(e instanceof Error ? e.message : "Could not load Gmail status");
          }
        }
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(""); setNotice("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Gmail request failed"); }
    finally { setBusy(false); }
  }

  return <section className="panel gmail-panel" aria-labelledby="gmail-heading">
    <h2 id="gmail-heading">Gmail inbox</h2>
    <p>Find recent application emails and review possible matches to your jobs. Alongside cannot send, edit or delete your emails.</p>
    {error && <p className="alert" role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!status ? <button className="secondary" disabled={busy} onClick={() => run(async () => setStatus(await api("/api/gmail/status")))}>Reload Gmail status</button> : <>
      {status.connected ? <>
        <p>Connected mailbox: <strong>{status.email}</strong></p>
        <p className="muted">{status.last_sync ? `Last sync: ${new Date(status.last_sync * 1000).toLocaleString()}` : "No emails synced yet."} Sync runs only when you request it.</p>
        <p className="muted">Checks the last 30 days in batches of up to 10 messages. Stores sender, subject, date and possible matches. Email bodies and attachments are not downloaded. Only the latest 100 stored results are shown.</p>
        <div className="button-row">
          <button disabled={busy || !status.available} onClick={() => run(async () => {
            const result = await api("/api/gmail/sync", "POST");
            setStatus(await api("/api/gmail/status")); setNotice(result.notice);
          })}>{busy ? "Working…" : status.has_more ? "Sync next batch" : "Sync recent emails"}</button>
          <button className="secondary" disabled={busy} onClick={() => setDisconnect(true)}>Disconnect Gmail</button>
        </div>
        {status.messages.length > 0 && <div className="gmail-messages"><h3>Emails to review</h3><p>Suggestions can be wrong. Read the original email and confirm the job before updating its stage in Jobs.</p>
          {status.messages.map(message => <article key={message.id} className="gmail-message">
            <h4>{message.subject || "(No subject)"}</h4>
            <p className="muted">{message.sender} · {new Date(message.received_at).toLocaleDateString()}</p>
            <p>{message.job_ids.length === 1 ? `Possible match: ${jobs.find(job => job.id === message.job_ids[0])?.title || "Saved job"}` : message.job_ids.length > 1 ? "Several possible matches. Choose the correct job yourself." : "No confident match to a saved job."}</p>
            {message.suggested_stage && <p>Possible status: {message.suggested_stage === "Applied (Manual)" ? "Application received" : message.suggested_stage}</p>}
            <div className="button-row"><a href={`https://mail.google.com/mail/u/${encodeURIComponent(status.email || "")}/#all/${encodeURIComponent(message.id)}`} target="_blank" rel="noopener noreferrer">Read in Gmail</a><button className="secondary" onClick={onJobs}>Review jobs</button></div>
          </article>)}
        </div>}
      </> : <p>No Gmail mailbox connected.</p>}
      {!status.available && <p className="muted">Gmail setup needs attention before connecting or syncing. You can still disconnect an existing mailbox.</p>}
      {status.available && <>
        <label className="check-label"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I agree to read-only Gmail access and storage of job-email headers for review. I can disconnect and remove imported headers at any time.</label>
        <button className="secondary" disabled={busy || !consent} onClick={() => run(async () => {
          const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), value => value.toString(16).padStart(2, "0")).join("");
          sessionStorage.setItem(verifierKey, verifier);
          const result = await api("/api/gmail/connect", "POST", { consent, browser_verifier: verifier });
          const target = new URL(result.url);
          if (target.origin !== "https://accounts.google.com") throw new Error("Invalid Google authorization address");
          window.location.assign(target.href);
        })}>{status.connected ? "Reconnect Gmail" : "Connect Gmail"}</button>
      </>}
    </>}
    {disconnect && <Dialog titleId="gmail-disconnect-title" destructive onClose={() => setDisconnect(false)}>
      <h2 id="gmail-disconnect-title">Disconnect Gmail?</h2>
      <p>This removes the saved Gmail connection and imported email headers. Your tracked jobs stay in Alongside.</p>
      <div className="button-row"><button className="secondary" autoFocus disabled={busy} onClick={() => setDisconnect(false)}>Cancel</button><button disabled={busy} onClick={() => run(async () => {
        const result = await api("/api/gmail/connection", "DELETE");
        setStatus(await api("/api/gmail/status")); setNotice(result.notice); setDisconnect(false);
      })}>Disconnect and remove headers</button></div>
    </Dialog>}
  </section>;
}
