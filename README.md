# The Skeptic

**A Rovo agent and Forge app that argues against your plan using your organisation's own history, and holds the plan at the gate until the answers hold up.**

Built for Atlassian Codegeist 2026.

Every company relearns the same lessons. The live chat that failed because nobody staffed the evenings comes back two years later under a new product manager, and the retro that explained why is buried in Confluence. The Skeptic reads that history before you commit. It finds the abandoned epic, the decision record, the incident and the open risk. It objects with a citation for every point and says what would change its mind. Then it makes sure the objection is answered with substance before the plan can start.

## What it does

- **Reviews plans on its own.** When an epic (or any epic-level plan type) is created or its text changes, a free, deterministic radar checks it against an index of the organisation's history. If it finds evidence-backed concerns, Jira automation runs the Skeptic three times, independently, in the background. The review appears in the issue panel with live progress.
- **Cites everything.** Each objection quotes one past plan, incident, risk, Confluence page or earlier Skeptic verdict. Code drops any objection whose source was not in the evidence, whose claim does not match its source, or whose numbers the source does not contain.
- **Severity is computed, not guessed.** The agent scores impact, likelihood, reversibility and existing mitigation. Code combines those with the age of the evidence and what the Skeptic has learned, and rates each objection low, medium, high or critical.
- **Three independent passes, majority vote.** An objection survives only if most passes raise it. A lone objection becomes a "worth asking" question instead.
- **An advocate pass.** If the plan already deals with an objection, and the quoted sentence really is in the plan, the objection moves to "already covered".
- **Exact rules.** Freeze windows, open blockers and overloaded owners are checked by code.
- **A layered gate.** Answers are graded, and empty or generic ones get one rebuttal. A second weak answer escalates the objection. What an objection needs depends on its severity:
  - **Low:** the author resolves it.
  - **Medium:** proof is needed: linked evidence, a mitigation task with an owner and due date, a plan change, or the sentence in the plan that already covers it.
  - **High and critical:** accepting the risk needs sign-off from a named approver who is not the plan's author.

  A Jira workflow validator enforces all of this, so nobody can drag the plan past it. The gate is advisory while the plan is in To Do and binding when it starts.
- **A risk ledger that remembers.** It records who accepted which risk, when, and who signed it off. When a new incident matches an accepted risk, the Skeptic flags it, and its track record learns from it.
- **Never an empty panel.** Code picks the strongest precedents and the sentence in each that says why it ended. The agent gets them as candidates to confirm or reject. With no AI at all, the same candidates make a labelled draft review in seconds: on the 40-plan evaluation set, drafts alone reach about 89% precision and 94% recall. If an automation run never replies, a draft is saved instead of a spinner.
- **Seen where people look.** A status line in the work item sidebar ("2 blocking · 3 open"), a live open count on the Confluence byline, one-click answers on every objection card, the source's own words under each claim, comments laid out as a coloured panel with a table, and a gate message that names what blocks the plan.
- **Works on any site.** It detects plan and incident issue types (including Jira Service Management's), works without Confluence, and is honest on near-empty sites. Synonyms link different words for the same idea ("on premise" and "self-hosted"), and text in any language is indexed. It re-reviews only the sections that changed. The tests run a second, differently shaped site to prove it.
- **Easy to set up and to trust.** A setup checklist, a fast automation setup (one agent step and one web request), a health tab with the last errors, job retries and review timings, "Measure precision" from the admin page, and a nightly index check.
- **Private by design.** Evidence is always re-read with the asking person's permissions, and every review is re-checked against the viewer's: an objection citing an item you can't see is shown redacted, keeping its severity. Background comments give counts only, and review comments name sources only within the plan's own project. All AI runs through Rovo; nothing leaves Atlassian.
- **Ready for coding agents.** The Skeptic's MCP tools include `gate-status` ("can this plan start?") and `respond-to-objection`.

## The numbers on the dashboard

1. **Review ready time:** the median time from request to saved review.
2. **Author time:** the median time an author spends responding.
3. **Measured precision:** measured on a labelled set of 40 plans ([`eval/`](eval/)), from the admin page or a script, and live, from how teams actually resolved objections.

## Try it (for judges)

1. **Install** the Skeptic from the installation link, on Jira (and on Confluence for the demo companies that use it).
2. **Load a demo company.** Create an empty Jira project with the suggested key and, for companies with Confluence, an
   empty space. Open **Apps → Manage apps → The Skeptic settings → Demo data**, choose a company and select **Load**.
   After about five minutes the tab lists its three demo plans. Each company has years of history (2021 to 2026, over
   100 work items: epics with their tasks, incidents and open risks), and its three plans are made for judging: one that
   **several** history items argue against, one that **a single** item argues against, and one **nothing** should object to.

   | Company | Shape | Several items against | One item against | Nothing against |
   |---|---|---|---|---|
   | **Kestrel Freight** (`KF`) | logistics; Epics, Bugs, Confluence | Add live chat to the mobile app | Voice booking for pickups through smart speakers | Night-time colour scheme for the driver app |
   | **Pinecrest Apps** (`PA`) | notes app; Initiatives, Incidents, no Confluence | Work offline on mobile and sync when back online | On-premise version for banks (matched in different words) | Keyboard shortcuts cheat sheet |
   | **Harbour & Vine** (`HV`) | restaurants; Epics, Bugs, Confluence | Self-order tablets at every table | Open a delivery-only kitchen brand for late-night orders | Allergen icons on the printed menus |
   | **Brightwell Learning** (`BL`) | online courses; Epics, Bugs, Confluence | Webcam proctoring for online exams | SMS reminders before every live lecture | Bookmarks inside lecture videos |
   | **Sunfield Energy** (`SE`) | pay-as-you-go solar; Initiatives, Incidents, no Confluence | Let customers pay their monthly bill with airtime | Solar water pumps for farmers | Referral bonus for customers who bring a neighbour |

   All five can sit on one site: each plan is argued against only with its own company's history.
3. **Review a plan.** Open a demo plan and the **Skeptic** panel. **Review now** asks the Skeptic agent in Rovo chat;
   **Quick draft from history** needs no AI. Answer an objection, then try moving the plan to In Progress.
4. **Optional:** background reviews with the automation rule in [`automation/`](automation/), and the workflow validator
   *Skeptic objections resolved* on the transition out of To Do.

Rovo must be on for the site to use the agent. Everything else, including drafts, the gate and the dashboard, works
without it.

## Run it (for developers)

```
npm install
npm test          # 549 checks in six suites, no Atlassian site needed
forge deploy
forge install --upgrade   # Jira, then Confluence
```

To release: `forge deploy -e production`, then in the developer console open **Distribution**, set it to **Sharing**,
and copy the installation link. Demo history can also be loaded from a script: `npm run seed` (Kestrel Freight), or
with `$env:SKEPTIC_DEMO="pinecrest"` for Pinecrest Apps.

## Layout

| Path | What it is |
| --- | --- |
| `src/index.js` | Every Forge entry point: Rovo actions, UI resolvers, gate, events, queue, web trigger |
| `src/lib/hindex.js` | The history index (inverted index in Forge KVS, race-free postings) |
| `src/lib/evidence.js` | Index-first evidence search with live fallback and permission re-check |
| `src/lib/pipeline.js` | Citation check, advocate pass, assumption grounding, majority vote |
| `src/lib/severity.js` | Severity from factors, recency and learned weights |
| `src/lib/rules.js` | Freeze windows, blockers, owner load |
| `src/lib/responses.js` | The layered gate: proof types, grading, approvals, overrides |
| `src/lib/grading.js` | The answer grader and rebuttals |
| `src/lib/ledger.js` | Risk ledger and incident matching |
| `src/lib/jobs.js` | Queue jobs: backfill, background pre-review, incidents, timeouts |
| `src/lib/profile.js` | Site profile: plan types, incident types, Confluence, history density |
| `src/lib/candidates.js` | Candidate objections for the agent, and drafts written without AI |
| `src/lib/privacy.js` | Per-viewer redaction of reviews |
| `src/lib/health.js` | Errors, last-seen markers and job counters for the health tab |
| `src/lib/evaluation.js` | Scoring against the labelled set (shared by the app, the script and the tests) |
| `src/prompts/skeptic.md` | The agent's instructions |
| `src/frontend/` | Issue panel, sidebar glance, Confluence byline, dashboard, admin page (UI Kit) |
| `eval/` | 40 labelled plans, live seeding and scoring |
| `src/lib/demo/` | The five demo companies and the in-app loader |
| `automation/` | The Jira automation rule for background reviews, and how to import it |
| `seed/` | Scripts that load the demo companies from your computer |
| `test/` | A fake Atlassian site that behaves like real Jira (strict JQL, permissions); `sim` end-to-end, `ui` screen journeys, `stress` robustness and scale, `features` the newer features, `second-site` a different site, `demo-load` all five demo companies and their judge plans on an empty site |

## Privacy and terms

The Skeptic keeps everything in your site's Forge storage and uses only Rovo for AI. See [PRIVACY.md](PRIVACY.md) and [TERMS.md](TERMS.md). Licensed under MIT ([LICENSE](LICENSE)).
