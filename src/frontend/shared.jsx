// The Skeptic panel: shared by the Jira issue panel and the Confluence byline item.
// Evidence first, short, and one click per response. The top three objections show; the rest collapse.
import React, { useEffect, useRef, useState } from 'react';
import {
  Box,
  Button,
  ButtonGroup,
  DatePicker,
  Em,
  EmptyState,
  Inline,
  Label,
  Link,
  Lozenge,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
  ModalTitle,
  ModalTransition,
  ProgressTracker,
  RadioGroup,
  SectionMessage,
  Spinner,
  Stack,
  Strong,
  Text,
  TextArea,
  Textfield,
  User,
  UserPicker,
  xcss,
} from '@forge/react';
import { invoke, rovo } from '@forge/bridge';

export const card = xcss({
  borderColor: 'color.border',
  borderWidth: 'border.width',
  borderStyle: 'solid',
  borderRadius: 'border.radius.200',
  padding: 'space.150',
});
const quiet = xcss({ paddingBlockStart: 'space.050' });

export const SEVERITY_LOOK = { critical: 'removed', high: 'removed', medium: 'moved', low: 'default' };
export const VERDICT_LOOK = { 'strong objections': 'removed', 'some concerns': 'moved', 'minor points': 'default', 'no strong objections': 'success' };
const STATUS_LABEL = { open: 'open', 'pending-approval': 'awaiting sign-off', resolved: 'resolved' };
const STATUS_LOOK = { open: 'new', 'pending-approval': 'inprogress', resolved: 'success' };
const RADAR_LOOK = { high: 'removed', medium: 'moved', low: 'success' };
const OUTCOME_LABEL = { 'came-true': 'Came true', 'did-not': "Didn't happen", unclear: 'Unclear' };
const RESOLUTION_LABEL = {
  evidence: 'Evidence linked',
  mitigation: 'Mitigation task',
  'plan-change': 'Plan changed',
  covered: 'Plan already covers it',
  'not-relevant': 'Not relevant',
  'accept-risk': 'Risk accepted',
};
const TOP = 3;
// One-click answers on each card: each opens the dialog with that answer chosen.
const QUICK = [
  { type: 'evidence', label: 'Link evidence' },
  { type: 'mitigation', label: 'Add a mitigation task' },
  { type: 'covered', label: 'Plan already covers it' },
];

// "1 item", "3 items": real plurals instead of "item(s)".
export const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
export const seconds = (ms) => (ms === null || ms === undefined ? '—' : ms >= 90000 ? `${Math.round(ms / 60000)} min` : `${Math.max(1, Math.round(ms / 1000))} s`);
const value = (e) => (e && e.target ? e.target.value : e);

// ---------------------------------------------------------------------------
// Progress while a review runs
// ---------------------------------------------------------------------------
// "about 40 s left", from how long recent reviews took. Never shown once the typical time has passed.
export function remaining(progress, typicalMs, now = Date.now()) {
  if (!progress || progress.done || !typicalMs || !progress.startedAt) return '';
  const left = typicalMs - (now - Date.parse(progress.startedAt));
  if (left < 5000) return 'almost done';
  return `about ${seconds(left)} left`;
}

function Progress({ progress, stages, typicalMs }) {
  // Once a review is saved the panel shows the result; the finished tracker would only add noise
  // (and would list an agent stage for a draft no agent wrote).
  if (!progress) return null;
  if (progress.stage === 'failed')
    return (
      <SectionMessage appearance="warning" title="The background review did not finish">
        <Text>{progress.error || 'Try again, or choose Discuss in Rovo chat.'}</Text>
      </SectionMessage>
    );
  if (progress.done) return null;
  const at = stages.findIndex((s) => s.id === progress.stage);
  const items = stages.map((s, i) => ({
    id: s.id,
    label: s.id === 'agent' && progress.expected ? `${s.label} (${progress.runs || 0}/${progress.expected})` : s.label,
    percentageComplete: i < at || progress.done ? 100 : 0,
    status: i < at || progress.done ? 'visited' : i === at ? 'current' : 'unvisited',
  }));
  return (
    <Stack space="space.050">
      <ProgressTracker items={items} label="Review progress" />
      {!progress.done ? (
        <Inline space="space.100" alignBlock="center">
          <Spinner size="small" />
          <Text>
            <Em>{`${remaining(progress, typicalMs) ? `${remaining(progress, typicalMs)[0].toUpperCase()}${remaining(progress, typicalMs).slice(1)}. ` : ''}Results appear here as soon as they are ready. You can keep working.`}</Em>
          </Text>
        </Inline>
      ) : null}
    </Stack>
  );
}

// ---------------------------------------------------------------------------
// The respond dialog: one form per response type, with what each severity requires
// ---------------------------------------------------------------------------
function RespondModal({ o, initialType, busy, result, onClose, onSubmit }) {
  const [type, setType] = useState(o.allowed.some((a) => a.type === initialType) ? initialType : o.allowed[0]?.type || 'evidence');
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [quote, setQuote] = useState('');
  const [summary, setSummary] = useState('');
  const [assignee, setAssignee] = useState(null);
  const [due, setDue] = useState('');
  const [approver, setApprover] = useState(null);
  const opened = useRef(Date.now());
  const rule = o.allowed.find((a) => a.type === type) || {};
  const needsTask = type === 'mitigation' || rule.needsMitigation;

  const submit = () =>
    onSubmit({
      type,
      input: {
        text,
        link,
        quote,
        summary,
        assigneeId: assignee?.id || assignee?.accountId || null,
        dueDate: due,
        approverId: approver?.id || approver?.accountId || null,
        elapsedMs: Date.now() - opened.current,
      },
    });

  const options = o.allowed.map((a) => ({
    name: 'response',
    value: a.type,
    label: `${a.label}${a.needsApprover ? ' (needs sign-off)' : ''}${a.needsMitigation ? ' (with a mitigation task)' : ''}`,
  }));

  return (
    <Modal onClose={onClose} label="Respond to an objection">
      <ModalHeader>
        <ModalTitle>Respond to this objection</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.150">
          <Text>
            <Lozenge appearance={SEVERITY_LOOK[o.severity]}>{o.severity}</Lozenge> {o.claim}
          </Text>
          {o.satisfiedBy ? (
            <Text>
              <Strong>What would settle it: </Strong>
              {o.satisfiedBy}
            </Text>
          ) : null}
          {o.escalated ? (
            <SectionMessage appearance="warning">
              <Text>Escalated after two weak answers: resolve it with proof, or ask a named approver.</Text>
            </SectionMessage>
          ) : null}
          <RadioGroup name="response" options={options} value={type} onChange={(e) => setType(value(e))} />

          {type === 'evidence' ? (
            <Stack space="space.075">
              <Label labelFor="link">Jira key or Confluence page link</Label>
              <Textfield id="link" placeholder="KF-12 or a page link" value={link} onChange={(e) => setLink(value(e))} />
              <Label labelFor="why">How does it answer the objection?</Label>
              <TextArea id="why" value={text} onChange={(e) => setText(value(e))} />
            </Stack>
          ) : null}
          {type === 'plan-change' ? (
            <Stack space="space.075">
              <Text>
                <Em>Edit the plan first. The Skeptic checks that the part dealing with this objection changed.</Em>
              </Text>
              <Label labelFor="what">What did you change? (optional)</Label>
              <TextArea id="what" value={text} onChange={(e) => setText(value(e))} />
            </Stack>
          ) : null}
          {type === 'covered' ? (
            <Stack space="space.075">
              <Label labelFor="quote">Paste the sentence from the plan that already deals with this</Label>
              <TextArea id="quote" value={quote} onChange={(e) => setQuote(value(e))} />
            </Stack>
          ) : null}
          {type === 'not-relevant' || type === 'accept-risk' ? (
            <Stack space="space.075">
              <Label labelFor="reason">{type === 'accept-risk' ? 'Why is the team accepting this risk? Who, what, by when.' : 'Why does this not apply here?'}</Label>
              <TextArea id="reason" value={text} onChange={(e) => setText(value(e))} />
            </Stack>
          ) : null}
          {needsTask ? (
            <Stack space="space.075">
              <Label labelFor="task">Mitigation task</Label>
              <Textfield id="task" placeholder="e.g. Agree evening support cover with Support Ops" value={summary} onChange={(e) => setSummary(value(e))} />
              <UserPicker label="Task owner" name="assignee" onChange={(u) => setAssignee(u)} />
              <Text>Due date</Text>
              <DatePicker value={due} placeholder="Pick a date" onChange={(d) => setDue(d)} />
            </Stack>
          ) : null}
          {rule.needsApprover ? (
            <Stack space="space.075">
              <UserPicker label="Approver (not the plan's author)" name="approver" onChange={(u) => setApprover(u)} />
              <Text>
                <Em>The gate stays closed until they sign off. They are reminded after a day; a backup approver is asked after two.</Em>
              </Text>
            </Stack>
          ) : null}

          {result?.rebuttal ? (
            <SectionMessage appearance={result.escalated ? 'error' : 'warning'} title="The Skeptic isn't convinced yet">
              <Text>{result.rebuttal}</Text>
            </SectionMessage>
          ) : null}
          {result?.error ? (
            <SectionMessage appearance="error">
              <Text>{result.error}</Text>
            </SectionMessage>
          ) : null}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          <Button appearance="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button appearance="primary" isDisabled={busy} onClick={submit}>
            {rule.needsApprover ? 'Send for sign-off' : 'Submit'}
          </Button>
        </ButtonGroup>
      </ModalFooter>
    </Modal>
  );
}

function OverrideModal({ busy, result, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  return (
    <Modal onClose={onClose} label="Emergency override">
      <ModalHeader>
        <ModalTitle>Emergency override</ModalTitle>
      </ModalHeader>
      <ModalBody>
        <Stack space="space.100">
          <Text>Lets this plan move on with objections unresolved. It is logged with your name and listed on the dashboard for review afterwards.</Text>
          <Label labelFor="reason">Reason (specific: what is urgent, and who agreed)</Label>
          <TextArea id="reason" value={reason} onChange={(e) => setReason(value(e))} />
          {result?.error ? (
            <SectionMessage appearance="error">
              <Text>{result.error}</Text>
            </SectionMessage>
          ) : null}
        </Stack>
      </ModalBody>
      <ModalFooter>
        <ButtonGroup>
          <Button appearance="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button appearance="danger" isDisabled={busy} onClick={() => onSubmit(reason)}>
            Override the gate
          </Button>
        </ButtonGroup>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// One objection
// ---------------------------------------------------------------------------
function Resolution({ o }) {
  const r = o.resolution;
  if (!r) return null;
  return (
    <Stack space="space.050">
      <Text>
        <Strong>{`${RESOLUTION_LABEL[r.type] || 'Resolved'}: `}</Strong>
        {r.text || (r.quote ? `“${r.quote}”` : '')}
      </Text>
      {r.link?.url ? (
        <Link href={r.link.url} openNewTab>
          {r.link.title || r.link.url}
        </Link>
      ) : null}
      {r.task?.key ? (
        <Text>
          Mitigation <Link href={r.task.url} openNewTab>{r.task.key}</Link>, due {r.task.dueDate}
        </Text>
      ) : null}
      <Inline space="space.050" alignBlock="center" shouldWrap>
        {r.by ? (
          <>
            <Text>by</Text>
            <User accountId={r.by} />
          </>
        ) : null}
        {r.approvedBy ? (
          <>
            <Text>signed off by</Text>
            <User accountId={r.approvedBy} />
          </>
        ) : null}
      </Inline>
    </Stack>
  );
}

function Objection({ o, index, state, canEdit, busy, onRespond, onReopen, onDecide, onGrade }) {
  const [note, setNote] = useState('');
  return (
    <Box xcss={card}>
      <Stack space="space.100">
        <Inline space="space.100" alignBlock="center" shouldWrap>
          <Strong>{`${index + 1}.`}</Strong>
          <Lozenge appearance={SEVERITY_LOOK[o.severity]} isBold={o.severity === 'critical'}>
            {o.severity}
          </Lozenge>
          <Lozenge appearance={STATUS_LOOK[o.status] || 'default'}>{STATUS_LABEL[o.status] || o.status}</Lozenge>
          {o.escalated && o.status !== 'resolved' ? <Lozenge appearance="removed">escalated</Lozenge> : null}
          {o.carriedOver ? <Lozenge appearance="new">carried over</Lozenge> : null}
          {o.sourceKind === 'check' ? <Lozenge appearance="new">rule</Lozenge> : null}
          {o.outcome ? <Lozenge appearance="inprogress">{OUTCOME_LABEL[o.outcome]}</Lozenge> : null}
        </Inline>
        <Text>{o.claim}</Text>
        {o.sourceQuote ? (
          <Text>
            <Em>{`The source says: “${o.sourceQuote}”`}</Em>
          </Text>
        ) : null}
        <Text>
          {o.sourceUrl ? (
            <Link href={o.sourceUrl} openNewTab>
              {o.sourceTitle}
            </Link>
          ) : (
            <Em>{o.sourceTitle}</Em>
          )}
          {o.talkTo ? ` · Talk to ${o.talkTo}` : ''}
        </Text>
        {o.severityExplain || o.runs > 1 ? (
          <Box xcss={quiet}>
            <Text>
              <Em>
                {o.severityExplain ? `Why ${o.severity}: ${o.severityExplain}` : ''}
                {o.runs > 1 ? `${o.severityExplain ? ' · ' : ''}raised in ${o.votes} of ${o.runs} passes` : ''}
              </Em>
            </Text>
          </Box>
        ) : null}

        {o.status === 'resolved' ? <Resolution o={o} /> : null}
        {o.status === 'pending-approval' && o.approval ? (
          <Inline space="space.050" alignBlock="center" shouldWrap>
            <Text>{o.approval.type === 'accept-risk' ? 'Risk acceptance' : '"Not relevant"'} waiting for</Text>
            <User accountId={o.approval.approver} />
            {o.approval.backupNotifiedAt && o.approval.backup ? (
              <>
                <Text>or backup</Text>
                <User accountId={o.approval.backup} />
              </>
            ) : null}
          </Inline>
        ) : null}
        {o.status === 'pending-approval' && o.approval?.reason ? (
          <Text>
            <Strong>Reason: </Strong>
            {o.approval.reason}
          </Text>
        ) : null}

        {state === 'active' && o.canDecide ? (
          <Stack space="space.075">
            <Label labelFor={`note-${o.id}`}>Note for the record (optional)</Label>
            <Textfield id={`note-${o.id}`} value={note} onChange={(e) => setNote(value(e))} />
            <ButtonGroup>
              <Button appearance="primary" isDisabled={busy} onClick={() => onDecide(o.id, true, note)}>
                Approve
              </Button>
              <Button appearance="warning" isDisabled={busy} onClick={() => onDecide(o.id, false, note)}>
                Send back
              </Button>
            </ButtonGroup>
          </Stack>
        ) : null}

        {state === 'active' && canEdit && o.status === 'open' ? (
          <Inline space="space.100" shouldWrap>
            {QUICK.filter((q) => (o.allowed || []).some((a) => a.type === q.type)).map((q, i) => (
              <Button key={q.type} appearance={i === 0 ? 'primary' : 'default'} spacing="compact" isDisabled={busy} onClick={() => onRespond(o, q.type)}>
                {q.label}
              </Button>
            ))}
            <Button appearance="subtle" spacing="compact" isDisabled={busy} onClick={() => onRespond(o)}>
              Other answer
            </Button>
          </Inline>
        ) : null}
        {state === 'active' && canEdit && o.status !== 'open' ? (
          <Button appearance="subtle" spacing="compact" isDisabled={busy} onClick={() => onReopen(o.id)}>
            Reopen
          </Button>
        ) : null}

        {state === 'awaiting-outcome' && !o.outcome && canEdit ? (
          <Stack space="space.050">
            <Text>Did this objection come true?</Text>
            <ButtonGroup>
              <Button isDisabled={busy} onClick={() => onGrade(o.id, 'came-true')}>
                Came true
              </Button>
              <Button isDisabled={busy} onClick={() => onGrade(o.id, 'did-not')}>
                Didn't happen
              </Button>
              <Button appearance="subtle" isDisabled={busy} onClick={() => onGrade(o.id, 'unclear')}>
                Unclear
              </Button>
            </ButtonGroup>
          </Stack>
        ) : null}
      </Stack>
    </Box>
  );
}

function RadarBox({ radar, busy, onRun, density }) {
  if (!radar)
    return (
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Text>The radar has not checked this plan yet.</Text>
        <Button appearance="subtle" spacing="compact" isDisabled={busy} onClick={onRun}>
          Check now
        </Button>
      </Inline>
    );
  return (
    <Stack space="space.050">
      <Inline space="space.100" alignBlock="center" shouldWrap>
        <Text>Radar</Text>
        <Lozenge appearance={RADAR_LOOK[radar.level] || 'default'}>{radar.level}</Lozenge>
        <Text>{radar.found ? `found ${radar.found}` : radar.level === 'low' ? 'found nothing that needs a review' : ''}</Text>
        <Button appearance="subtle" spacing="compact" isDisabled={busy} onClick={onRun}>
          Re-check
        </Button>
      </Inline>
      {density !== 'normal' ? (
        <Text>
          <Em>This site has little recorded history, so there is not much to compare against yet.</Em>
        </Text>
      ) : null}
    </Stack>
  );
}

function Checked({ checked }) {
  if (!checked) return null;
  const rules = (checked.rules || []).filter((r) => r.result !== 'skipped');
  return (
    <SectionMessage appearance="success" title="Nothing in your history contradicts this plan">
      <Stack space="space.050">
        <Text>
          {`Read ${plural(checked.itemsRead || 0, 'related item')} you can see${checked.indexedDocs ? `, out of ${checked.indexedDocs} indexed,` : ''} and checked ${plural(checked.assumptions || 0, 'assumption')}.`}
        </Text>
        {rules.length ? <Text>{`Rules: ${rules.map((r) => `${r.label} (${r.result === 'ok' ? 'ok' : r.detail ? r.detail.replace(/\.$/, '').toLowerCase() : 'flagged'})`).join(', ')}.`}</Text> : null}
        {checked.notVisible ? <Text>{`${plural(checked.notVisible, 'related item')} you can't see ${checked.notVisible === 1 ? 'was' : 'were'} left out.`}</Text> : null}
      </Stack>
    </SectionMessage>
  );
}

// "5 objections · 2 block the gate · 3 open · ready in 24 s"
export function summaryLine(review, view) {
  const objections = review.objections || [];
  if (!objections.length) return `Nothing in your history contradicts this plan${review.timing?.readyMs ? ` · ready in ${seconds(review.timing.readyMs)}` : ''}.`;
  const open = objections.filter((o) => o.status !== 'resolved').length;
  const parts = [`${objections.length} objection${objections.length === 1 ? '' : 's'}`];
  if (view.targetType !== 'page') parts.push(view.blocking ? `${view.blocking} block${view.blocking === 1 ? 's' : ''} the gate` : 'none block the gate');
  parts.push(open ? `${open} open` : 'all answered');
  if (review.timing?.readyMs) parts.push(`ready in ${seconds(review.timing.readyMs)}`);
  return parts.join(' · ');
}

function emptyText(view) {
  const found = view.radar?.found ? `The radar found ${view.radar.found}. ` : '';
  if (view.targetType === 'page') return 'Check this proposal against what your organisation has already tried, decided and suffered.';
  if (!view.canEdit) return `${found}Someone who can edit this plan can ask for a review.`;
  if (view.automationReady) return `${found}A cited review runs in the background and appears here in about a minute.`;
  return `${found}Review now opens Rovo chat with the Skeptic. A quick draft from history needs no AI and takes seconds.`;
}

// A short guide for demos and first use: what to do next, based on where the plan is.
function DemoGuide({ view }) {
  const r = view.review;
  const open = (r?.objections || []).filter((o) => o.status !== 'resolved').length;
  const step = !r
    ? ['1 of 4', 'Ask for a review', 'Choose Review now. The Skeptic reads your history with your permissions, then cites every objection.']
    : open
      ? ['2 of 4', 'Answer the objections', 'Pick an answer on a card. Weak answers get a rebuttal; high-severity ones need a named approver.']
      : !r.decision?.url && r.objections?.length
        ? ['3 of 4', 'Record the decision', 'Every objection is answered. Record the decision in Confluence so the next review finds it.']
        : ['4 of 4', 'Move the plan on', 'The gate is clear. Start the plan; when it closes, grade which objections came true.'];
  return (
    <SectionMessage appearance="discovery" title={`Guided tour, step ${step[0]}: ${step[1]}`}>
      <Text>{step[2]}</Text>
    </SectionMessage>
  );
}

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------
// `kind` is 'issue' (Jira panel) or 'page' (Confluence byline); the resolver works out the rest from context.
export function SkepticApp({ kind }) {
  const [view, setView] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [responding, setResponding] = useState(null);
  const [respondType, setRespondType] = useState(null);
  const [result, setResult] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [showHandled, setShowHandled] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [notice, setNotice] = useState('');
  const polls = useRef(0);

  const load = async () => {
    try {
      setView(await invoke('getPanel'));
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    }
  };
  useEffect(() => {
    load();
  }, []);

  // Poll while a review is running, so results show as soon as they land.
  useEffect(() => {
    if (!view?.progress || view.progress.done) {
      polls.current = 0;
      return undefined;
    }
    if (polls.current > 150) return undefined;
    const t = setTimeout(async () => {
      polls.current += 1;
      await load();
    }, 3000);
    return () => clearTimeout(t);
  }, [view]);

  const run = async (fn, payload) => {
    setBusy(true);
    setNotice('');
    try {
      const out = await invoke(fn, payload);
      if (out && out.view) {
        setView(out.view);
        return out.result;
      }
      setView(out);
      setError(null);
      return null;
    } catch (e) {
      setError(e.message || String(e));
      return { ok: false, error: e.message || String(e) };
    } finally {
      setBusy(false);
    }
  };

  const openChat = async () => {
    try {
      await rovo.open({ type: 'forge', agentKey: 'skeptic-agent', agentName: 'The Skeptic', prompt: view?.agentPrompt });
    } catch {
      setError(`Open Rovo chat and ask the Skeptic: "${view?.agentPrompt}"`);
    }
  };
  const reviewNow = async () => {
    setBusy(true);
    try {
      const out = await invoke('requestReview');
      if (out?.openChat) await openChat();
      else setView(out);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };
  const submitResponse = async (body) => {
    const r = await run('respond', { id: responding.id, ...body });
    if (r && r.ok) {
      setResponding(null);
      setResult(null);
      setNotice(r.message || (r.status === 'resolved' ? 'Resolved. It moves to the end of the list.' : 'Saved.'));
    } else setResult(r);
  };
  const decide = async (id, approve, note) => {
    const r = await run('decide', { id, approve, note });
    if (r && r.ok) setNotice(approve ? 'Signed off. The objection is resolved.' : 'Sent back. The objection is open again.');
    else if (r?.error) setError(r.error);
  };
  const submitOverride = async (reason) => {
    const r = await run('override', { reason });
    if (r && r.ok) {
      setOverriding(false);
      setResult(null);
    } else setResult(r);
  };

  if (error && !view)
    return (
      <SectionMessage appearance="error" title="The Skeptic could not load">
        <Text>{error}</Text>
      </SectionMessage>
    );
  if (!view) return <Spinner label="Loading the Skeptic" />;

  const review = view.review;
  const isIssue = (view.targetType || kind) === 'issue';
  const objections = review?.objections || [];
  // Open objections first (most severe first, as stored), resolved ones after, so the top three are
  // always what still needs attention. Numbers stay as stored, matching the chat's numbering.
  const ordered = [...objections].sort((a, b) => (a.status === 'resolved') - (b.status === 'resolved'));
  const shown = showAll ? ordered : ordered.slice(0, TOP);
  const allResolved = objections.length > 0 && objections.every((o) => o.status === 'resolved');
  const running = view.progress && !view.progress.done;
  const firstOpen = ordered.find((o) => o.status === 'open') || null;

  return (
    <Stack space="space.200">
      {error ? (
        <SectionMessage appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}
      {notice ? (
        <SectionMessage appearance="success">
          <Text>{notice}</Text>
        </SectionMessage>
      ) : null}

      {view.demoMode ? <DemoGuide view={view} /> : null}

      {review ? (
        <Stack space="space.075">
          <Inline space="space.100" alignBlock="center" shouldWrap>
            <Lozenge appearance={VERDICT_LOOK[review.verdict] || 'default'} isBold>
              {review.verdict}
            </Lozenge>
            {review.draft ? <Lozenge appearance="new">draft from history</Lozenge> : null}
            {isIssue ? (
              view.binding ? (
                <Lozenge appearance="removed">gate active</Lozenge>
              ) : (
                <Lozenge appearance="new">advisory while drafting</Lozenge>
              )
            ) : null}
            {review.override ? <Lozenge appearance="moved">gate overridden</Lozenge> : null}
          </Inline>
          <Text>{summaryLine(review, view)}</Text>
        </Stack>
      ) : null}

      <Progress progress={view.progress} stages={view.stages} typicalMs={view.typicalMs} />

      {review?.draft ? (
        <SectionMessage appearance="discovery" title="A draft written from your history, without AI">
          <Text>Each objection cites a real item. A full review adds the plan's assumptions, the reasoning behind each objection, and anything code could not match.</Text>
        </SectionMessage>
      ) : null}
      {view.reviewRequired ? (
        <SectionMessage appearance="warning" title="A review is required before this plan can start">
          <Text>The radar found that your organisation has been through something like this before.</Text>
        </SectionMessage>
      ) : null}
      {view.planChangedSinceReview ? (
        <SectionMessage appearance="information" title="The plan changed since this review">
          <Text>Review again: only the changed sections are re-checked, and answers on the rest are kept.</Text>
        </SectionMessage>
      ) : null}
      {review?.newEvidence?.count ? (
        <SectionMessage appearance="information" title="New evidence since this review">
          <Text>{`${plural(review.newEvidence.count, 'new item')}: ${(review.newEvidence.kinds || []).join(', ')}. Review again to see ${review.newEvidence.count === 1 ? 'it' : 'them'}.`}</Text>
        </SectionMessage>
      ) : null}

      {!review && !running ? (
        <EmptyState
          header={view.radar?.level === 'high' ? 'Your organisation has been here before' : 'No review yet'}
          headingLevel={3}
          description={emptyText(view)}
          primaryAction={
            view.canEdit || !isIssue ? (
              <Button appearance="primary" isDisabled={busy} onClick={reviewNow}>
                Review now
              </Button>
            ) : null
          }
          secondaryAction={
            view.canEdit && !view.automationReady ? (
              <Button isDisabled={busy} onClick={() => run('draftReview')}>
                Quick draft from history
              </Button>
            ) : null
          }
        />
      ) : null}
      {isIssue && !review && !running ? <RadarBox radar={view.radar} busy={busy} density={view.density} onRun={() => run('runRadarNow')} /> : null}

      {review && !running ? (
        <ButtonGroup>
          {firstOpen && view.canEdit && review.state === 'active' ? (
            <Button appearance="primary" isDisabled={busy} onClick={() => { setResult(null); setRespondType(null); setResponding(firstOpen); }}>
              {`Answer objection ${objections.indexOf(firstOpen) + 1}`}
            </Button>
          ) : null}
          {view.canEdit || !isIssue ? (
            <Button appearance={firstOpen ? 'subtle' : 'default'} isDisabled={busy} onClick={reviewNow}>
              {isIssue && view.automationReady ? 'Review again' : review.draft ? 'Full review in Rovo chat' : 'Review again in Rovo chat'}
            </Button>
          ) : null}
          {view.automationReady && isIssue ? (
            <Button appearance="subtle" isDisabled={busy} onClick={openChat}>
              Discuss in Rovo chat
            </Button>
          ) : null}
        </ButtonGroup>
      ) : null}

      {review ? (
        <Stack space="space.150">
          {review.summary ? <Text>{review.summary}</Text> : null}
          {objections.length ? null : <Checked checked={review.checked} />}
          {shown.map((o) => (
            <Objection
              key={o.id}
              o={o}
              index={objections.indexOf(o)}
              state={review.state}
              canEdit={view.canEdit}
              busy={busy}
              onRespond={(x, t) => {
                setResult(null);
                setRespondType(t || null);
                setResponding(x);
              }}
              onReopen={(id) => run('reopen', { id })}
              onDecide={decide}
              onGrade={(id, outcome) => run('gradeObjection', { id, outcome })}
            />
          ))}
          {objections.length > TOP ? (
            <Button appearance="subtle" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show ${objections.length - TOP} more`}
            </Button>
          ) : null}

          {review.worthAsking?.length ? (
            <Stack space="space.050">
              <Strong>Worth asking</Strong>
              {review.worthAsking.map((w) => (
                <Text key={w.ref}>
                  {`${w.text} `}
                  {w.sourceUrl ? (
                    <Link href={w.sourceUrl} openNewTab>
                      {w.sourceTitle}
                    </Link>
                  ) : null}
                </Text>
              ))}
            </Stack>
          ) : null}
          {review.handled?.length ? (
            <Stack space="space.050">
              <Button appearance="subtle" spacing="compact" onClick={() => setShowHandled(!showHandled)}>
                {`Already covered by your plan (${review.handled.length})`}
              </Button>
              {showHandled
                ? review.handled.map((h) => (
                    <Text key={h.ref}>
                      {`${h.claim} Your plan says: “${h.quote}”`}
                    </Text>
                  ))
                : null}
            </Stack>
          ) : null}
          {review.questions?.length ? (
            <Stack space="space.050">
              <Strong>Answer before starting</Strong>
              {review.questions.map((q) => (
                <Text key={q}>{`• ${q}`}</Text>
              ))}
            </Stack>
          ) : null}
          {review.revisitWhen?.length ? (
            <Stack space="space.050">
              <Strong>What would change the answer</Strong>
              {review.revisitWhen.map((q) => (
                <Text key={q}>{`• ${q}`}</Text>
              ))}
            </Stack>
          ) : null}

          {isIssue && view.blocking && !review.override ? (
            <Text>
              <Em>
                {view.binding
                  ? `${plural(view.blocking, 'objection')} at ${view.gateMinSeverity} or above ${view.blocking === 1 ? 'blocks' : 'block'} this plan until answered.`
                  : `${plural(view.blocking, 'objection')} at ${view.gateMinSeverity} or above will block this plan when it moves out of ${view.statusName || 'To Do'}.`}
              </Em>
            </Text>
          ) : null}
          <ButtonGroup>
            {allResolved && !review.decision?.url && view.canEdit ? (
              <Button appearance="primary" isDisabled={busy} onClick={() => run('recordDecision')}>
                Record the decision in Confluence
              </Button>
            ) : null}
            {isIssue && view.isProjectAdmin && view.blocking && !review.override ? (
              <Button appearance="subtle" isDisabled={busy} onClick={() => setOverriding(true)}>
                Emergency override
              </Button>
            ) : null}
          </ButtonGroup>
          {review.decision?.url ? (
            <Text>
              Decision recorded:{' '}
              <Link href={review.decision.url} openNewTab>
                {review.decision.title}
              </Link>
            </Text>
          ) : null}
          {review.voting?.runs > 1 || Object.values(review.dropped || {}).some(Boolean) ? (
            <Text>
              <Em>
                {plural(review.voting?.runs || 1, 'independent pass', 'independent passes')}
                {Object.values(review.dropped || {}).reduce((a, b) => a + b, 0)
                  ? ` · ${plural(Object.values(review.dropped).reduce((a, b) => a + b, 0), 'draft objection')} dropped by the citation and grounding checks`
                  : ''}
              </Em>
            </Text>
          ) : null}
        </Stack>
      ) : null}

      <ModalTransition>
        {responding ? (
          <RespondModal
            o={responding}
            initialType={respondType}
            busy={busy}
            result={result}
            onClose={() => {
              setResponding(null);
              setResult(null);
            }}
            onSubmit={submitResponse}
          />
        ) : null}
        {overriding ? (
          <OverrideModal
            busy={busy}
            result={result}
            onClose={() => {
              setOverriding(false);
              setResult(null);
            }}
            onSubmit={submitOverride}
          />
        ) : null}
      </ModalTransition>
    </Stack>
  );
}
