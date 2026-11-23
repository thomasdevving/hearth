import { useState } from "react";
import type { PlanAction } from "@hearth/engine";
import type { ActionChoice } from "../store/db";
import { chooseVersion, setSmaller, summarizeChoices, SMALLER_MAX } from "../app/smallerStep";
import { prettyDate } from "../app/labels";

/**
 * One action from the user's plan, with their own smaller version for a day when it is too much.
 * Everything here is the user's text; Hearth only remembers which version they chose (counted
 * by code) and says so plainly.
 */
export function ActionItem({ action, choices, today, showQuote = true }: { action: PlanAction; choices: ActionChoice[]; today: string; showQuote?: boolean }) {
  const [tooMuch, setTooMuch] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(action.smaller ?? "");
  const s = summarizeChoices(choices, action.id, today);
  const showSmaller = action.smaller && (tooMuch || s.today === "smaller");

  const save = async () => {
    await setSmaller(action, draft);
    setEditing(false);
  };

  return (
    <div className="action-item">
      <div className="plan-item-text">
        <strong>{action.text}</strong>
        {showQuote && action.quote && <span className="quote">“{action.quote}”</span>}
        {s.last && (
          <small className="action-memory">
            Last time ({prettyDate(s.last.date)}) you chose {s.last.choice === "smaller" ? "the smaller step" : "this"}.
          </small>
        )}
      </div>

      {s.today === "full" && <p className="action-chosen">Chosen for today ✓</p>}

      {showSmaller && (
        <div className="smaller-step" role="region" aria-label="A smaller step">
          <span className="smaller-label">A smaller step</span>
          <p>{action.smaller}</p>
          {s.today === "smaller" ? (
            <p className="action-chosen">Chosen for today ✓</p>
          ) : (
            <button className="secondary" onClick={() => chooseVersion(action.id, today, "smaller")}>
              I'll do this instead
            </button>
          )}
        </div>
      )}

      {editing ? (
        <div className="smaller-edit">
          <label>
            If this is too much, I will…
            <input value={draft} maxLength={SMALLER_MAX} onChange={(e) => setDraft(e.target.value)} placeholder="Only text: “Ten minutes tonight?”" autoFocus />
          </label>
          <div className="row">
            <button className="secondary" onClick={save}>
              Save
            </button>
            <button className="link" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        !s.today && (
          <div className="row action-buttons">
            <button className="secondary" onClick={() => chooseVersion(action.id, today, "full")}>
              I'll do this
            </button>
            {action.smaller ? (
              !tooMuch && (
                <button className="link" onClick={() => setTooMuch(true)}>
                  Too much today?
                </button>
              )
            ) : (
              <button className="link" onClick={() => setEditing(true)}>
                Make it smaller
              </button>
            )}
          </div>
        )
      )}
      {action.smaller && !editing && (
        <button
          className="link small-link"
          onClick={() => {
            setDraft(action.smaller ?? "");
            setEditing(true);
          }}
        >
          Change the smaller step
        </button>
      )}
    </div>
  );
}
