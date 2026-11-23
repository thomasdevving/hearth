import { useState } from "react";
import { db, getSettings } from "../store/db";
import { useData } from "../ui/hooks";
import { ModelBadge, Screen } from "../ui/kit";
import { router } from "../inference";
import { createShare } from "../cloud/sync";
import { cloudConfigured } from "../firebase";
import { navigate } from "../app/events";
import { catalogueId } from "@hearth/engine";
import { directionText, featureLabel, readableWeek } from "../app/labels";

export function Share() {
  const d = useData(async () => ({ weeks: (await db.week_aggregates.orderBy("isoWeek").toArray()).map((w) => w.aggregate).slice(-12), rules: await db.plan_rules.toArray(), settings: await getSettings() }));
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reportRanOn, setReportRanOn] = useState<"cloud" | "on_device" | "template" | null>(null);
  if (!d) return <Screen title="Share with your clinician">Loading…</Screen>;
  if (!cloudConfigured || !d.settings.cloudConsent)
    return (
      <Screen title="Share with your clinician" back="home">
        <p>A private link to your weekly summaries, without notes, places or names. It expires after 7 days.</p>
        <p className="muted">{cloudConfigured ? "This needs your permission for the cloud in Settings." : "Sharing is not available in this build (no Firebase project configured)."}</p>
        <button className="secondary" onClick={() => navigate("settings")}>
          Settings
        </button>
      </Screen>
    );
  return (
    <Screen title="Share with your clinician" back="home" badge={reportRanOn ? <ModelBadge ranOn={reportRanOn} /> : undefined}>
      <p>This creates a private link to a read-only page with your last {d.weeks.length} weekly summaries and a short overview with questions you may want to bring. Anyone with the link can open it for 7 days.</p>
      <button
        className="primary"
        disabled={busy || d.weeks.length === 0}
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            // Task E sees the weekly numbers and the signals you chose, in the app's plain words,
            // never your quotes (S1). The number of weeks comes from code (R2, number check).
            const rules = d.rules.filter((r) => r.active).map((r) => {
              const f = catalogueId(r.feature);
              return `${f === "place_visits" ? "Visits to a named place" : featureLabel(f).replace(/\byour\b/g, "the")} ${directionText(f, r.direction)}`;
            });
            const res = await router().run<object>("E", { "number of weeks": d.weeks.length, weeks: d.weeks.map((w) => readableWeek(w, "clinician")), "signs the person watches for": rules });
            setReportRanOn(res.ok ? res.ranOn : "template");
            const id = await createShare(d.weeks, res.ok ? res.value : null);
            setLink(`${location.origin}${location.pathname}#/report?id=${id}`);
          } catch (e) {
            setErr((e as Error).message);
          }
          setBusy(false);
        }}
      >
        {busy ? "Creating…" : "Create a link"}
      </button>
      {link && (
        <p>
          <a href={link}>{link}</a>
          <br />
          <small>Valid for 7 days.</small>
        </p>
      )}
      {err && <p role="alert">{err}</p>}
    </Screen>
  );
}
