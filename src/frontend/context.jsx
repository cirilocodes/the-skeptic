// Jira work item sidebar (issue context): the Skeptic's status at a glance, without opening the panel.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Button, Em, Inline, Lozenge, SectionMessage, Spinner, Stack, Text } from '@forge/react';
import { invoke, rovo } from '@forge/bridge';

const SEVERITY_LOOK = { critical: 'removed', high: 'removed', medium: 'moved', low: 'default' };
const RADAR_LOOK = { high: 'removed', medium: 'moved', low: 'success' };

export function Glance() {
  const [g, setG] = useState(null);
  const [error, setError] = useState('');
  const [waiting, setWaiting] = useState(null);
  const load = () =>
    invoke('getGlance')
      .then(setG)
      .catch((e) => setError(e.message || String(e)));
  useEffect(() => {
    load();
  }, []);
  // After Review now, refresh every 4 s (up to 6 minutes) until the full review lands.
  useEffect(() => {
    if (!waiting) return undefined;
    if ((g && !g.draft && (g.createdAt || '') > waiting.before) || Date.now() - waiting.since > 6 * 60 * 1000) {
      setWaiting(null);
      return undefined;
    }
    const t = setTimeout(load, 4000);
    return () => clearTimeout(t);
  }, [g, waiting]);
  const reviewNow = async () => {
    try {
      await rovo.open({ type: 'forge', agentKey: 'skeptic-agent', agentName: 'The Skeptic', prompt: g.agentPrompt });
      setWaiting({ since: Date.now(), before: g.createdAt || '' });
    } catch {
      setError(`Open Rovo chat and ask the Skeptic: "${g.agentPrompt}"`);
    }
  };

  if (error)
    return (
      <SectionMessage appearance="warning">
        <Text>{error}</Text>
      </SectionMessage>
    );
  if (!g) return <Spinner size="small" label="Loading the Skeptic status" />;

  return (
    <Stack space="space.100">
      <Inline space="space.075" alignBlock="center" shouldWrap>
        <Lozenge appearance={g.look} isBold>
          {g.text}
        </Lozenge>
        {g.draft ? <Lozenge appearance="new">draft from history</Lozenge> : null}
        {g.state === 'blocking' ? <Lozenge appearance={g.binding ? 'removed' : 'new'}>{g.binding ? 'gate active' : 'blocks when it starts'}</Lozenge> : null}
      </Inline>
      {g.top.map((o, i) => (
        <Text key={`t${i}`}>
          <Lozenge appearance={SEVERITY_LOOK[o.severity] || 'default'}>{o.severity}</Lozenge> {o.claim}
        </Text>
      ))}
      {g.radar ? (
        <Inline space="space.075" alignBlock="center" shouldWrap>
          <Text>Radar</Text>
          <Lozenge appearance={RADAR_LOOK[g.radar.level] || 'default'}>{g.radar.level}</Lozenge>
          {g.radar.found ? <Text>{`found ${g.radar.found}`}</Text> : null}
        </Inline>
      ) : null}
      {g.gate && !g.gate.ok ? (
        <Text>
          {g.gate.kind === 'draft'
            ? 'Needs a full review before it can start.'
            : g.gate.kind === 'none'
              ? 'Needs a review before it can start.'
              : `${g.gate.blocking} objection${g.gate.blocking === 1 ? '' : 's'} to answer before it can start.`}
        </Text>
      ) : null}
      {waiting ? (
        <Text>
          <Em>Reviewing in Rovo chat (about a minute). Choose Confirm when Rovo asks to save the review; this updates by itself.</Em>
        </Text>
      ) : g.agentPrompt && g.gate && !g.gate.ok && g.gate.kind !== 'objections' ? (
        <Button appearance="primary" onClick={reviewNow}>
          {g.gate?.kind === 'draft' ? 'Full review in Rovo chat' : 'Review now'}
        </Button>
      ) : null}
      <Text>
        <Em>{g.state === 'none' ? 'Details are in the Skeptic panel on this work item (apps button under the title).' : 'Answer objections in the Skeptic panel on this work item (apps button under the title).'}</Em>
      </Text>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Glance />
  </React.StrictMode>,
);
