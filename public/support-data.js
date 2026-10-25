// Shared demo capabilities. These records are fixtures, not connected enterprise data.
export const supportSurfaces = {
  help: { title: 'Help & how-to', icon: '?', prompt: 'How do I invite a teammate?', detail: 'Find a supported guide, try the steps, or carry the question into a ticket.' },
  access: { title: 'Request access', icon: '⌑', prompt: 'I need access to Figma', detail: 'Choose the tool and permission you need. A demo request goes to its approval queue.' },
  find_tool: { title: 'Find a tool', icon: '⌕', prompt: 'Where can I find our analytics tool?', detail: 'Explore the sample tool directory, see the owner, and request access.' },
  diagnostics: { title: 'Troubleshoot an issue', icon: '⚒', prompt: 'My VPN keeps disconnecting', detail: 'Run a guided local check. Unresolved results can travel with a support ticket.' },
  status: { title: 'Service status', icon: '◉', prompt: 'Is the VPN down?', detail: 'Check a sample service bulletin before opening another ticket.' },
  meeting: { title: 'Schedule IT support', icon: '▦', prompt: 'Schedule a support meeting tomorrow', detail: 'Pick a sample 30-minute slot and confirm a demo appointment.' },
  ticket: { title: 'Create a ticket', icon: '+', prompt: 'Report a broken monitor', detail: 'Review the issue and priority, then create a ticket in this page.' },
  tracking: { title: 'Track a request', icon: '≡', prompt: 'What is the status of SUP-104?', detail: 'Look up a sample ticket or a request you created during this visit.' },
};
export const tools = [
  { id: 'figma', name: 'Figma', purpose: 'Design files, prototypes, and design reviews', owner: 'Design Operations', url: 'https://www.figma.com', approval: 'Design lead', status: 'Operational', bulletin: 'No active incidents in this demo.' },
  { id: 'github', name: 'GitHub', purpose: 'Source code, repositories, and code reviews', owner: 'Developer Experience', url: 'https://github.com', approval: 'Repository owner', status: 'Operational', bulletin: 'No active incidents in this demo.' },
  { id: 'slack', name: 'Slack', purpose: 'Team messages, channels, and collaboration', owner: 'Workplace IT', url: 'https://slack.com', approval: 'Workspace admin', status: 'Operational', bulletin: 'No active incidents in this demo.' },
  { id: 'notion', name: 'Notion', purpose: 'Company knowledge, documents, and onboarding guides', owner: 'People Operations', url: 'https://www.notion.so', approval: 'Workspace admin', status: 'Operational', bulletin: 'No active incidents in this demo.' },
  { id: 'analytics', name: 'Analytics', purpose: 'Product dashboards, metrics, and reporting', owner: 'Data Platform', url: null, approval: 'Data owner', status: 'Operational', bulletin: 'No active incidents in this demo.' },
  { id: 'vpn', name: 'Company VPN', purpose: 'Secure access to internal services and the corporate network', owner: 'IT Infrastructure', url: null, approval: 'IT administrator', status: 'Degraded', bulletin: 'Demo incident INC-208: intermittent VPN disconnects. IT is investigating. No recovery time has been confirmed.' },
];
export const articles = [
  { id: 'invite', title: 'Invite a teammate', team: 'Workplace IT', steps: ['Open the workspace settings and choose Members.', 'Choose Invite member and enter their work email.', 'Select the least privileged role they need.', 'An admin must approve invitations when workspace policy requires it.'], note: 'Sample company guide. Actual menus and invitation policies depend on your workspace.' },
  { id: 'password', title: 'Reset a work password', team: 'Identity & Access', steps: ['Open your company sign-in page.', 'Choose Forgot password and use your work email.', 'Follow the recovery instructions from your identity provider.', 'If you cannot use your recovery method, contact Identity & Access.'], note: 'Never share passwords, recovery codes, or verification codes in a ticket.' },
  { id: 'vpn_setup', title: 'Set up the company VPN', team: 'IT Infrastructure', steps: ['Request VPN access if you do not have it.', 'Install the VPN client approved by your IT team.', 'Sign in with your work account and complete multi-factor authentication.', 'If connection fails, check service status or run the guided troubleshooting check.'], note: 'Sample setup guide. This demo does not install software or connect to a network.' },
];
export const sampleTickets = [
  { id: 'SUP-104', title: 'Analytics dashboard access', type: 'Access request', status: 'Awaiting approval', team: 'Data Platform', detail: 'The data owner is reviewing the requested read-only role.', history: ['Request received', 'Sent to Data Platform for approval'] },
  { id: 'SUP-105', title: 'External monitor flickers', type: 'Support ticket', status: 'In progress', team: 'Workplace IT', detail: 'A technician is reviewing the display connection. No resolution time is promised.', history: ['Ticket created', 'Assigned to Workplace IT', 'Technician reviewing reported symptoms'] },
];
