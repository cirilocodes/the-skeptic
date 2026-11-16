// Jira admin page: the only place the Skeptic's settings can be changed.
// Works out of the box: plan types, incident types and Confluence are detected, so most sites only need
// the automation rule (for background reviews) and, optionally, freeze windows and approvers.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  ButtonGroup,
  Code,
  CodeBlock,
  DynamicTable,
  Em,
  Heading,
  Inline,
  Label,
  Link,
  Lozenge,
  ProgressBar,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Strong,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
  TextArea,
  Textfield,
  Toggle,
  User,
  UserPicker,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';

const card = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius.200',
  padding: 'space.200',
});
const SEVERITIES = ['low', 'medium', 'high', 'critical'].map((s) => ({ label: s, value: s }));
const val = (e) => (e && e.target ? e.target.value : e);
const list = (v) => (Array.isArray(v) ? v.join(', ') : v || '');

function Setting({ id, label, help, checked, onChange }) {
  return (
    <Inline space="space.150" alignBlock="start">
      <Toggle id={id} isChecked={!!checked} onChange={() => onChange(!checked)} />
      <Stack space="space.025">
        <Label labelFor={id}>{label}</Label>
        <Text>{help}</Text>
      </Stack>
    </Inline>
  );
}

function Field({ id, label, help, value, onChange, placeholder }) {
  return (
    <Stack space="space.050">
      <Label labelFor={id}>{label}</Label>
      <Textfield id={id} value={value ?? ''} placeholder={placeholder} onChange={(e) => onChange(val(e))} />
      {help ? <Text>{help}</Text> : null}
    </Stack>
  );
}

function Choose({ id, label, help, options, value, onChange, isMulti }) {
  const selected = isMulti ? options.filter((o) => (value || []).includes(o.value)) : options.find((o) => o.value === value);
  return (
    <Stack space="space.050">
      <Label labelFor={id}>{label}</Label>
      <Select
        inputId={id}
        options={options}
        value={selected}
        isMulti={!!isMulti}
        onChange={(o) => onChange(isMulti ? (o || []).map((x) => x.value) : o?.value)}
      />
      {help ? <Text>{help}</Text> : null}
    </Stack>
  );
}

const ms = (v) => (v === null || v === undefined ? '—' : v >= 90000 ? `${Math.round(v / 60000)} min` : `${Math.max(1, Math.round(v / 1000))} s`);

// Setup at a glance: what is done, and the next thing to do for each item that is not.
function Checklist({ items }) {
  const required = items.filter((i) => !i.optional);
  const ready = required.every((i) => i.done);
  return (
    <Box xcss={card}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center">
          <Heading size="xsmall">Setup</Heading>
          <Lozenge appearance={ready ? 'success' : 'inprogress'}>{ready ? 'ready to use' : 'getting ready'}</Lozenge>
          <Text>{`${items.filter((i) => i.done).length} of ${items.length} done`}</Text>
        </Inline>
        {items.map((i) => (
          <Inline key={i.id} space="space.100" alignBlock="center" shouldWrap>
            <Lozenge appearance={i.done ? 'success' : i.optional ? 'default' : 'inprogress'}>{i.done ? 'done' : i.optional ? 'optional' : 'to do'}</Lozenge>
            <Text>
              <Strong>{i.label}</Strong>
              {` · ${i.detail}`}
            </Text>
          </Inline>
        ))}
      </Stack>
    </Box>
  );
}

function Health({ health, busy, onClear }) {
  const seen = health.seen || {};
  const rows = (health.errors || []).map((e, i) => ({
    key: `e${i}`,
    cells: [
      { key: 'at', content: String(e.at).slice(0, 16).replace('T', ' ') },
      { key: 'where', content: e.where },
      { key: 'code', content: e.code },
      { key: 'message', content: e.message },
    ],
  }));
  const t = health.timing || {};
  const stageNames = { queued: 'Queued', history: 'History search', rules: 'Rules', agent: 'Agent', verify: 'Checks' };
  return (
    <Stack space="space.200">
      <Inline space="space.200" shouldWrap>
        {[
          ['Automation rule', seen.intake],
          ['Workflow validator', seen.gate],
          ['Daily sweep', seen.sweep],
        ].map(([label, s]) => (
          <Box key={label} xcss={card}>
            <Stack space="space.050">
              <Strong>{label}</Strong>
              <Text>{s ? `last seen ${s.ago}` : 'not seen yet'}</Text>
            </Stack>
          </Box>
        ))}
        <Box xcss={card}>
          <Stack space="space.050">
            <Strong>Background jobs</Strong>
            <Text>{`${health.jobs?.done || 0} done · ${health.jobs?.retried || 0} retried · ${health.jobs?.failed || 0} failed`}</Text>
          </Stack>
        </Box>
      </Inline>
      <Heading size="xsmall">Time to a review</Heading>
      <Text>
        {[
          t.automation ? `background: median ${ms(t.automation.p50)}, slowest 10% over ${ms(t.automation.p90)} (${t.automation.n} reviews)` : '',
          t.chat ? `chat: median ${ms(t.chat.p50)} (${t.chat.n})` : '',
          t.draft ? `drafts: median ${ms(t.draft.p50)} (${t.draft.n})` : '',
        ]
          .filter(Boolean)
          .join(' · ') || 'No reviews yet.'}
      </Text>
      {Object.keys(health.stages || {}).length ? (
        <Text>{`Median per stage: ${Object.entries(health.stages).map(([k, v]) => `${stageNames[k] || k} ${ms(v)}`).join(', ')}.`}</Text>
      ) : null}
      <Inline space="space.100" alignBlock="center">
        <Heading size="xsmall">Recent errors</Heading>
        {rows.length ? (
          <Button appearance="subtle" spacing="compact" isDisabled={busy} onClick={onClear}>
            Clear the list
          </Button>
        ) : null}
      </Inline>
      {rows.length ? (
        <DynamicTable
          head={{ cells: [{ key: 'at', content: 'When (UTC)' }, { key: 'where', content: 'Where' }, { key: 'code', content: 'Code' }, { key: 'message', content: 'What happened' }] }}
          rows={rows}
        />
      ) : (
        <Text>No errors recorded.</Text>
      )}
    </Stack>
  );
}

const DEMO_INFO = {
  kestrel: {
    name: 'Kestrel Freight',
    key: 'KF',
    about: 'A logistics company, 2021 to 2026: 127 work items (epics and their tasks, incidents as bugs, open risks) and 21 Confluence pages with retros and decision records.',
    plans: { livechat: 'several items argue against it (the abandoned live chat, its incident, risk and decision)', voice: 'one item argues against it (the abandoned voice ordering)', honesty: 'nothing should object to it' },
    confluence: true,
  },
  pinecrest: {
    name: 'Pinecrest Apps',
    key: 'PA',
    about: 'A notes-app software company with no Confluence, 2021 to 2026: 105 work items with Initiatives, an Incident type and open risks.',
    plans: { offline: 'several items argue against it (offline editing, its sync incident and an open risk)', onprem: 'one item argues against it, in different words (the self-hosted edition)', honest: 'nothing should object to it' },
    confluence: false,
  },
  harbourvine: {
    name: 'Harbour & Vine',
    key: 'HV',
    about: 'A group of six restaurants, 2021 to 2026: 106 work items with epics, bugs and risks, and 11 Confluence pages.',
    plans: { tablets: 'several items argue against it (the tablet pilot, its outage, the Wi-Fi risk and a decision)', nightbowl: 'one item argues against it (the abandoned delivery-only brand)', allergens: 'nothing should object to it' },
    confluence: true,
  },
  brightwell: {
    name: 'Brightwell Learning',
    key: 'BL',
    about: 'An online learning platform for universities, 2021 to 2026: 105 work items with epics, bugs and risks, and 10 Confluence pages.',
    plans: { proctoring: 'several items argue against it (the proctoring pilot, its false flags, a data risk and a decision)', reminders: 'one item argues against it (the 3 am reminder incident)', bookmarks: 'nothing should object to it' },
    confluence: true,
  },
  sunfield: {
    name: 'Sunfield Energy',
    key: 'SE',
    about: 'A pay-as-you-go solar company with no Confluence, 2021 to 2026: 106 work items with Initiatives, an Incident type and open risks.',
    plans: { airtime: 'several items argue against it (the airtime pilot, its incident and the telco risk)', pumps: 'one item argues against it (the abandoned water pumps)', referral: 'nothing should object to it' },
    confluence: false,
  },
};

// Load a demo company so the Skeptic has history to work with: the quickest way to try it on a new site.
function DemoData({ data, busy, run, setData, setMsg }) {
  const [company, setCompany] = useState('kestrel');
  const [project, setProject] = useState('');
  const [space, setSpace] = useState('');
  const info = DEMO_INFO[company];
  const status = data.demo?.[company];
  return (
    <Stack space="space.200">
      <Text>
        Try the Skeptic on a fictional company's history. There are five, each with years of work and three demo plans to review. Create an empty Jira
        project for it first (any template; the suggested key is shown), and for companies with Confluence an empty space. Loading takes about five minutes
        and is safe to repeat.
      </Text>
      <Stack space="space.050">
        <Label labelFor="demoCompany">Demo company</Label>
        <Select
          inputId="demoCompany"
          options={Object.entries(DEMO_INFO).map(([value, d]) => ({ label: d.name, value }))}
          value={{ label: info.name, value: company }}
          onChange={(o) => setCompany(o?.value || 'kestrel')}
        />
        <Text>{info.about}</Text>
      </Stack>
      <Inline space="space.200" shouldWrap alignBlock="end">
        <Field id="demoProject" label="Jira project key" value={project} onChange={setProject} placeholder={`e.g. ${info.key}`} />
        {info.confluence ? <Field id="demoSpace" label="Confluence space key" value={space} onChange={setSpace} placeholder={`e.g. ${info.key}`} /> : null}
      </Inline>
      <ButtonGroup>
        <Button
          appearance="primary"
          isDisabled={busy || status?.state === 'running'}
          onClick={() =>
            run('loadDemo', { company, projectKey: project, spaceKey: space }, (r) => {
              setData({ ...data, demo: { ...(data.demo || {}), [company]: r.status } });
              setMsg(r.message);
            })
          }
        >
          {`Load ${info.name}`}
        </Button>
        <Button appearance="subtle" isDisabled={busy} onClick={() => run('getDemo', {}, (d) => setData({ ...data, demo: d }))}>
          Check progress
        </Button>
      </ButtonGroup>
      {status ? (
        <Box xcss={card}>
          <Stack space="space.075">
            <Inline space="space.100" alignBlock="center">
              <Strong>{info.name}</Strong>
              <Lozenge appearance={status.state === 'done' ? 'success' : status.state === 'failed' ? 'removed' : 'inprogress'}>{status.state}</Lozenge>
              <Text>{status.state === 'done' ? `${status.created || 0} items created, ${status.existing || 0} already there, ${status.pages || 0} pages` : status.step || ''}</Text>
            </Inline>
            {status.error ? <Text>{status.error}</Text> : null}
            {status.state === 'done'
              ? Object.entries(status.plans || {}).map(([k, key]) => (
                  <Text key={k}>
                    <Link href={`${data.siteUrl}/browse/${key}`} openNewTab>
                      {key}
                    </Link>
                    {` ${info.plans[k] || ''}. Open it and choose Review now in the Skeptic panel.`}
                  </Text>
                ))
              : null}
          </Stack>
        </Box>
      ) : null}
    </Stack>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [evalProject, setEvalProject] = useState('');

  useEffect(() => {
    invoke('getAdmin')
      .then((d) => {
        setData(d);
        setEvalProject((d.settings.projectKeys || [])[0] || '');
        setDraft({ ...d.settings, freezeText: (d.settings.freezeWindows || []).map((w) => `${w.name}: ${w.start} to ${w.end}`).join('\n') });
      })
      .catch((e) => setError(e.message));
  }, []);

  const run = async (fn, payload, after) => {
    setBusy(true);
    setMsg('');
    setError('');
    try {
      after(await invoke(fn, payload));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (error && !data)
    return (
      <SectionMessage appearance="error">
        <Text>{error}</Text>
      </SectionMessage>
    );
  if (!data || !draft) return <Spinner label="Loading settings" />;

  const set = (k) => (v) => setDraft({ ...draft, [k]: v });
  const save = () =>
    run('saveAdmin', { ...draft, freezeWindows: draft.freezeText }, (r) => {
      setDraft({ ...r.settings, freezeText: (r.settings.freezeWindows || []).map((w) => `${w.name}: ${w.start} to ${w.end}`).join('\n') });
      setMsg(['Settings saved.', ...(r.warnings || [])].join(' '));
    });
  const typeOptions = (data.profile?.issueTypes || []).map((t) => ({ label: t.name, value: t.name }));
  const p = data.profile || {};
  const idx = data.index || {};

  const SaveBar = (
    <ButtonGroup>
      <Button appearance="primary" isDisabled={busy} onClick={save}>
        Save settings
      </Button>
    </ButtonGroup>
  );

  return (
    <Stack space="space.200">
      {msg ? (
        <SectionMessage appearance="success">
          <Text>{msg}</Text>
        </SectionMessage>
      ) : null}
      {error ? (
        <SectionMessage appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      <Box xcss={card}>
        <Inline space="space.200" alignBlock="center" shouldWrap>
          <Text>
            <Strong>Site: </Strong>
            {`plans are ${(p.planTypes || []).join(', ') || 'not detected'}; incidents are ${(p.incidentTypes || []).join(', ') || 'not detected'}; Confluence ${p.confluence ? 'available' : 'not available'}.`}
          </Text>
          <Lozenge appearance={p.density === 'normal' ? 'success' : 'moved'}>{`history: ${p.density || 'unknown'}`}</Lozenge>
          <Lozenge appearance={idx.state === 'ready' ? 'success' : 'inprogress'}>{`index: ${idx.state || 'empty'} (${idx.docs || 0})`}</Lozenge>
          <Lozenge appearance={draft.automationReady ? 'success' : 'default'}>{draft.automationReady ? 'background reviews on' : 'background reviews off'}</Lozenge>
        </Inline>
      </Box>

      {data.checklist ? <Checklist items={data.checklist} /> : null}

      <Tabs id="skeptic-admin-tabs">
        <TabList>
          <Tab>Background reviews</Tab>
          <Tab>Scope and sources</Tab>
          <Tab>Gate and approvals</Tab>
          <Tab>Notifications</Tab>
          <Tab>Index and evaluation</Tab>
          <Tab>Health</Tab>
          <Tab>Demo data</Tab>
        </TabList>

        <TabPanel>
          <Stack space="space.200">
            <Text>
              The radar checks every new or edited plan for free. When it finds evidence-backed concerns, it asks an automation rule for a full
              review, so nobody has to open chat. Set the rule up once; it takes about five minutes.
            </Text>
            <Choose
              id="mode"
              label="Setup"
              help={data.rule?.fast ? 'Fast: one agent step writes all three passes in one reply. Two actions in the rule.' : 'Thorough: three separate agent steps, one per pass, for the most independent results. Six actions in the rule.'}
              options={[
                { label: 'Fast (recommended)', value: 'fast' },
                { label: 'Thorough', value: 'thorough' },
              ]}
              value={draft.setupMode}
              onChange={(v) => {
                // Saves only the setup mode (other unsaved edits stay as drafts), then shows the matching steps.
                set('setupMode')(v);
                run('saveAdmin', { setupMode: v }, () => invoke('getAdmin').then((d) => setData(d)));
              }}
            />
            <Text>
              <Strong>1.</Strong> Jira settings (the cog) → System → Global automation → Create flow → Create from scratch. Trigger: <Strong>Field value changed</Strong>, field{' '}
              <Strong>Labels</Strong>. Condition: <Strong>JQL condition</Strong> <Code>{`labels = ${data.label}`}</Code>.
            </Text>
            {(data.rule?.pairs || []).map((pair, i) => (
              <Stack key={`run${i}`} space="space.075">
                <Text>
                  <Strong>{`${2 + i * 2}.`}</Strong> Action <Strong>Use agent</Strong> (choose Connect the first time), agent <Strong>The Skeptic</Strong>, prompt. Leave "Let this agent take actions" off:
                </Text>
                <CodeBlock language="text" text={pair.prompt} />
                <Text>
                  <Strong>{`${3 + i * 2}.`}</Strong> Action <Strong>Send web request</Strong>: POST to this URL, headers <Code>X-Skeptic-Secret</Code> (the
                  secret below, with Hidden ticked) and <Code>Content-Type: application/json</Code>, custom body <Code>{pair.body}</Code>:
                </Text>
                <CodeBlock language="text" text={`${data.intakeUrl}${pair.query || ''}`} />
              </Stack>
            ))}
            <Inline space="space.100" alignBlock="center" shouldWrap>
              <Text>
                <Strong>Secret: </Strong>
              </Text>
              {showSecret ? <Code>{data.secret}</Code> : <Text>••••••••</Text>}
              <Button appearance="subtle" spacing="compact" onClick={() => setShowSecret(!showSecret)}>
                {showSecret ? 'Hide' : 'Show'}
              </Button>
              <Button
                appearance="warning"
                spacing="compact"
                isDisabled={busy}
                onClick={() =>
                  run('rotateSecret', {}, (r) => {
                    setData({ ...data, secret: r.secret });
                    setMsg('New secret created. Update the X-Skeptic-Secret header in the rule.');
                  })
                }
              >
                New secret
              </Button>
            </Inline>
            <Text>
              <Strong>{`${2 + (data.rule?.pairs || []).length * 2}.`}</Strong> Turn the rule on, then switch on <Em>The automation rule is set up</Em> below. The
              Health tab shows when the first review arrives.
            </Text>
            {data.health?.seen?.intake ? (
              <SectionMessage appearance="success" title="The rule is working">
                <Text>{`Last review received ${data.health.seen.intake.ago}.`}</Text>
              </SectionMessage>
            ) : null}
            {(() => {
              // Only a refusal newer than the last review received is news.
              const refused = (data.health?.errors || []).find((e) => e.where === 'intake');
              const lastOk = data.health?.seen?.intake?.at;
              return refused && (!lastOk || String(refused.at) > String(lastOk)) ? (
                <SectionMessage appearance="warning" title="The last web request was refused">
                  <Text>{refused.message}</Text>
                </SectionMessage>
              ) : null;
            })()}
            <Setting id="ready" label="The automation rule is set up" help="Background reviews start on their own, and the panel's Review now button runs one without opening chat." checked={draft.automationReady} onChange={set('automationReady')} />
            <Setting id="auto" label="Review plans in the background" help="Ask for a full review when a plan is created or its text changes, if the radar found evidence-backed concerns." checked={draft.autoReview} onChange={set('autoReview')} />
            {draft.setupMode === 'thorough' ? (
            <Choose
              id="runs"
              label="Independent runs per review"
              help="Three is the default: objections most runs agree on are kept; a lone objection becomes a question. Fewer runs is faster but less reliable."
              options={[1, 2, 3].map((n) => ({ label: String(n), value: n }))}
              value={draft.automationRuns}
              onChange={set('automationRuns')}
            />
            ) : null}
            <Setting id="draftFallback" label="Draft from history if no reply arrives" help="If the agent has not replied after 15 minutes, write a labelled draft from the strongest precedents (no AI) instead of showing nothing." checked={draft.draftFallback} onChange={set('draftFallback')} />
            <Setting id="demo" label="Guided tour in the panel" help="Show a step-by-step banner on each plan: review, answer, record the decision, move on. Useful for demos and first weeks." checked={draft.demoMode} onChange={set('demoMode')} />
            {SaveBar}
          </Stack>
        </TabPanel>

        <TabPanel>
          <Stack space="space.200">
            <Choose id="types" label="Plan issue types" help={`Reviewed and gated. Leave empty to use what was detected: ${(p.planTypes || []).join(', ') || 'none'}.`} options={typeOptions} value={draft.planIssueTypes} onChange={set('planIssueTypes')} isMulti />
            <Field id="projects" label="Projects (keys, comma separated)" help="Leave empty for every project." value={list(draft.projectKeys)} onChange={set('projectKeys')} placeholder="e.g. KF, OPS" />
            <Choose id="incidents" label="Incident issue types" help={`Matched against accepted risks. Leave empty for: ${(p.incidentTypes || []).join(', ') || 'none detected'}.`} options={typeOptions} value={draft.incidentTypes} onChange={set('incidentTypes')} isMulti />
            <Field id="risk" label="Extra JQL for open risks" help="Added to labels risk/risks (and the Risk issue type if your site has one). If it is invalid, the default is used." value={draft.riskJql} onChange={set('riskJql')} placeholder='e.g. project = RISK OR labels = "raid-risk"' />
            <Field id="abandon" label="Labels that mean abandoned" value={list(draft.abandonedLabels)} onChange={set('abandonedLabels')} />
            <Field id="proposal" label="Confluence label for proposals" value={draft.proposalLabel} onChange={set('proposalLabel')} />
            <Setting id="radar" label="Radar" help="Check new and edited plans automatically. Deterministic, no AI cost." checked={draft.radarEnabled} onChange={set('radarEnabled')} />
            <Setting id="comments" label="Radar comments" help="Post a short heads-up (counts only, never titles) when the radar rates a plan high." checked={draft.radarComments} onChange={set('radarComments')} />
            <Setting id="sweep" label="Daily sweep" help="Re-check plans, look for new evidence, remind approvers and write the digest." checked={draft.sweepEnabled} onChange={set('sweepEnabled')} />
            {SaveBar}
          </Stack>
        </TabPanel>

        <TabPanel>
          <Stack space="space.200">
            <Text>
              Severity decides what an objection needs: <Strong>low</Strong> any answer that passes the check; <Strong>medium</Strong> proof, and accepting the risk
              needs a mitigation task; <Strong>high</Strong> and <Strong>critical</Strong> also need a named approver for "not relevant" or "accept the risk".
              Add the validator <Em>Skeptic objections resolved</Em> to the transition out of To Do in your workflow.
            </Text>
            <Choose id="min" label="Objections that block the gate" help="At or above this severity. Lower ones are shown but never block." options={SEVERITIES} value={draft.gateMinSeverity} onChange={set('gateMinSeverity')} />
            <Setting id="require" label="Require a review when the radar says high" help="Hold a high-radar plan in To Do until a review exists." checked={draft.requireReviewOnHigh} onChange={set('requireReviewOnHigh')} />
            <Stack space="space.075">
              <Text>
                <Strong>Approvers for high and critical risks</Strong>
              </Text>
              <Text>Leave empty to let anyone except the plan's author approve.</Text>
              <Inline space="space.100" shouldWrap alignBlock="center">
                {(draft.approvers || []).map((id) => (
                  <Inline key={id} space="space.050" alignBlock="center">
                    <User accountId={id} />
                    <Button appearance="subtle" spacing="compact" onClick={() => set('approvers')((draft.approvers || []).filter((x) => x !== id))}>
                      Remove
                    </Button>
                  </Inline>
                ))}
              </Inline>
              <UserPicker
                label="Add an approver"
                name="approvers"
                onChange={(u) => {
                  const id = u?.id || u?.accountId;
                  if (id && !(draft.approvers || []).includes(id)) set('approvers')([...(draft.approvers || []), id]);
                }}
              />
            </Stack>
            <Stack space="space.075">
              <Text>
                <Strong>Backup approver: </Strong>
              </Text>
              {draft.backupApprover ? <User accountId={draft.backupApprover} /> : <Text>the project lead</Text>}
              <UserPicker label="Choose a backup approver" name="backup" onChange={(u) => set('backupApprover')(u?.id || u?.accountId || '')} />
            </Stack>
            <Field id="remind" label="Remind the approver after (hours)" value={String(draft.reminderHours)} onChange={set('reminderHours')} />
            <Field id="backupAfter" label="Ask the backup approver after (hours)" value={String(draft.backupAfterHours)} onChange={set('backupAfterHours')} />
            <Stack space="space.050">
              <Label labelFor="freeze">Freeze windows</Label>
              <TextArea id="freeze" value={draft.freezeText} placeholder={'Peak season: 2026-12-01 to 2027-01-10'} onChange={(e) => set('freezeText')(val(e))} />
              <Text>One per line. A plan due inside a window gets an objection.</Text>
            </Stack>
            <Field id="load" label="Open work items per owner before flagging overload (0 = off)" value={String(draft.overloadThreshold)} onChange={set('overloadThreshold')} />
            <Field id="mitproj" label="Jira project for mitigation tasks from Confluence proposals" value={draft.mitigationProjectKey} onChange={set('mitigationProjectKey')} placeholder="e.g. KF" />
            {SaveBar}
          </Stack>
        </TabPanel>

        <TabPanel>
          <Stack space="space.200">
            <Choose id="notify" label="Mention people for objections at or above" help="Lower findings go into one daily digest instead." options={SEVERITIES} value={draft.notifyMinSeverity} onChange={set('notifyMinSeverity')} />
            <Field id="digest" label="Confluence space for the daily digest (key)" help="Plan keys and counts only. Leave empty to keep the digest on the dashboard." value={draft.digestSpaceKey} onChange={set('digestSpaceKey')} placeholder="e.g. KF" />
            <Field id="decision" label="Confluence space for decision records (key)" help="When every objection is resolved, the team can record the decision here; the next review will find it." value={draft.decisionSpaceKey} onChange={set('decisionSpaceKey')} placeholder="e.g. KF" />
            {data.digest ? (
              <Stack space="space.050">
                <Heading size="xsmall">Latest digest</Heading>
                {data.digest.lines.map((l, i) => (
                  <Text key={`l${i}`}>{l}</Text>
                ))}
              </Stack>
            ) : null}
            {SaveBar}
          </Stack>
        </TabPanel>

        <TabPanel>
          <Stack space="space.200">
            <Text>
              {`The history index holds ${idx.docs || 0} items (Jira ${idx.jira?.indexed ?? 0}${idx.jira?.done ? ', done' : ''}; Confluence ${idx.confluence?.unavailable ? 'not available' : `${idx.confluence?.indexed ?? 0}${idx.confluence?.done ? ', done' : ''}`}). It updates itself from product events.`}
            </Text>
            {idx.state !== 'ready' ? (
              <Stack space="space.050">
                <Text>{`Building the index: ${idx.docs || 0} items so far.`}</Text>
                <ProgressBar ariaLabel="Index progress" value={Math.min(1, (idx.docs || 0) / Math.max(1, Math.min(draft.indexLimit || 3000, (p.counts?.issues || 0) + (p.counts?.pages || 0) || draft.indexLimit || 3000)))} />
              </Stack>
            ) : null}
            <Field id="limit" label="Work items to index (most recently updated first)" value={String(draft.indexLimit)} onChange={set('indexLimit')} />
            <ButtonGroup>
              <Button isDisabled={busy} onClick={() => run('rebuildIndex', {}, (r) => { setData({ ...data, index: r.index }); setMsg('Rebuilding the index in the background.'); })}>
                Rebuild the index
              </Button>
              <Button isDisabled={busy} onClick={() => run('refreshProfile', {}, (r) => { setData({ ...data, profile: r.profile, index: r.index }); setMsg('Site profile refreshed.'); })}>
                Detect the site again
              </Button>
              <Button appearance="subtle" isDisabled={busy} onClick={() => run('runSweepNow', {}, (r) => setMsg(`Sweep done: ${r.plansQueued} plans queued, ${r.newEvidence} with new evidence, ${r.approvals?.reminded || 0} reminders, ${r.overdueMitigations} overdue mitigations.`))}>
                Run the daily sweep now
              </Button>
              {SaveBar}
            </ButtonGroup>
            <Heading size="xsmall">Measured precision</Heading>
            {data.evalResult ? (
              <Text>{`${data.evalResult.precision}% precision, ${data.evalResult.recall ?? '—'}% recall on ${data.evalResult.plans} labelled plans (${data.evalResult.falseFlags ?? 0} false flags, ${data.evalResult.misses ?? 0} misses), ${data.evalResult.label || 'labelled set'}, ${String(data.evalResult.runAt).slice(0, 10)}.`}</Text>
            ) : (
              <Text>Not measured yet.</Text>
            )}
            <Text>
              Creates 40 labelled plans (once) in the project you name, reviews each in the background, and scores the reviews against the labels. Plans
              that already have a full review keep it; the rest get a draft without AI. It needs the Kestrel Freight demo history: load it on the Demo data tab and enter its project key here.
            </Text>
            <Inline space="space.100" alignBlock="end" shouldWrap>
              <Field id="evalProject" label="Project for the evaluation plans" value={evalProject} onChange={setEvalProject} placeholder="e.g. KF" />
              <Button
                isDisabled={busy || data.evalStatus?.state === 'running'}
                onClick={() =>
                  run('startEvaluation', { projectKey: evalProject }, (r) => {
                    setData({ ...data, evalStatus: { ...r.status, plans: undefined } });
                    setMsg(r.message);
                  })
                }
              >
                Measure precision
              </Button>
              {data.evalStatus?.state === 'running' ? (
                <Button
                  appearance="subtle"
                  isDisabled={busy}
                  onClick={() => run('getEvaluation', {}, (r) => setData({ ...data, evalStatus: r.status, evalResult: r.result || data.evalResult }))}
                >
                  Check progress
                </Button>
              ) : null}
            </Inline>
            {data.evalStatus?.state === 'running' ? <Text>{`Reviewing ${data.evalStatus.total} plans: ${data.evalStatus.done || 0} done so far.`}</Text> : null}
          </Stack>
        </TabPanel>

        <TabPanel>
          <Health health={data.health || {}} busy={busy} onClear={() => run('clearErrors', {}, (h) => setData({ ...data, health: h }))} />
        </TabPanel>

        <TabPanel>
          <DemoData data={data} busy={busy} run={run} setData={setData} setMsg={setMsg} />
        </TabPanel>
      </Tabs>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
