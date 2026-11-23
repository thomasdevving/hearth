import type { Person } from "../store/db";
import { navigate } from "../app/events";
import { smsHref, telHref } from "../app/people";

/**
 * "Call a friend": the people the user chose, one tap to call or to open a ready message.
 * Hearth never contacts anyone itself (docs/06 §4.3). Works offline; no model involved.
 */
export function CallAFriend({ people, compact = false }: { people: Person[]; compact?: boolean }) {
  if (people.length === 0) {
    return (
      <section className="call-friend" aria-labelledby="call-friend-title">
        <h2 id="call-friend-title">Call a friend</h2>
        <p className="muted">Add one to three people to reach out to on a hard day. Hearth never contacts them.</p>
        <button className="secondary" onClick={() => navigate("people")}>
          Add someone
        </button>
      </section>
    );
  }
  return (
    <section className="call-friend" aria-labelledby="call-friend-title">
      <h2 id="call-friend-title">Call a friend</h2>
      {!compact && <p className="muted">You choose who and when. Hearth never sends anything.</p>}
      <ul className="people-list">
        {people.map((p) => (
          <li key={p.id}>
            <div className="person-text">
              <strong>{p.name || p.phone}</strong>
              {p.goodFor && <small>Good for {p.goodFor}</small>}
              {!compact && p.message && <q>{p.message}</q>}
            </div>
            <div className="person-actions">
              <a className="call" href={telHref(p)} aria-label={`Call ${p.name || p.phone}`}>
                Call
              </a>
              <a className="call secondary" href={smsHref(p)} aria-label={`Message ${p.name || p.phone}`}>
                Message
              </a>
            </div>
          </li>
        ))}
      </ul>
      {!compact && (
        <button className="link" onClick={() => navigate("people")}>
          Edit my people ›
        </button>
      )}
    </section>
  );
}
