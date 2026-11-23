import { useState } from "react";
import { ALLOWED_HOSTS } from "./policy";

type Result = { kind: "blocked"; directive: string } | { kind: "open" } | { kind: "error"; message: string };

/**
 * "Don't take our word for it": tries to send a harmless test string (no user data) to a
 * destination outside the allowed list. With the Content-Security-Policy in place the browser
 * refuses before any request leaves, and reports the violation, which is shown here.
 */
export function PrivacyProof() {
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);
  const [open, setOpen] = useState(false);

  const run = async () => {
    setBusy(true);
    setRes(null);
    let violation: string | null = null;
    const onViolation = (e: SecurityPolicyViolationEvent) => {
      if (e.blockedURI.includes("example.org")) violation = e.effectiveDirective || e.violatedDirective;
    };
    document.addEventListener("securitypolicyviolation", onViolation);
    try {
      // A test string only: nothing from Hearth's store is used here.
      await fetch("https://example.org/hearth-privacy-test", { method: "POST", body: "hearth privacy test", mode: "no-cors" });
      await new Promise((r) => setTimeout(r, 50));
      setRes(violation ? { kind: "blocked", directive: violation } : { kind: "open" });
    } catch (e) {
      await new Promise((r) => setTimeout(r, 50));
      setRes(violation ? { kind: "blocked", directive: violation } : { kind: "error", message: (e as Error).message });
    } finally {
      document.removeEventListener("securitypolicyviolation", onViolation);
      setBusy(false);
    }
  };

  return (
    <section className="privacy-proof" aria-labelledby="privacy-proof-title">
      <h2 id="privacy-proof-title">Don't take our word for it</h2>
      <p className="muted">
        Your browser only lets Hearth reach the services listed below. Test it and watch another website get refused.
      </p>
      <button className="secondary" onClick={run} disabled={busy}>
        {busy ? "Testing…" : "Test it"}
      </button>
      {res?.kind === "blocked" && (
        <p className="proof-ok" role="status">
          Blocked by your browser before anything was sent ({res.directive}). The test message never left this device.
        </p>
      )}
      {res?.kind === "open" && (
        <p className="proof-warn" role="status">
          This copy of Hearth runs without the browser lock (a development build). On the live site the test is blocked.
        </p>
      )}
      {res?.kind === "error" && (
        <p className="proof-warn" role="status">
          The request failed ({res.message}), but the browser did not report a block. Try again on the live site.
        </p>
      )}
      <button className="link" onClick={() => setOpen(!open)} aria-expanded={open}>
        {open ? "Hide" : "Where Hearth may connect"} ({ALLOWED_HOSTS.length})
      </button>
      {open && (
        <ul className="plain-list allowed-hosts">
          {ALLOWED_HOSTS.map((h) => (
            <li key={h.origin}>
              <code>{h.origin.replace("https://", "")}</code>
              <br />
              <small>{h.what}</small>
            </li>
          ))}
        </ul>
      )}
      <p className="muted">
        <small>Your words, notes and places never go to any of these.</small>
      </p>
    </section>
  );
}
