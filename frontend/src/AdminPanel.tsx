import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, Plus, RefreshCw, ShieldCheck, Users } from "lucide-react";

type Invitation = {
  email: string;
  active: boolean;
  invited_at: string;
  signed_up: boolean;
};
type Member = {
  email: string;
  signed_up_at: string;
  last_seen_at: string;
  allowed: boolean;
  is_admin: boolean;
};
type Dashboard = { invitations: Invitation[]; members: Member[] };
type Request = (path: string, method?: string, body?: unknown) => Promise<any>;
const formatDate = (value: string) => new Date(value).toLocaleString();

export default function AdminPanel({ request }: { request: Request }) {
  const [data, setData] = useState<Dashboard | null>(null),
    [email, setEmail] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    setData(await request("/api/admin/users"));
  }
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let active = true;
    request("/api/admin/users")
      .then((value) => {
        if (active) setData(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function invite(event: FormEvent) {
    event.preventDefault();
    await run(async () => {
      await request("/api/admin/invitations", "POST", { email });
      setEmail("");
      await load();
      setNotice(
        "Access granted. Share the app link so they can sign in with this email.",
      );
    });
  }
  return (
    <div className="admin-panel">
      <section className="panel admin-intro">
        <ShieldCheck size={24} />
        <div>
          <h2>Your private beta, made simple</h2>
          <p>
            Add an email to grant access. People verify their email to sign in;
            you don’t need to create their accounts in Supabase.
          </p>
        </div>
      </section>
      {error && (
        <div className="alert" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="success" role="status">
          {notice}
        </div>
      )}
      <div className="settings-grid">
        <section className="panel">
          <h2>Invite someone</h2>
          <form onSubmit={invite}>
            <label>
              Invite email
              <input
                type="email"
                required
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
              />
            </label>
            <button disabled={busy}>
              <Plus size={16} />
              Grant access
            </button>
          </form>
          <p className="muted">
            Adding an email grants access; it doesn’t send an invitation email.
            Share the app link with them.
          </p>
          <button
            className="secondary"
            onClick={() =>
              run(async () => {
                await navigator.clipboard.writeText(window.location.origin);
                setNotice("App link copied. Share it with your invited user.");
              })
            }
          >
            <Copy size={16} />
            Copy app link
          </button>
        </section>
        <section className="panel">
          <h2>Beta overview</h2>
          <div className="admin-counts">
            <div>
              <strong>
                {data ? data.invitations.filter((i) => i.active).length : "—"}
              </strong>
              <span>Invited emails</span>
            </div>
            <div>
              <strong>{data ? data.members.length : "—"}</strong>
              <span>Signed-in accounts</span>
            </div>
          </div>
          <p className="muted">
            The signup list records the first verified sign-in to Job Radar,
            including people still waiting for access. It doesn’t list
            unverified email attempts.
          </p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => run(load)}
          >
            <RefreshCw size={15} />
            Refresh list
          </button>
        </section>
      </div>
      <section className="panel">
        <h2>Invited emails</h2>
        {!data ? (
          <p>Loading invitations…</p>
        ) : data.invitations.length === 0 ? (
          <div className="empty small">
            <Users />
            <h3>Your first invite starts here.</h3>
            <p>
              Your admin account already has access. Add a tester’s email above.
            </p>
          </div>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Access</th>
                  <th>Joined</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {data.invitations.map((i) => (
                  <tr key={i.email}>
                    <td>{i.email}</td>
                    <td>
                      <span className="stage">
                        {i.active ? "Invited" : "Revoked"}
                      </span>
                    </td>
                    <td>
                      {i.signed_up ? (
                        <>
                          <Check size={13} /> Yes
                        </>
                      ) : (
                        "Not yet"
                      )}
                    </td>
                    <td>
                      <button
                        className={i.active ? "danger" : "secondary"}
                        disabled={busy}
                        onClick={() => {
                          if (
                            i.active &&
                            !window.confirm(
                              `Remove access for ${i.email}? They will lose access, and their saved workspace data will be retained.`,
                            )
                          )
                            return;
                          run(async () => {
                            await request(
                              i.active
                                ? "/api/admin/invitations/revoke"
                                : "/api/admin/invitations",
                              "POST",
                              { email: i.email },
                            );
                            await load();
                            setNotice(
                              i.active
                                ? "Access removed. Existing sessions can no longer access private features."
                                : "Access restored.",
                            );
                          });
                        }}
                      >
                        {i.active ? "Remove access" : "Restore access"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Who has signed up</h2>
        {data?.members.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Access</th>
                  <th>First sign-in</th>
                  <th>Last seen</th>
                </tr>
              </thead>
              <tbody>
                {data.members.map((m) => (
                  <tr key={m.email}>
                    <td>{m.email}</td>
                    <td>
                      <span className="stage">
                        {m.is_admin
                          ? "Super admin"
                          : m.allowed
                            ? "Granted"
                            : "Waiting for invitation"}
                      </span>
                    </td>
                    <td>{formatDate(m.signed_up_at)}</td>
                    <td>{formatDate(m.last_seen_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">No verified sign-ins have been recorded yet.</p>
        )}
      </section>
    </div>
  );
}
