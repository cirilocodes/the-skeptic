// Jira work item sidebar (issue context): the Skeptic's status at a glance, without opening the panel.
import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Em, Inline, Lozenge, SectionMessage, Spinner, Stack, Text } from '@forge/react';
import { invoke } from '@forge/bridge';

const SEVERITY_LOOK = { critical: 'removed', high: 'removed', medium: 'moved', low: 'default' };
const RADAR_LOOK = { high: 'removed', medium: 'moved', low: 'success' };

export function Glance() {
  const [g, setG] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    invoke('getGlance')
      .then(setG)
      .catch((e) => setError(e.message || String(e)));
  }, []);

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
      <Text>
        <Em>{g.state === 'none' ? 'Open the Skeptic panel on this work item to review the plan.' : 'Details and responses are in the Skeptic panel on this work item.'}</Em>
      </Text>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <Glance />
  </React.StrictMode>,
);
