import type { ComponentType } from "react";
import { Home } from "./Home";
import { Trends } from "./Trends";
import { Ledger } from "./Ledger";
import { Settings } from "./Settings";
import { Screen } from "../ui/kit";

function Placeholder({ title }: { title: string }) {
  return (
    <Screen title={title} back="home">
      <p className="muted">This screen comes in a later milestone.</p>
    </Screen>
  );
}
const ph = (t: string) => () => <Placeholder title={t} />;

export const SCREENS: Record<string, ComponentType<{ params: Record<string, string> }>> = {
  home: Home,
  trends: Trends,
  onboarding: ph("Welcome"),
  plan_setup: ph("Your plan"),
  baseline_phq: ph("First questionnaire"),
  checkin: ph("Check-in"),
  context_confirm: ph("Confirm"),
  questionnaire: ph("Questionnaire"),
  result: ph("Result"),
  my_plan: ph("Your plan"),
  safety: ph("Support"),
  audit: ph("Is this working for you?"),
  ledger: Ledger,
  weekly: ph("Weekly reflection"),
  share: ph("Share with your clinician"),
  settings: Settings,
  report: ph("Report"),
};
