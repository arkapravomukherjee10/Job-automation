import { useState } from "react";
import { Plus, X } from "lucide-react";

type Draft = {
  facts: Record<string, string>;
  skills: string[];
  bullets: { id: string; text: string }[];
};
export default function ResumeEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const draft: Draft = JSON.parse(value);
  const [factName, setFactName] = useState("");
  const save = (next: Draft) => onChange(JSON.stringify(next));
  return (
    <div className="resume-editor">
      <h3>Confirmed facts</h3>
      <p className="muted">
        Copy details exactly from your resume. Add a separate field for each
        employer, title, date range, qualification, or certification.
      </p>
      {Object.entries(draft.facts).map(([name, text]) => (
        <label key={name}>
          {name.charAt(0).toUpperCase() + name.slice(1)}
          <input
            value={text}
            onChange={(e) =>
              save({
                ...draft,
                facts: { ...draft.facts, [name]: e.target.value },
              })
            }
          />
        </label>
      ))}
      <div className="button-row">
        <input
          aria-label="New fact label"
          placeholder="e.g. Previous employer"
          value={factName}
          onChange={(e) => setFactName(e.target.value)}
          maxLength={100}
        />
        <button
          className="secondary"
          disabled={
            !factName.trim() || Object.hasOwn(draft.facts, factName.trim())
          }
          onClick={() => {
            save({
              ...draft,
              facts: { ...draft.facts, [factName.trim()]: "" },
            });
            setFactName("");
          }}
        >
          <Plus size={15} />
          Add fact
        </button>
      </div>
      <label>
        Confirmed skills
        <textarea
          value={draft.skills.join(",")}
          onChange={(e) =>
            save({ ...draft, skills: e.target.value.split(",") })
          }
          placeholder="Python, SQL, Product strategy"
        />
      </label>
      <h3>Experience bullets</h3>
      <p className="muted">
        Use one achievement or responsibility per bullet. Each keeps its source
        reference when edited.
      </p>
      {draft.bullets.map((bullet, index) => (
        <div key={bullet.id} className="bullet-editor">
          <label>
            Experience bullet {index + 1}
            <textarea
              value={bullet.text}
              onChange={(e) =>
                save({
                  ...draft,
                  bullets: draft.bullets.map((b) =>
                    b.id === bullet.id ? { ...b, text: e.target.value } : b,
                  ),
                })
              }
            />
          </label>
          <button
            className="icon"
            aria-label={`Remove bullet ${index + 1}`}
            onClick={() =>
              save({
                ...draft,
                bullets: draft.bullets.filter((b) => b.id !== bullet.id),
              })
            }
          >
            <X size={17} />
          </button>
        </div>
      ))}
      <button
        className="secondary"
        onClick={() =>
          save({
            ...draft,
            bullets: [...draft.bullets, { id: crypto.randomUUID(), text: "" }],
          })
        }
      >
        <Plus size={15} />
        Add experience bullet
      </button>
    </div>
  );
}
