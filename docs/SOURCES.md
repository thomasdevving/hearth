# Sources

Entries marked *(check)* were cited from memory or a secondary summary and should be
opened and confirmed before they are quoted in the submission.

## Problem and context

- **Prevalence.** World Health Organization, *Depressive disorder (depression)* fact sheet,
  29 August 2025: an estimated 5.7% of adults have depression, about 332 million people.
  https://www.who.int/news-room/fact-sheets/detail/depression
- **Lifetime prevalence.** Kessler RC, Berglund P, Demler O, et al. Lifetime prevalence and
  age-of-onset distributions of DSM-IV disorders in the National Comorbidity Survey
  Replication. *Arch Gen Psychiatry* 2005;62(6):593–602. doi:10.1001/archpsyc.62.6.593.
  Lifetime major depressive disorder in US adults: 16.6%.
- **Lifetime prevalence, cross-national.** Bromet E, Andrade LH, Hwang I, et al.
  Cross-national epidemiology of DSM-IV major depressive episode. *BMC Medicine* 2011;9:90.
  doi:10.1186/1741-7015-9-90. 18 countries, n = 89,037: 14.6% in high-income and 11.1% in
  low- and middle-income countries. https://pubmed.ncbi.nlm.nih.gov/21791035/

  Use in text: "About one in six adults in the United States, and one in seven across
  high-income countries, has a major depressive episode at some point in life."
- **Missed cases in primary care.** Arroll B, et al. Validation of PHQ-2 and PHQ-9 to
  screen for major depression in the primary care population. *Ann Fam Med* 2010.
  https://pmc.ncbi.nlm.nih.gov/articles/PMC2906530
- **Generalisation of passive detection.** Xu X, et al. GLOBEM: cross-dataset
  generalization of longitudinal human behavior modeling. *IMWUT* 2022.
  https://homes.cs.washington.edu/~althoff/docs/globem_imwut.pdf ; dataset paper:
  https://ubicomplab.cs.washington.edu/pdfs/globem_dataset.pdf
- **Commercial lessons.** STAT News, 18 April 2023, on Mindstrong and Pear.
  https://www.statnews.com/2023/04/18/mindstrong-pear-future-digital-mental-health/
- **Compliance with triggered prompts.** Bogeman et al. 2026, *Behavior Research Methods*.
  Compliance about 43% for both EMA and triggered interventions, with a wide spread; a
  physiological-stress study, so context only, not a benchmark.
  https://www.epanlab.nl/wp-content/uploads/2026/01/Bogeman_2026.pdf

## Signals

- **Mobility and phone use.** Saeb S, et al. Mobile phone sensor correlates of depressive
  symptom severity in daily-life behavior. *JMIR* 2015;17(7):e175. doi:10.2196/jmir.4273.
- **Within-person direction.** Meyerhoff J, et al. Evaluation of changes in depression,
  anxiety, and social anxiety using smartphone sensor features. *JMIR* 2021;23(9):e22844.
  doi:10.2196/22844. Changes in GPS features preceded changes in depression, not the reverse.
- **Idiographic prediction.** Individualized prediction of depression from digital
  phenotypes (medRxiv). https://medrxiv.org/content/10.1101/2022.10.12.22281007v3.full.pdf
- **Rest-activity rhythm measures.** van Someren EJW, et al. 1999 (IS, IV, RA); R package
  nparACT documentation. https://ftp.kaist.ac.kr/CRAN/web/packages/nparACT/nparACT.pdf ;
  review: https://pmc.ncbi.nlm.nih.gov/articles/PMC5389454
- **Relative amplitude and mood disorders.** Lyall LM, et al. *Lancet Psychiatry*
  2018;5:507–514, doi:10.1016/S2215-0366(18)30139-1. 91,105 UK Biobank participants; one
  quintile lower RA: lifetime MDD OR 1.06 (1.04–1.08), bipolar OR 1.11. Cross-sectional.
- **Sleep from phone use.** Ciman M, Wac K. iSenseSleep. *JMIR mHealth uHealth* 2019.
  https://www.ncbi.nlm.nih.gov/pmc/articles/PMC6547769/
- **Gait.** Zhang Y, et al. Associations between depression symptom severity and daily-life
  gait characteristics. *JMIR mHealth uHealth* 2022. https://pmc.ncbi.nlm.nih.gov/articles/PMC9579931
- **Language: level versus change.** Scalable depression monitoring with smartphone speech
  using a multimodal benchmark and topic analysis. *npj Digital Medicine* 2026;9:230.
  doi:10.1038/s41746-026-02486-9. *(check the within-person result in the full text)*
- **Absolutist words.** Al-Mosaiwi M, Johnstone T. In an absolute state. *Clinical
  Psychological Science* 2018;6(4):529–542, doi:10.1177/2167702617747074. 63 forums,
  over 6,000 contributors; correlational.
- **Language before diagnosis.** Eichstaedt JC, et al. Facebook language predicts
  depression in medical records. *PNAS* 2018;115(44):11203–11208,
  doi:10.1073/pnas.1802331115. 683 patients, 114 diagnosed; AUC 0.69, up to 3 months ahead.
- **Routine regularity from mobility.** Canzian L, Musolesi M. Trajectories of depression.
  *UbiComp* 2015 *(check)*.

- **Saeb 2015 figures.** 28 of 40 participants had enough data; circadian movement
  r = −0.63, phone usage duration r = 0.54 with PHQ-9.
- **Physical activity.** Schuch FB, et al. Physical activity and incident depression.
  *Am J Psychiatry* 2018;175:631–648. 49 cohorts, n = 266,939; adjusted OR 0.83.
  https://pubmed.ncbi.nlm.nih.gov/29690792/
- **Insomnia.** Baglioni C, et al. Insomnia as a predictor of depression. *J Affect Disord*
  2011;135:10–19. 21 studies; pooled OR 2.10 (fixed effects), 2.60 (random effects).

### Candidate signals, not implemented (Science screen, "Signals we could add next")

- **Heart rate variability.** Kemp AH, et al. *Biol Psychiatry* 2010;67:1067–1074.
  https://pubmed.ncbi.nlm.nih.gov/20138254/ Lower HRV in depression, lower with severity.
- **Resting heart rate.** Siddi S, et al. *Psychol Med* 2023;53(8):3249–3260,
  doi:10.1017/S0033291723001034. RADAR-MDD, 510 people with recurrent MDD, 2 years, Fitbit.
- **Daylight.** Burns AC, et al. *J Affect Disord* 2021;295:347–352,
  doi:10.1016/j.jad.2021.08.056 (over 400,000 UK Biobank, self-reported outdoor light);
  Burns AC, et al. *Nat Ment Health* 2023, doi:10.1038/s44220-023-00135-8 (86,772 with light
  sensors; night light higher risk, day light lower risk). Both observational.
- **Loneliness.** Mann F, et al. *Soc Psychiatry Psychiatr Epidemiol* 2022.
  https://pubmed.ncbi.nlm.nih.gov/35583561/ Pooled adjusted OR 2.33 (1.62–3.34) for new
  depression in often-lonely adults. Direction is debated.

## Questionnaires and momentary assessment

- **PHQ-2.** Manea L, et al. Identifying depression with the PHQ-2: a diagnostic
  meta-analysis. *J Affect Disord* 2016. https://pubmed.ncbi.nlm.nih.gov/27371907/
- **PHQ-9.** Levis B, Benedetti A, Thombs BD. Accuracy of PHQ-9 for screening to detect
  major depression: individual participant data meta-analysis. *BMJ* 2019;365:l1476.
  58 studies, 17,357 participants in total; sensitivity 0.88 and specificity 0.85 at ≥10
  against semi-structured interviews. https://pubmed.ncbi.nlm.nih.gov/30967483/
- **PHQ-9 change.** Löwe B, et al. Monitoring depression treatment outcomes with the PHQ-9.
  *Med Care* 2004;42(12):1194–1201 (5 points as a meaningful change) *(check)*.
- **PHQ item 9 and safety.** https://cdn.mdedge.com/files/s3fs-public/JFP06811505.PDF
- **Official PHQ texts.** https://www.phqscreeners.com
- **ESM items.** ESM Item Repository https://osf.io/kg376 ; Eisele G, et al. ESM-Q, 2025.
  https://researchonline.ljmu.ac.uk/id/eprint/26046/
- **Timing of prompts.** GLOSS, arXiv 2507.05461. https://arxiv.org/pdf/2507.05461

## Theory

*(All from general knowledge; check before citing.)*

- **Social zeitgeber theory.** Ehlers CL, Frank E, Kupfer DJ. *Arch Gen Psychiatry* 1988.
  Why rhythm disruption matters.
- **Behavioural activation.** Lewinsohn 1974; Jacobson NS, et al. 2001. Why withdrawal and
  inactivity matter, and why the user's own actions are shown back.
- **Just-in-time adaptive interventions.** Nahum-Shani I, et al. *Ann Behav Med* 2018.
- **Micro-randomised trials.** Klasnja P, et al. *Health Psychology* 2015. Basis of the
  random check-ins and the self-audit.
- **Relapse signature.** Birchwood M, et al. 1989. The idea of a personal pattern of early signs.
- **Reliable change.** Jacobson NS, Truax P. *J Consult Clin Psychol* 1991.
- **Recurrence.** Burcusa SL, Iacono WG. Risk for recurrence in depression. *Clin Psychol
  Rev* 2007.

## Platform

See `docs/PLATFORM_NOTES.md`. Primary pages to read in milestone M0:
- https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
- https://firebase.google.com/docs/ai-logic/hybrid/ios/get-started
- https://firebase.google.com/support/release-notes/ios
- https://firebasehybridaihackathon.devpost.com/
- https://support.google.com/googleplay/android-developer/answer/10208820 (call-log and SMS policy)
- https://developer.apple.com/videos/play/wwdc2024/10109/ (wellbeing APIs in HealthKit)
