import ResumeEditor from "./ResumeEditor";
import { useEffect, useState, type FormEvent } from "react";
import { createClient, type Session } from "@supabase/supabase-js";
import {
  Radar,
  LayoutDashboard,
  ListTodo,
  BriefcaseBusiness,
  Settings,
  Plus,
  ArrowUpRight,
  Check,
  X,
  FileText,
  Search,
  ShieldCheck,
  Upload,
  LogOut,
  ChevronRight,
} from "lucide-react";

type Preferences = {
  roles: string[];
  locations: string[];
  skills: string[];
  blocked_companies: string[];
  threshold: number;
  resume_consent: boolean;
};
type Resume = {
  id: string;
  version: number;
  facts: Record<string, string>;
  skills: string[];
  bullets: { id: string; text: string }[];
};
type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  url: string;
  salary: string;
  stage: string;
  score: number | null;
  reason: string;
  filtered: boolean;
  applied_at?: string;
};
type State = {
  preferences: Preferences;
  jobs: Job[];
  resumes: Resume[];
  activity: { id: string; event: string; created: string }[];
};
const demo = import.meta.env.VITE_LOCAL_DEMO === "true";
const url = import.meta.env.VITE_SUPABASE_URL;
const supabase =
  url && import.meta.env.VITE_SUPABASE_ANON_KEY
    ? createClient(url, import.meta.env.VITE_SUPABASE_ANON_KEY)
    : null;
const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:8000";
const stages = [
  "Ready to Apply",
  "Awaiting Approval",
  "Applied (Manual)",
  "In Review",
  "Interview",
  "Offer",
  "Rejected",
  "Archived",
];
const cleanResume = (r: Resume) => ({
  facts: r.facts,
  skills: r.skills,
  bullets: r.bullets,
});

const alreadyApplied = (job: Job) => Boolean(job.applied_at) || ["Applied (Manual)", "In Review", "Interview", "Offer", "Rejected"].includes(job.stage);

export default function App() {
  const [session, setSession] = useState<Session | null>(null),
    [tab, setTab] = useState("Home"),
    [state, setState] = useState<State | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [addOpen, setAddOpen] = useState(false),
    [selected, setSelected] = useState<Job | null>(null),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [email, setEmail] = useState(""),
    [code, setCode] = useState(""),
    [sent, setSent] = useState(false),
    [resumeJson, setResumeJson] = useState(""),
    [extracted, setExtracted] = useState(""),
    [parseWarnings, setParseWarnings] = useState<string[]>([]),
    [validation, setValidation] = useState<{
      passed: boolean;
      violations: string[];
      notice: string;
    } | null>(null);
  async function api(path: string, method = "GET", body?: unknown) {
    const current = supabase
      ? (await supabase.auth.getSession()).data.session
      : null;
    const response = await fetch(apiUrl + path, {
      method,
      headers: {
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(current ? { Authorization: "Bearer " + current.access_token } : {}),
      },
      body:
        body instanceof FormData
          ? body
          : body === undefined
            ? undefined
            : JSON.stringify(body),
    });
    if (!response.ok) {
      const data = await response
        .json()
        .catch(() => ({ detail: "Request failed" }));
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "Please check the form fields.",
      );
    }
    return response.status === 204 ? null : response.json();
  }
  async function refresh() {
    setState(await api("/api/state"));
  }
  async function action(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, value) =>
      setSession(value),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!demo && !session) return;
    let active = true;
    const load = () =>
      refresh().catch((e) => {
        if (active) setError(e.message);
      });
    load();
    const id = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [session]);
  const jobs = state?.jobs || [],
    activeJobs = jobs.filter((j) => !j.filtered && j.stage !== "Archived"),
    todo = jobs.filter((j) =>
      ["Ready to Apply", "Awaiting Approval"].includes(j.stage),
    ),
    applied = jobs.filter((j) =>
      ["Applied (Manual)", "In Review", "Interview", "Offer"].includes(j.stage),
    );
  async function move(job: Job, stage: string) {
    const updated = await api("/api/jobs/" + job.id, "PATCH", { stage });
    setSelected(updated);
    await refresh();
  }
  async function saveSettings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action(async () => {
      await api("/api/preferences", "POST", {
        roles: String(f.get("roles"))
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        locations: String(f.get("locations"))
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean),
        skills: String(f.get("skills"))
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        blocked_companies: String(f.get("blocked"))
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        threshold: Number(f.get("threshold")),
        resume_consent: f.has("consent"),
      });
      await refresh();
      setNotice("Preferences saved. Open jobs have been rescored.");
    });
  }
  async function upload(file?: File) {
    if (!file) return;
    await action(async () => {
      const form = new FormData();
      form.append("file", file);
      const result = await api("/api/resumes/extract", "POST", form);
      setExtracted(result.text);
      setResumeJson(JSON.stringify(result.draft));
      setParseWarnings(result.warnings || []);
      setValidation(null);
      setNotice(result.notice);
    });
  }
  function resumeEditor() {
    const r = state?.resumes[0];
    setValidation(null);
    setResumeJson(
      JSON.stringify(
        r
          ? cleanResume(r)
          : {
              facts: {
                name: "",
                employer: "",
                title: "",
                dates: "",
                education: "",
              },
              skills: [],
              bullets: [{ id: "b1", text: "" }],
            },
        null,
        2,
      ),
    );
  }
  if (!demo && !session)
    return (
      <main className="login">
        <div className="login-card">
          <Radar size={36} />
          <span className="eyebrow">INVITE-ONLY BETA</span>
          <h1>
            Your next chapter,
            <br />
            with a clearer view.
          </h1>
          <p>
            Keep your job search in focus. Thoughtful matches, truthful resumes,
            and you in control.
          </p>
          {!supabase ? (
            <div className="alert">
              Configure Supabase authentication to sign in. See the deployment
              guide.
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                action(async () => {
                  if (sent) {
                    const { error } = await supabase.auth.verifyOtp({
                      email,
                      token: code,
                      type: "email",
                    });
                    if (error) throw error;
                  } else {
                    const { error } = await supabase.auth.signInWithOtp({
                      email,
                      options: { shouldCreateUser: false },
                    });
                    if (error) throw error;
                    setSent(true);
                    setNotice("Check your email for your sign-in code.");
                  }
                });
              }}
            >
              <label>
                Email address
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              {sent && (
                <label>
                  One-time code
                  <input
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    autoComplete="one-time-code"
                  />
                </label>
              )}
              <button disabled={busy}>
                {sent ? "Sign in" : "Send sign-in code"}{" "}
                <ArrowUpRight size={16} />
              </button>
            </form>
          )}
          {error && <div className="alert">{error}</div>}
          {notice && <p role="status">{notice}</p>}
          <small>Access is limited to invited accounts.</small>
        </div>
      </main>
    );
  return (
    <div className="shell">
      <aside>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("Home");
          }}
        >
          <Radar />
          <span>
            jobradar<span className="brand-dot">.</span>
          </span>
        </a>
        <span className="workspace-label">YOUR WORKSPACE</span>
        <nav>
          {[
            [LayoutDashboard, "Home"],
            [ListTodo, "To do"],
            [BriefcaseBusiness, "Jobs"],
            [Settings, "Settings"],
          ].map(([Icon, label]) => {
            const Component = Icon as typeof Radar;
            return (
              <button
                key={String(label)}
                className={tab === label ? "nav-item active" : "nav-item"}
                onClick={() => setTab(String(label))}
              >
                <Component size={19} />
                {String(label)}
                {label === "To do" && todo.length > 0 && (
                  <span className="count">{todo.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={21} />
          <strong>You're in the driver's seat</strong>
          <p>Apply on the employer’s portal, then track your progress here.</p>
        </div>
        <div className="profile">
          <div className="avatar">
            {demo ? "D" : session?.user.email?.[0].toUpperCase()}
          </div>
          <div>
            <strong>{demo ? "Demo workspace" : session?.user.email}</strong>
            <small>Private beta</small>
          </div>
          {session && (
            <button
              className="icon"
              aria-label="Sign out"
              onClick={() => supabase?.auth.signOut()}
            >
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>
      <div className="main-wrap">
        <header>
          <span className="breadcrumb">
            Workspace <ChevronRight size={14} /> {tab}
          </span>
          <div className="connection">
            <span className="dot" />
            Manual mode <span className="divider" /> Inbox not connected
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <span className="eyebrow">YOUR SEARCH, IN FOCUS</span>
              <h1>
                {tab === "Home"
                  ? "A little clarity. A big next step."
                  : tab === "To do"
                    ? "Make your next move."
                    : tab === "Jobs"
                      ? "Every opportunity, one place."
                      : "Make this search yours."}
              </h1>
              <p>
                {tab === "Home"
                  ? "Good opportunities deserve your attention. Let’s find your next one."
                  : tab === "To do"
                    ? "Review the details, then take the next step on your terms."
                    : tab === "Jobs"
                      ? "A clear view of where you are and what comes next."
                      : "Your preferences shape your matches. You stay in control."}
              </p>
            </div>
            {tab !== "Settings" && (
              <button onClick={() => setAddOpen(true)}>
                <Plus size={17} /> Add a job
              </button>
            )}
          </div>
          {demo && (
            <div className="demo-note">
              Local demo · data is saved to this development workspace · live
              integrations are off
            </div>
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
              <button
                className="icon"
                onClick={() => setError("")}
                aria-label="Dismiss error"
              >
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div className="success" role="status">
              {notice}
            </div>
          )}
          {!state ? (
            <div className="panel empty">
              <Radar />
              <h2>Connecting to your workspace</h2>
              <p>Make sure the Python API is running.</p>
              <button onClick={() => action(refresh)}>Retry connection</button>
            </div>
          ) : (
            <>
              {tab === "Home" && (
                <>
                  <section className="hero">
                    <div>
                      <span className="pill">
                        <span className="dot" /> A MORE INTENTIONAL SEARCH
                      </span>
                      <h2>
                        Your next role starts
                        <br />
                        with the right fit.
                      </h2>
                      <p>
                        {activeJobs.length
                          ? `${activeJobs.length} opportunities in your workspace. Take them one thoughtful step at a time.`
                          : "Add your first opportunity, tell us what matters, and build a search that feels like you."}
                      </p>
                      <button
                        className="light"
                        onClick={() => {
                          setTab("Settings");
                        }}
                      >
                        Set your preferences <ArrowUpRight size={17} />
                      </button>
                    </div>
                    <div className="radar-art" aria-hidden="true">
                      <div />
                      <div />
                      <div />
                      <span className="radar-center">
                        <Radar size={38} />
                      </span>
                      <span className="radar-point p1" />
                      <span className="radar-point p2" />
                      <span className="radar-point p3" />
                    </div>
                  </section>
                  <section className="stats">
                    {[
                      [
                        String(activeJobs.length),
                        "Opportunities",
                        BriefcaseBusiness,
                      ],
                      [
                        String(todo.length),
                        "Ready for your attention",
                        ListTodo,
                      ],
                      [String(applied.length), "Applications tracked", Check],
                    ]
                      .filter(([n]) => Number(n) > 0)
                      .map(([n, label, Icon]) => {
                        const C = Icon as typeof Radar;
                        return (
                          <div className="stat" key={String(label)}>
                            <div>
                              <small>{String(label)}</small>
                              <strong>{String(n)}</strong>
                            </div>
                            <C size={22} />
                          </div>
                        );
                      })}
                  </section>
                  <div className="home-grid">
                    <section className="panel">
                      <div className="section-title">
                        <h2>Your next steps</h2>
                        <span className="muted">
                          A little progress goes a long way
                        </span>
                      </div>
                      {!state.preferences.skills.length && (
                        <button
                          className="step"
                          onClick={() => setTab("Settings")}
                        >
                          <span className="step-icon">
                            <Settings size={19} />
                          </span>
                          <span>
                            <strong>Tell us what a good fit looks like</strong>
                            <small>
                              Add your target roles, locations, and skills.
                            </small>
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      )}
                      {!state.resumes.length && (
                        <button
                          className="step"
                          onClick={() => {
                            setTab("Settings");
                            resumeEditor();
                          }}
                        >
                          <span className="step-icon">
                            <FileText size={19} />
                          </span>
                          <span>
                            <strong>Bring your experience into focus</strong>
                            <small>Upload and confirm your base resume.</small>
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      )}
                      {todo.slice(0, 3).map((j) => (
                        <button
                          className="step"
                          key={j.id}
                          onClick={() => setSelected(j)}
                        >
                          <span className="company-mark">{j.company[0]}</span>
                          <span>
                            <strong>{j.title}</strong>
                            <small>
                              {j.company} · {j.stage}
                            </small>
                          </span>
                          <ChevronRight size={18} />
                        </button>
                      ))}
                      {!todo.length &&
                        !!state.resumes.length &&
                        !!state.preferences.skills.length && (
                          <div className="empty">
                            <Check />
                            <h3>You're all caught up.</h3>
                            <p>Add another job whenever you're ready.</p>
                          </div>
                        )}
                    </section>
                    <section className="panel">
                      <div className="section-title">
                        <h2>Recent activity</h2>
                        <span className="tiny-tag">YOUR TIMELINE</span>
                      </div>
                      {state.activity.length ? (
                        state.activity.slice(0, 4).map((a) => (
                          <div className="activity" key={a.id}>
                            <span className="activity-dot" />
                            <div>
                              <p>{a.event}</p>
                              <small>
                                {new Date(a.created).toLocaleString()}
                              </small>
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="empty small">
                          <FileText />
                          <h3>A fresh start.</h3>
                          <p>Your search history will appear here as you go.</p>
                        </div>
                      )}
                    </section>
                  </div>
                </>
              )}
              {(tab === "Jobs" || tab === "To do") && (
                <section className="panel jobs-panel">
                  <div className="toolbar">
                    <div className="tabs">
                      {[
                        "All",
                        "Ready to Apply",
                        "Awaiting Approval",
                        "Near Misses",
                        "Filtered Out",
                        "Archived",
                      ].map((f) => (
                        <button
                          className={filter === f ? "selected" : ""}
                          onClick={() => setFilter(f)}
                          key={f}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <label className="search">
                      <Search size={17} />
                      <input
                        placeholder="Search roles or companies"
                        aria-label="Search jobs"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                      />
                    </label>
                  </div>
                  <div className="job-list">
                    {(tab === "To do" ? todo : jobs)
                      .filter(
                        (j) =>
                          (filter === "Filtered Out"
                            ? j.filtered
                            : filter === "All"
                              ? !j.filtered && j.stage !== "Archived"
                              : j.stage === filter && !j.filtered) &&
                          `${j.title} ${j.company}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                      )
                      .map((j) => (
                        <button
                          className="job-row"
                          key={j.id}
                          onClick={() => setSelected(j)}
                        >
                          <span className="company-mark">{j.company[0]}</span>
                          <span className="job-name">
                            <strong>{j.title}</strong>
                            <small>
                              {j.company} ·{" "}
                              {j.location || "Location not specified"}
                            </small>
                          </span>
                          <span className="job-salary">
                            {j.salary || "Salary not disclosed"}
                            <small>
                              {j.salary
                                ? "Disclosed"
                                : "Not enough data to estimate"}
                            </small>
                          </span>
                          <span className="score">
                            {j.score === null ? "—" : j.score}
                            <small>skill fit</small>
                          </span>
                          <span><span className="stage">{j.stage}</span>{alreadyApplied(j) && <small style={{display:"block",marginTop:5}}>✓ Already applied</small>}</span>
                          <ChevronRight size={17} />
                        </button>
                      ))}
                  </div>
                  {!(tab === "To do" ? todo : jobs).some(
                    (j) =>
                      (filter === "Filtered Out"
                        ? j.filtered
                        : filter === "All"
                          ? !j.filtered && j.stage !== "Archived"
                          : j.stage === filter && !j.filtered) &&
                      `${j.title} ${j.company}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  ) && (
                    <div className="empty">
                      <BriefcaseBusiness size={30} />
                      <h2>No opportunities here yet.</h2>
                      <p>
                        Add a job link and paste its description to get started.
                      </p>
                      <button onClick={() => setAddOpen(true)}>
                        <Plus size={16} /> Add a job
                      </button>
                    </div>
                  )}
                </section>
              )}
              {tab === "Settings" && (
                <div className="settings-grid">
                  <section className="panel">
                    <h2>What matters to you</h2>
                    <p className="muted">
                      This beta uses role and location filters with a
                      preferred-skills score.
                    </p>
                    <form
                      onSubmit={saveSettings}
                      key={JSON.stringify(state.preferences)}
                    >
                      <label>
                        Target roles
                        <textarea
                          name="roles"
                          defaultValue={state.preferences.roles.join("\n")}
                          placeholder={
                            "Product Manager\nSenior Product Manager"
                          }
                          rows={3}
                        />
                        <small>
                          Add up to 20 roles, one per line or separated by
                          commas. Any listed role can match.
                        </small>
                      </label>
                      <label>
                        Preferred locations
                        <textarea
                          name="locations"
                          defaultValue={state.preferences.locations.join("\n")}
                          placeholder={"Bengaluru\nMumbai\nRemote"}
                          rows={3}
                        />
                        <small>
                          Add up to 20 locations, one per line or separated by
                          commas. Any listed location can match.
                        </small>
                      </label>
                      <label>
                        Preferred skills, separated by commas
                        <textarea
                          name="skills"
                          defaultValue={state.preferences.skills.join(", ")}
                          placeholder="SQL, Product strategy, Analytics"
                        />
                      </label>
                      <label>
                        Companies to exclude
                        <input
                          name="blocked"
                          defaultValue={state.preferences.blocked_companies.join(
                            ", ",
                          )}
                          placeholder="Your current employer"
                        />
                      </label>
                      <label>
                        Strong-match threshold
                        <input
                          name="threshold"
                          type="number"
                          min="80"
                          max="100"
                          defaultValue={state.preferences.threshold}
                        />
                      </label>
                      <label className="checkbox">
                        <input
                          type="checkbox"
                          name="consent"
                          defaultChecked={state.preferences.resume_consent}
                        />
                        I consent to storing and processing my confirmed resume
                        for matching and validation.
                      </label>
                      <button disabled={busy}>
                        Save preferences <Check size={16} />
                      </button>
                    </form>
                  </section>
                  <div>
                    <section className="panel">
                      <h2>Your base resume</h2>
                      <p className="muted">
                        {state.resumes.length
                          ? `Version ${state.resumes[0].version} confirmed. Past versions are retained.`
                          : "Start with the facts. Review extracted text before confirming your structured resume."}
                      </p>
                      <label className="upload">
                        <Upload size={24} />
                        <strong>Upload PDF or DOCX</strong>
                        <span>Up to 5 MB · text-based documents</span>
                        <input
                          type="file"
                          accept=".pdf,.docx"
                          disabled={busy || !state.preferences.resume_consent}
                          onChange={(e) => upload(e.target.files?.[0])}
                        />
                      </label>
                      {!state.preferences.resume_consent && (
                        <small>
                          Save your processing consent to enable uploads.
                        </small>
                      )}
                      {extracted && (
                        <details open>
                          <summary>
                            Extracted text — review for accuracy
                          </summary>
                          <textarea
                            className="extracted"
                            value={extracted}
                            onChange={(e) => setExtracted(e.target.value)}
                          />
                          <p className="muted">
                            The fields below are prefilled from this text. Correct any missing details or extraction mistakes before confirming.
                          </p>
                        </details>
                      )}
                      <button className="secondary" onClick={resumeEditor} disabled={!!resumeJson}>
                        Review and edit resume
                      </button>
                      {parseWarnings.length > 0 && <div className="success"><div><strong>Please review</strong>{parseWarnings.map(w=><p key={w}>{w}</p>)}</div></div>}
                      {resumeJson && (
                        <>
                          <ResumeEditor
                            value={resumeJson}
                            onChange={(value) => {
                              setResumeJson(value);
                              setValidation(null);
                            }}
                          />
                          <div className="button-row">
                            <button
                              disabled={
                                busy || !state.preferences.resume_consent
                              }
                              onClick={() =>
                                action(async () => {
                                  await api(
                                    "/api/resumes",
                                    "POST",
                                    JSON.parse(resumeJson),
                                  );
                                  await refresh();
                                  setNotice(
                                    "New base resume version confirmed.",
                                  );
                                  setValidation(null);
                                })
                              }
                            >
                              Confirm as new base
                            </button>
                            <button
                              className="secondary"
                              disabled={busy || !state.resumes.length}
                              onClick={() =>
                                action(async () => {
                                  setValidation(
                                    await api("/api/resumes/validate", "POST", {
                                      base_id: state.resumes[0].id,
                                      draft: JSON.parse(resumeJson),
                                    }),
                                  );
                                })
                              }
                            >
                              Check against base
                            </button>
                          </div>
                          {validation && (
                            <div
                              className={
                                validation.passed ? "success" : "alert"
                              }
                            >
                              <div>
                                <strong>
                                  {validation.passed
                                    ? "Consistency checks passed"
                                    : "Changes need review"}
                                </strong>
                                {validation.violations.map((v) => (
                                  <p key={v}>{v}</p>
                                ))}
                                <p>{validation.notice}</p>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </section>
                    <section className="panel connections">
                      <h2>Connections</h2>
                      {["Gmail inbox", "Your AI provider"].map((s) => (
                        <div key={s}>
                          <span>{s}</span>
                          <span className="stage">Not available yet</span>
                        </div>
                      ))}
                      <p className="muted">
                        Gmail and AI connections are not available yet.
                      </p>
                    </section>
                    <section className="panel">
                      <h2>Your data</h2>
                      <p className="muted">
                        Remove this workspace’s jobs, preferences, resume
                        versions, and activity. Your login account is managed
                        separately.
                      </p>
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              "Delete all workspace data? This cannot be undone.",
                            )
                          )
                            action(async () => {
                              await api("/api/data", "DELETE");
                              setResumeJson("");
                              setExtracted("");
                              setParseWarnings([]);
                              setValidation(null);
                              await refresh();
                              setNotice("Workspace data deleted.");
                            });
                        }}
                      >
                        Delete workspace data
                      </button>
                    </section>
                  </div>
                </div>
              )}
            </>
          )}
          <footer>
            <Radar size={15} /> A thoughtful search. A confident next step.
            <span>Job Radar · Private beta</span>
          </footer>
        </main>
      </div>
      {addOpen && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-title"
          >
            <button
              className="close icon"
              aria-label="Close"
              onClick={() => setAddOpen(false)}
            >
              <X />
            </button>
            <span className="eyebrow">BUILD YOUR SHORTLIST</span>
            <h2 id="add-title">Add an opportunity</h2>
            <p className="muted">
              Paste the description yourself. We don’t fetch or scrape the job
              link.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                action(async () => {
                  await api("/api/jobs", "POST", Object.fromEntries(f));
                  await refresh();
                  setAddOpen(false);
                  setNotice("Opportunity added to your workspace.");
                });
              }}
            >
              <div className="form-row">
                <label>
                  Job title
                  <input name="title" required maxLength={200} />
                </label>
                <label>
                  Company
                  <input name="company" required maxLength={200} />
                </label>
              </div>
              <label>
                Original posting URL
                <input name="url" type="url" required placeholder="https://…" />
              </label>
              <div className="form-row">
                <label>
                  Location
                  <input name="location" />
                </label>
                <label>
                  Disclosed salary (optional)
                  <input name="salary" placeholder="e.g. ₹18–24 LPA" />
                </label>
              </div>
              <label>
                Job description
                <textarea
                  name="description"
                  required
                  minLength={10}
                  maxLength={40000}
                  rows={6}
                />
              </label>
              {error && (
                <p role="alert" className="error-text">
                  {error}
                </p>
              )}
              <button disabled={busy}>
                {busy ? "Saving…" : "Add to my jobs"} <Plus size={16} />
              </button>
            </form>
          </section>
        </div>
      )}
      {selected && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-title"
          >
            <button
              className="close icon"
              aria-label="Close"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
            <span className="eyebrow">
              {selected.company} · {selected.location}
            </span>
            <h2 id="job-title">{selected.title}</h2>
            <span className="stage">{selected.stage}</span>
            {alreadyApplied(selected) && <p className="success" role="status"><Check size={16}/> Already applied{selected.applied_at ? ` · ${new Date(selected.applied_at).toLocaleDateString()}` : ""}</p>}
            <p>{selected.reason}</p>
            <p>
              <strong>{selected.salary || "Salary not disclosed"}</strong>
            </p>
            <div className="button-row">
              <a
                className="button"
                href={selected.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open original posting <ArrowUpRight size={17} />
              </a>
              <button
                className="secondary"
                disabled={busy || alreadyApplied(selected)}
                onClick={() => action(() => move(selected, "Applied (Manual)"))}
              >
                {alreadyApplied(selected) ? "Already applied" : "Mark as applied"}
              </button>
            </div>
            <details>
              <summary>Job description</summary>
              <p className="description">{selected.description}</p>
            </details>
            <details>
              <summary>Change stage</summary>
              <select
                aria-label="Application stage"
                value={selected.stage}
                disabled={busy}
                onChange={(e) => action(() => move(selected, e.target.value))}
              >
                {!stages.includes(selected.stage) && (
                  <option>{selected.stage}</option>
                )}
                {stages.map((s) => (
                  <option key={s} disabled={s === "Applied (Manual)" && alreadyApplied(selected)}>{s}</option>
                ))}
              </select>
            </details>
            {error && (
              <p className="error-text" role="alert">
                {error}
              </p>
            )}
            <p className="muted">
              Apply on the original portal, then return here and choose Mark as
              applied. Opening the link does not change your application stage.
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
