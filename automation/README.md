# Background reviews: the Jira automation rule

The Skeptic works without this rule: **Review now** opens Rovo chat, and **Quick draft from history** writes
a draft with no AI at all. The rule adds reviews that run on their own when a plan is created or edited.

A Forge app can't install an automation rule, so the rule ships here as a file you import once.

## Import it (about three minutes)

1. Download `skeptic-review-rule.json` from this folder.
2. In Jira: **Settings (cog) → System → Global automation**, open the **⋯** menu next to **Create flow**, choose
   **Import flows**, and pick the file. The rule arrives switched off.
3. Open the rule and fix the three things that differ on every site:
   - **The Skeptic** step: choose **Connect** if asked, then pick the agent **The Skeptic** again (agent IDs are
     different on each site). Keep the prompt and leave "Let this agent take actions" off.
   - **Send web request** step: replace `https://PASTE-THE-WEB-REQUEST-URL-FROM-THE-SKEPTIC-SETTINGS-PAGE` with the
     URL from the Skeptic settings page (**Background reviews** tab). Keep `?issueKey={{issue.key}}&run=all` after it.
   - Same step: paste the secret from that page as the value of the `X-Skeptic-Secret` header (Hidden stays ticked).
4. Save, then switch the rule on. On the Skeptic settings page, switch on **The automation rule is set up**.
5. Check: open a plan and choose **Review again** (or **Review now**). The panel fills in about 30 to 60 seconds,
   and the **Health** tab shows "last review received".

If the import is refused on your site, build it by hand (below); it is four steps.

## Or build it by hand

The **Background reviews** tab of the settings page lists every step, with the prompt and body to copy. In
short: **Global automation → Create flow → Create from scratch**; trigger **Field value changed** (Labels);
**JQL condition** `labels = skeptic-review`; action **Use agent** (choose **Connect** the first time, agent
**The Skeptic**, leave "Let this agent take actions" off); action **Send web request** (POST to the settings page's URL followed by
`?issueKey={{issue.key}}&run=all`, custom body `{{agentResponse}}`, headers `Content-Type: application/json` and
`X-Skeptic-Secret` with **Hidden** ticked). Save, then switch it on.

> `skeptic-review-rule.json` was exported from the rule that ran these reviews on the test site, with that
> site's URL removed. Secrets are never in the file.
