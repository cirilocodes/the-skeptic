// Jira global page: the Skeptic dashboard. Everything on it is filtered to what the viewer can see.
// It leads with the three numbers that matter: how fast reviews are ready, how little time authors spend,
// and how often the Skeptic is right.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, {
  Box,
  Button,
  Badge,
  ButtonGroup,
  CodeBlock,
  DynamicTable,
  EmptyState,
  Heading,
  Inline,
  Label,
  LineChart,
  Link,
  Lozenge,
  SectionMessage,
  Select,
  Spinner,
  Stack,
  Strong,
  Text,
  Textfield,
  User,
  xcss,
} from '@forge/react';
import { invoke } from '@forge/bridge';
import { card, plural, seconds, SEVERITY_LOOK, VERDICT_LOOK } from './shared';

// Soft, friendly surfaces: pastel tiles, light grey cards, no hard borders or shadows. UI Kit allows only
// the standard corner radius, so softness comes from colour and spacing instead.
const soft = (backgroundColor, padding = 'space.200') => xcss({ backgroundColor, borderRadius: 'border.radius', padding });
const panel = soft('elevation.surface.sunken', 'space.250');
const hero = soft('color.background.accent.purple.subtlest', 'space.300');
const TONES = {
  blue: soft('color.background.accent.blue.subtlest'),
  purple: soft('color.background.accent.purple.subtlest'),
  green: soft('color.background.accent.green.subtlest'),
  orange: soft('color.background.accent.orange.subtlest'),
  teal: soft('color.background.accent.teal.subtlest'),
  gray: soft('color.background.neutral'),
};
const row = xcss({ paddingBlock: 'space.075' });

function Tile({ label, value, note, tone = 'gray' }) {
  return (
    <Box xcss={TONES[tone]}>
      <Stack space="space.075">
        <Text size="small" color="color.text.subtle">
          {label}
        </Text>
        <Heading size="large">{String(value)}</Heading>
        {note ? (
          <Text size="small" color="color.text.subtlest">
            {note}
          </Text>
        ) : null}
      </Stack>
    </Box>
  );
}

// A raised card with a heading and an optional count. Empty sections are not drawn at all: the
// "all clear" line at the top says what is empty.
function Section({ title, count, children, empty, badge = 'primary' }) {
  return (
    <Box xcss={panel}>
      <Stack space="space.150">
        <Inline space="space.100" alignBlock="center">
          <Heading size="xsmall">{title}</Heading>
          {count ? <Badge appearance={badge}>{count}</Badge> : null}
        </Inline>
        {children || (
          <Text size="small" color="color.text.subtlest">
            {empty || 'Nothing here.'}
          </Text>
        )}
      </Stack>
    </Box>
  );
}

// One plain sentence for the top of the page.
function summaryLine(d) {
  const reviews = d.reviews || 0;
  if (!reviews) return 'No plans reviewed yet.';
  const gated = (d.gated || []).length;
  const parts = [`The Skeptic has looked at ${plural(reviews, 'plan')} and raised ${plural(d.objections || 0, 'point')}`];
  if (d.resolved) parts.push(`${d.resolved} answered so far`);
  return `${parts.join(', ')}.${gated ? ` ${gated === 1 ? 'One plan is' : `${gated} plans are`} waiting on answers before ${gated === 1 ? 'it' : 'they'} can start.` : ' Nothing is held at the gate.'}`;
}

function Override({ o, onReviewed }) {
  const [note, setNote] = useState('');
  return (
    <Box xcss={card}>
      <Stack space="space.075">
        <Inline space="space.050" alignBlock="center" shouldWrap>
          <Strong>{o.planKey}</Strong>
          <Text>overridden by</Text>
          <User accountId={o.by} />
          <Text>{`on ${String(o.at).slice(0, 10)} with ${plural(o.blocking, 'objection')} open`}</Text>
        </Inline>
        <Text>{o.reason}</Text>
        <Label labelFor={`note-${o.key}`}>What did the review afterwards find?</Label>
        <Inline space="space.100" alignBlock="center">
          <Textfield id={`note-${o.key}`} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button onClick={() => onReviewed(o.key, note)}>Mark reviewed</Button>
        </Inline>
      </Stack>
    </Box>
  );
}

function App() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [project, setProject] = useState(null);
  const [showCsv, setShowCsv] = useState(false);

  const load = async (p = project) => {
    try {
      setData(await invoke('getInsights', p ? { project: p } : {}));
      setError(null);
    } catch (e) {
      setError(e.message || String(e));
    }
  };
  useEffect(() => {
    load();
  }, []);

  const act = async (fn, payload) => {
    setBusy(true);
    try {
      await invoke(fn, payload);
      await load();
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data && !error) return <Spinner label="Loading the Skeptic dashboard" />;
  if (!data)
    return (
      <SectionMessage appearance="error" title="The dashboard could not load">
        <Text>{error}</Text>
      </SectionMessage>
    );

  const t = data.timing || {};
  const evalP = data.precision?.eval;
  const live = data.precision?.live || {};
  const verdictData = Object.entries(data.verdicts || {}).map(([label, value]) => ({ label, value }));
  const VIA = { automation: 'background', chat: 'chat', draft: 'draft (no AI)' };

  if (!data.reviews && !data.project)
    return (
      <EmptyState
        header="No reviews yet"
        headingLevel={2}
        description="Open a plan (an epic or initiative) and choose Review now in the Skeptic panel, or ask the Skeptic in Rovo chat. Reviews, objections, approvals and the risk ledger appear here, filtered to what you can see."
      />
    );

  const cited = (data.mostCited || []).filter((m) => m.plans > 1);
  const waiting = [
    ['approvals', data.approvals?.length, 'sign-offs'],
    ['matches', data.matches?.length, 'incident matches'],
    ['overrides', data.overrides?.length, 'overrides'],
    ['radar', data.radarFlags?.length, 'radar flags'],
  ];
  const quiet = waiting.filter(([, n]) => !n).map(([, , w]) => w);

  return (
    <Stack space="space.300">
      {error ? (
        <SectionMessage appearance="error">
          <Text>{error}</Text>
        </SectionMessage>
      ) : null}

      <Box xcss={hero}>
        <Inline spread="space-between" alignBlock="center" shouldWrap rowSpace="space.150">
          <Stack space="space.100">
            <Heading size="medium">Here's how your plans are doing</Heading>
            <Text color="color.text.subtle">{summaryLine(data)}</Text>
            <Inline space="space.075" shouldWrap>
              <Lozenge appearance={data.index?.state === 'ready' ? 'success' : 'inprogress'}>
                {data.index?.state === 'ready' ? `knows ${(data.index?.docs || 0).toLocaleString('en')} past items` : `still reading history · ${data.index?.docs || 0} so far`}
              </Lozenge>
              <Lozenge appearance={data.background ? 'success' : 'default'}>{data.background ? 'reviews run on their own' : 'reviews on request'}</Lozenge>
              <Lozenge appearance="new">{`gate at ${data.gateMinSeverity || 'medium'} and up`}</Lozenge>
            </Inline>
          </Stack>
          {(data.projects || []).length > 1 || data.project ? (
            <Inline space="space.100" alignBlock="center">
              <Label labelFor="project">Project</Label>
              <Box>
                <Select
                  inputId="project"
                  options={[{ label: 'All projects', value: '' }, ...(data.projects || []).map((p) => ({ label: p, value: p }))]}
                  value={{ label: data.project || 'All projects', value: data.project || '' }}
                  onChange={(o) => {
                    const next = o?.value || null;
                    setProject(next);
                    load(next);
                  }}
                />
              </Box>
            </Inline>
          ) : null}
        </Inline>
      </Box>

      {data.index?.state !== 'ready' ? (
        <SectionMessage appearance="information" title="Building the history index">
          <Text>{`${data.index?.docs || 0} items indexed so far. Reviews use live search until the index is ready.`}</Text>
        </SectionMessage>
      ) : null}

      <Inline space="space.200" shouldWrap>
        <Tile tone="blue" label="⏱️ A review is ready in" value={seconds(t.readyMedianMs)} note={t.readySamples ? `typical of ${plural(t.readySamples, 'recent review')} · ${seconds(t.readyBackgroundMedianMs)} when it runs on its own` : 'No reviews yet'} />
        <Tile tone="purple" label="✍️ Authors spend" value={seconds(t.authorMedianMs)} note={t.authorSamples ? `answering, across ${plural(t.authorSamples, 'review')}` : 'No answers yet'} />
        <Tile
          tone="green"
          label="🎯 Right on the test set"
          value={evalP?.precision !== undefined && evalP?.precision !== null ? `${evalP.precision}%` : '—'}
          note={evalP ? `${evalP.plans} labelled plans · finds ${evalP.recall ?? '—'}% · ${evalP.falseFlags ?? 0} false flags` : 'Run the test on the settings page'}
        />
        <Tile tone="teal" label="👍 Right in real use" value={live.precision !== null && live.precision !== undefined ? `${live.precision}%` : '—'} note={`${live.useful || 0} useful · ${live.falseFlags || 0} dismissed`} />
      </Inline>

      <Inline space="space.200" shouldWrap>
        <Tile tone="orange" label="💬 Points raised" value={data.objections} note={`${data.open} open · ${data.pendingApproval} waiting for sign-off · ${data.resolved} answered`} />
        <Tile label="📋 Plans reviewed" value={data.reviews} note={data.pageReviews ? `including ${plural(data.pageReviews, 'Confluence proposal')}` : 'Jira plans'} />
        <Tile label="🧹 Weak claims removed" value={data.droppedByChecks} note="caught by the citation checks before anyone saw them" />
        <Tile label="✅ Already handled" value={data.handledByPlan} note="points the plan had already covered" />
      </Inline>

      <Section title="Waiting on answers before they can start" count={data.gated?.length} badge="warning" empty="No plan is waiting. Nice.">
        {data.gated?.length ? (
          <Stack space="space.0">
            {data.gated.map((g) => (
              <Box key={g.key} xcss={row}>
                <Inline space="space.100" alignBlock="center" shouldWrap>
                  <Lozenge appearance="moved">{`${g.blocking} to answer`}</Lozenge>
                  <Link href={g.url} openNewTab>{`${g.key} · ${g.title}`}</Link>
                  {g.binding ? null : (
                    <Text size="small" color="color.text.subtlest">
                      only advice until it starts
                    </Text>
                  )}
                </Inline>
              </Box>
            ))}
          </Stack>
        ) : null}
      </Section>

      {quiet.length < waiting.length ? null : (
        <SectionMessage appearance="success" title="You're all caught up">
          <Text>No sign-offs, overrides, incident matches or radar flags need you right now.</Text>
        </SectionMessage>
      )}
      {quiet.length && quiet.length < waiting.length ? (
        <Text size="small" color="color.text.subtlest">{`Nothing waiting for: ${quiet.join(', ')}.`}</Text>
      ) : null}

      {data.approvals?.length ? (
        <Section title="Waiting for sign-off" count={data.approvals.length} badge="warning">
          <Stack space="space.0">
            {data.approvals.map((a, i) => (
              <Box key={`${a.key}${i}`} xcss={row}>
                <Inline space="space.075" alignBlock="center" shouldWrap>
                  <Lozenge appearance={SEVERITY_LOOK[a.severity]}>{a.severity}</Lozenge>
                  <Link href={a.url} openNewTab>
                    {a.key}
                  </Link>
                  <Text>waiting for</Text>
                  <User accountId={a.approver} />
                  <Text size="small" color="color.text.subtlest">{`since ${String(a.since).slice(0, 10)}`}</Text>
                </Inline>
              </Box>
            ))}
          </Stack>
        </Section>
      ) : null}

      {data.matches?.length ? (
        <Section title="Incidents that may match an accepted risk" count={data.matches.length} badge="warning">
          <Stack space="space.100">
            {data.matches.map((m) => (
              <Box key={m.key} xcss={card}>
                <Stack space="space.075">
                  <Text>{`${m.incidentKey} may be the risk ${m.planKey} accepted (shared: ${(m.shared || []).join(', ').replace(/_/g, ' ')}).`}</Text>
                  <ButtonGroup>
                    <Button appearance="primary" isDisabled={busy} onClick={() => act('decideMatch', { key: m.key, confirmed: true })}>
                      Yes, it happened
                    </Button>
                    <Button isDisabled={busy} onClick={() => act('decideMatch', { key: m.key, confirmed: false })}>
                      Not a match
                    </Button>
                  </ButtonGroup>
                </Stack>
              </Box>
            ))}
          </Stack>
        </Section>
      ) : null}

      {data.overrides?.length ? (
        <Section title="Overrides to review" count={data.overrides.length} badge="warning">
          <Stack space="space.100">
            {data.overrides.map((o) => (
              <Override key={o.key} o={o} onReviewed={(key, note) => act('markOverrideReviewed', { key, note })} />
            ))}
          </Stack>
        </Section>
      ) : null}

      {data.radarFlags?.length ? (
        <Section title="Radar flags waiting for a review" count={data.radarFlags.length}>
          <Stack space="space.0">
            {data.radarFlags.map((r) => (
              <Box key={r.key} xcss={row}>
                <Inline space="space.100" alignBlock="center" shouldWrap>
                  <Badge appearance="discovery">{`score ${r.score}`}</Badge>
                  <Text>{`${r.key} · ${r.title}`}</Text>
                </Inline>
              </Box>
            ))}
          </Stack>
        </Section>
      ) : null}

      {data.newEvidence?.length ? (
        <Section title="New evidence since the last review" count={data.newEvidence.length} badge="primary">
          <Stack space="space.050">
            {data.newEvidence.map((n) => (
              <Text key={n.key}>
                <Link href={n.url} openNewTab>
                  {n.key}
                </Link>
                {` · ${plural(n.count, 'new item')}`}
              </Text>
            ))}
          </Stack>
        </Section>
      ) : null}

      {data.awaitingGrades?.length ? (
        <Section title="Closed plans waiting for grades" count={data.awaitingGrades.length}>
          <Stack space="space.050">
            {data.awaitingGrades.map((g) => (
              <Text key={g.key}>
                <Link href={g.url} openNewTab>{`${g.key} · ${g.title}`}</Link>
              </Text>
            ))}
          </Stack>
        </Section>
      ) : null}

      {(data.weekly || []).some((w) => w.value) || verdictData.length ? (
        <Inline space="space.200" shouldWrap alignBlock="start">
          {(data.weekly || []).some((w) => w.value) ? (
            <Box>
              <LineChart data={data.weekly} xAccessor="week" yAccessor="value" colorAccessor="series" title="Reviews and points raised, week by week" height={240} />
            </Box>
          ) : null}
          {verdictData.length ? (
            <Box xcss={panel}>
              <Stack space="space.150">
                <Heading size="xsmall">How plans came out</Heading>
                {verdictData
                  .sort((a, b) => b.value - a.value)
                  .map((v) => (
                    <Inline key={v.label} spread="space-between" alignBlock="center">
                      <Lozenge appearance={VERDICT_LOOK[v.label] || 'default'}>{v.label}</Lozenge>
                      <Text size="small" color="color.text.subtle">{`${v.value} of ${data.reviews}`}</Text>
                    </Inline>
                  ))}
              </Stack>
            </Box>
          ) : null}
        </Inline>
      ) : null}

      <Section title="Recent reviews" count={data.recent?.length} empty="No reviews yet.">
        {data.recent?.length ? (
          <DynamicTable
            head={{
              cells: [
                { key: 'plan', content: 'Plan' },
                { key: 'verdict', content: 'Verdict' },
                { key: 'top', content: 'Top severity' },
                { key: 'open', content: 'Unresolved' },
                { key: 'ready', content: 'Ready in' },
                { key: 'via', content: 'Via' },
              ],
            }}
            rows={data.recent.map((r, i) => ({
              key: `x${i}`,
              cells: [
                { key: 'plan', content: r.url ? <Link href={r.url} openNewTab>{`${r.label} · ${r.title}`}</Link> : r.title },
                { key: 'verdict', content: <Lozenge appearance={VERDICT_LOOK[r.verdict] || 'default'}>{r.verdict}</Lozenge> },
                { key: 'top', content: r.top === 'none' ? '—' : <Lozenge appearance={SEVERITY_LOOK[r.top]}>{r.top}</Lozenge> },
                { key: 'open', content: `${r.unresolved} of ${r.total}` },
                { key: 'ready', content: seconds(r.readyMs) },
                { key: 'via', content: VIA[r.channel] || 'chat' },
              ],
            }))}
          />
        ) : null}
      </Section>

      <Inline space="space.200" shouldWrap alignBlock="start">
        <Section title="History that keeps coming up" count={cited.length} empty="No source has been cited on more than one plan yet.">
          {cited.length ? (
            <Stack space="space.050">
              {cited.map((m) => (
                <Text key={m.title}>
                  {m.url ? (
                    <Link href={m.url} openNewTab>
                      {m.title}
                    </Link>
                  ) : (
                    m.title
                  )}
                  {` · cited on ${m.plans} plans`}
                </Text>
              ))}
            </Stack>
          ) : null}
        </Section>
        <Section title="Track record" empty="No graded outcomes yet. Close a reviewed plan and grade its objections.">
          {data.calibration?.graded || (data.topReasons || []).length ? (
            <Stack space="space.075">
              {data.calibration?.graded ? <Text>{`${Math.round((data.calibration.rate || 0) * 100)}% of ${data.calibration.graded} graded objections came true.`}</Text> : null}
              {(data.topReasons || []).map((r) => (
                <Text key={r.title}>{`${r.title} · came true ${r.n} time${r.n === 1 ? '' : 's'}`}</Text>
              ))}
            </Stack>
          ) : null}
        </Section>
      </Inline>

      <Section title="Risk ledger" count={data.ledgerTotal} empty="No risks accepted yet. When an author accepts a risk, it is recorded here with who signed it off.">
        {data.ledger?.length ? (
          <Stack space="space.100">
            <DynamicTable
              head={{
                cells: [
                  { key: 'plan', content: 'Plan' },
                  { key: 'sev', content: 'Severity' },
                  { key: 'risk', content: 'Accepted risk' },
                  { key: 'by', content: 'Accepted by' },
                  { key: 'ok', content: 'Signed off by' },
                  { key: 'when', content: 'When' },
                  { key: 'status', content: 'Status' },
                ],
              }}
              rows={data.ledger.map((r, i) => ({
                key: `r${i}`,
                cells: [
                  { key: 'plan', content: r.planUrl ? <Link href={r.planUrl} openNewTab>{r.planKey}</Link> : r.planKey },
                  { key: 'sev', content: <Lozenge appearance={SEVERITY_LOOK[r.severity]}>{r.severity}</Lozenge> },
                  { key: 'risk', content: r.claim },
                  { key: 'by', content: r.acceptedBy ? <User accountId={r.acceptedBy} /> : '—' },
                  { key: 'ok', content: r.approvedBy ? <User accountId={r.approvedBy} /> : 'self (low/medium)' },
                  { key: 'when', content: String(r.acceptedAt).slice(0, 10) },
                  { key: 'status', content: r.status === 'materialised' ? <Lozenge appearance="removed">{`happened: ${r.incidents.join(', ')}`}</Lozenge> : <Lozenge>open</Lozenge> },
                ],
              }))}
            />
            <Inline space="space.100" alignBlock="center">
              <Button appearance="subtle" spacing="compact" onClick={() => setShowCsv(!showCsv)}>
                {showCsv ? 'Hide the CSV' : 'Export as CSV'}
              </Button>
              {data.ledgerTotal > data.ledger.length ? (
                <Text size="small" color="color.text.subtlest">{`Showing the latest ${data.ledger.length} of ${data.ledgerTotal}; the CSV has all of them.`}</Text>
              ) : null}
            </Inline>
            {showCsv ? <CodeBlock language="text" text={data.ledgerCsv || ''} /> : null}
          </Stack>
        ) : null}
      </Section>

      {data.digest ? (
        <Section title="Latest daily digest">
          <Stack space="space.050">
            {data.digest.lines.map((l, i) => (
              <Text key={`d${i}`}>{l}</Text>
            ))}
          </Stack>
        </Section>
      ) : null}
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
