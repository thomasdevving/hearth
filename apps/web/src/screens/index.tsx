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
import { Weekly } from "./Weekly";
import { Share } from "./Share";
import { Report } from "./Report";
import { EvalG } from "./EvalG";
import { HelpedNew } from "./HelpedNew";
import { People } from "./People";

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
  weekly: Weekly,
  share: Share,
  settings: Settings,
  report: Report,
  eval_g: EvalG,
  helped_new: HelpedNew,
  people: People,
};
