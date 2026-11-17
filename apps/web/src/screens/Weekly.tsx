import { useEffect, useState } from "react";
import type { WeekAggregate } from "@baseline/engine";
import { db, getSettings } from "../store/db";
import { useData } from "../ui/hooks";
import { ModelBadge, Screen } from "../ui/kit";
import { router } from "../inference";
import { weeklyTemplate } from "../app/templates";
import { confirmFirstUpload, saveReport } from "../cloud/sync";
import { navigate } from "../app/events";
import { promptFor } from "../inference/prompts";
import { cloudConfigured } from "../firebase";
import { WeekNote } from "./WeekNote";

type Reflection = { reflection: string; open_question: string; ranOn: "on_device" | "cloud" | "template"; variant: "full" | "lite" | null };

function Preview({ weeks }: { weeks: WeekAggregate[] }) {
  const [busy, setBusy] = useState(false);
  return (
    <Screen title="What would be shared" back="home">
      <p>This is exactly what would be sent to your private space in the cloud, for each finished week. No dates finer than the week, no notes in your words, no places and no names.</p>
      <pre className="json">{JSON.stringify(weeks[weeks.length - 1], null, 2)}</pre>
      <p className="muted">{weeks.length} week(s) are waiting. Later weeks are sent automatically while the cloud model is allowed; you can turn it off in Settings at any time.</p>
      <div className="row">
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await confirmFirstUpload();
            setBusy(false);
            navigate("weekly");
          }}
        >
          Share weekly summaries
        </button>
        <button className="secondary" onClick={() => navigate("settings")}>
          Not now
        </button>
      </div>
    </Screen>
  );
}

export function Weekly({ params }: { params: Record<string, string> }) {
  const d = useData(async () => ({ weeks: (await db.week_aggregates.orderBy("isoWeek").toArray()), settings: await getSettings() }));
  const [ref, setRef] = useState<Reflection | null>(null);
  const [busy, setBusy] = useState(false);
  const weeks = d?.weeks.map((w) => w.aggregate).slice(-12) ?? [];
  const latest = weeks.length ? weeks[weeks.length - 1].isoWeek : null;

  const write = async () => {
    if (!weeks.length) return;
    setBusy(true);
    const res = await router().run<{ reflection: string; open_question: string }>("D", { variant: "full", weeks }, {
      variantInput: (v) => ({ variant: v, weeks: v === "lite" ? weeks.slice(-2) : weeks }),
    });
    const variant = res.ok ? (res.ranOn === "on_device" ? "lite" : "full") : null;
    const r: Reflection = res.ok ? { ...res.value, ranOn: res.ranOn, variant } : { ...weeklyTemplate(weeks), ranOn: "template", variant: null };
    setRef(r);
    await saveReport("weekly", { reflection: r.reflection, open_question: r.open_question, isoWeek: latest }, r.ranOn, `D@${promptFor("D").version}`, r.variant);
    setBusy(false);
  };
  useEffect(() => {
    if (latest && !ref && !params.preview) void write();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest]);

  if (!d) return <Screen title="Weekly reflection">Loading…</Screen>;
  if (params.preview) return <Preview weeks={d.weeks.filter((w) => !w.uploaded).map((w) => w.aggregate)} />;
  return (
    <Screen title="Weekly reflection" back="home" badge={ref ? <ModelBadge ranOn={ref.ranOn} /> : undefined}>
      {weeks.length === 0 && <p className="muted">No finished week yet.</p>}
      {!d.settings.cloudConsent && <p className="muted">The longer reflection is written by the cloud model from your weekly summaries only. It needs your permission in Settings{cloudConfigured ? "" : " (not available in this build)"}; until then you see a plain summary.</p>}
      {ref && (
        <>
          {ref.variant === "lite" && <p className="muted">Short version, written on this device (you are offline or the cloud was not reachable).</p>}
          <p className="item-text" style={{ fontWeight: 400 }}>
            {ref.reflection}
          </p>
          <p>
            <em>{ref.open_question}</em>
          </p>
        </>
      )}
      {weeks.length > 0 && (
        <button className="secondary" disabled={busy} onClick={write}>
          {busy ? "Writing…" : "Write it again"}
        </button>
      )}
      {latest && <WeekNote isoWeek={latest} existing={weeks[weeks.length - 1].note} />}
      <h2>Your weeks</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Week</th>
              <th>Index</th>
              <th>Changed days</th>
              <th>Check-ins</th>
              <th>PHQ-9</th>
              <th>Shared</th>
            </tr>
          </thead>
          <tbody>
            {[...d.weeks].reverse().map((w) => (
              <tr key={w.isoWeek}>
                <td>{w.isoWeek}</td>
                <td>{w.aggregate.indexMean ?? "–"}</td>
                <td>{w.aggregate.daysElevated}</td>
                <td>{w.aggregate.ema.n}</td>
                <td>{w.aggregate.phq9 ?? "–"}</td>
                <td>{w.uploaded ? "yes" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Screen>
  );
}
