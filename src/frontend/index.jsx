// Jira issue panel: the Skeptic review, responses, approvals and radar for a plan.
import React from 'react';
import ForgeReconciler from '@forge/react';
import { SkepticApp } from './shared';

ForgeReconciler.render(
  <React.StrictMode>
    <SkepticApp kind="issue" />
  </React.StrictMode>,
);
