import type { ComponentType } from "react";
import { Home } from "./Home";
import { Trends } from "./Trends";
import { Ledger } from "./Ledger";
import { Settings } from "./Settings";
import { Onboarding } from "./Onboarding";
import { PlanSetup } from "./PlanSetup";
import { BaselinePhq, Questionnaire } from "./Questionnaire";
import { Result } from "./Result";
import { Checkin } from "./Checkin";
import { ContextConfirm } from "./ContextConfirm";
import { MyPlan } from "./MyPlan";
import { Safety } from "./Safety";
import { Audit } from "./Audit";
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
  onboarding: Onboarding,
  plan_setup: PlanSetup,
  baseline_phq: BaselinePhq,
  checkin: Checkin,
  context_confirm: ContextConfirm,
  questionnaire: Questionnaire,
  result: Result,
  my_plan: MyPlan,
  safety: Safety,
  audit: Audit,
  ledger: Ledger,
  weekly: ph("Weekly reflection"),
  share: ph("Share with your clinician"),
  settings: Settings,
  report: ph("Report"),
};
