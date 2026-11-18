// Test stand-in for Chrome's Prompt API (globalThis.LanguageModel). Evaluation scripts only; never shipped.
window.__lmCalls = 0;
window.LanguageModel = class {
  static async availability() { return "available"; }
  static async create(opts) {
    const system = opts?.initialPrompts?.[0]?.content?.[0]?.value ?? "";
    return {
      async prompt(contents) {
        window.__lmCalls++;
        const user = contents.map(c => c.content.map(x => x.value).join("")).join("\n");
        let out = {};
        if (system.includes("opening line for a check-in")) out = { intro: "Your evenings look later than usual and you've been home more. How are you doing today?", tone: "caring" };
        else if (system.includes("early warning signs")) out = { rules: [
          { feature: "rest_midpoint", direction: "later", place_label: "", quote: "going to bed later" },
          { feature: "place_visits", direction: "lower", place_label: "gym", quote: "I skip the gym" },
          { feature: "home_stay", direction: "higher", place_label: "", quote: "I stay inside more" },
          { feature: "steps", direction: "lower", place_label: "", quote: "I stop walking my dog" }],
          personal_checkin_items: [{ question: "Did you eat well today?", quote: "I eat badly" }, { question: "Did you reply to messages today?", quote: "stop replying to messages" }],
          actions: [{ text: "Call my sister", quote: "Calling my sister helps" }, { text: "A walk in the morning", quote: "a walk in the morning" }] };
        else if (system.includes("changes someone's routine")) {
          if (user.includes("Spain")) out = { context: "holiday", start_hint: "this week", end_hint: "back on Sunday", confidence: "high", quote: "I'm in Spain this week" };
          else if (user.includes("Exam")) out = { context: "exams", start_hint: "unknown", end_hint: "unknown", confidence: "high", quote: "Exam week" };
          else out = { context: "none", start_hint: "unknown", end_hint: "unknown", confidence: "high", quote: "" };
        }
        else if (system.includes("diary text")) out = { negative_affect: 1, anhedonic_language: 0, social_withdrawal: 1, hopelessness: 0, sleep_complaint: false, themes: ["activity"], crisis: "none" };
        else if (system.includes("explain a questionnaire result")) out = { explanation: "Thank you for answering. These answers are part of your own record, and the next step is shown below." };
        else if (system.includes("spoken check-in")) { const ids = [...user.matchAll(/"item_id":"([^"]+)"/g)].map(m => m[1]); out = { answers: ids.map(id => ({ item_id: id, answer: "no", quote: user.includes("didn't eat") ? "didn't eat" : "" })).filter(a => a.quote) }; }
        else if (system.includes("things this person has said help them")) { const ids = [...user.matchAll(/"id":"([^"]+)"/g)].map(m => m[1]); out = { action_ids: ids.slice(-1) }; }
        else if (system.includes("short note summarising the texts")) out = { themes: ["activity"], note: "A quieter week. I stayed in more than I wanted to." };
        else if (system.includes("classify a question")) out = { intent: "compare", feature: "rest_midpoint", period: "last_week" };
        else if (system.includes("answer a question using only the facts")) out = { answer: "Your rest was later last week than your usual." };
        else if (system.includes("Transcribe the handwritten")) out = { text: "When it goes wrong I go to bed later and skip the gym. Calling my sister helps." };
        else if (system.includes("just wrote in a check-in")) {
          const signs = [...user.matchAll(/"id":"([^"]+)","words":"([^"]+)"/g)].map(m => ({ id: m[1], words: m[2] }));
          const text = (user.split("<user_text>")[1] || "").split("</user_text>")[0];
          const people = signs.find(x => /repl|message|people|friend/i.test(x.words));
          const q = ["avoiding people again", "Haven't answered anyone in days"].find(x => text.includes(x));
          out = { matches: people && q ? [{ sign_id: people.id, quote: q }] : [] };
        }
        else if (system.includes("write a short text message")) out = { message: user.includes("Maya") ? "Hey Maya, walk tomorrow?" : "Walk tomorrow?" };
        else if (system.includes("weekly reflection")) out = { reflection: "A quieter week than the one before.", open_question: "What made the better days different?" };
        return JSON.stringify(out);
      },
      destroy() {},
    };
  }
};
