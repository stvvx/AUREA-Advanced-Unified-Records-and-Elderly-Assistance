export const STATS = [
  { id: '1', label: 'Registered', value: '1,284', icon: 'people' },
  { id: '2', label: 'Active IDs', value: '1,102', icon: 'card' },
  { id: '3', label: 'Pending', value: '38', icon: 'time' },
  { id: '4', label: 'Benefits Claimed', value: '947', icon: 'checkmark-circle' },
];

export const QUICK_ACTIONS = [
  { id: '1', label: 'Register', icon: 'person-add' },
  { id: '2', label: 'Issue ID', icon: 'card' },
  { id: '3', label: 'Benefits', icon: 'gift' },
  { id: '4', label: 'Reports', icon: 'bar-chart' },
];

export const MODULES: Record<'aurea' | 'legacy', Module[]> = {
  aurea: [
    { id: 'a1', title: 'Digital ID & Blockchain Verification', description: 'Tamper-proof senior citizen IDs on-chain', icon: 'shield-checkmark', status: 'active' },
    { id: 'a2', title: 'Benefits Management', description: 'Track and disburse entitlements digitally', icon: 'gift', status: 'active' },
    { id: 'a3', title: 'Health Monitoring', description: 'Integrated health records and check-up scheduling', icon: 'heart', status: 'coming' },
    { id: 'a4', title: 'Analytics Dashboard', description: 'Real-time population and benefits analytics', icon: 'bar-chart', status: 'coming' },
  ],
  legacy: [
    { id: 'l1', title: 'Senior Citizen Registration', description: 'Manual registration and record keeping', icon: 'person', status: 'active' },
    { id: 'l2', title: 'ID Issuance', description: 'Physical ID printing and tracking', icon: 'card', status: 'active' },
    { id: 'l3', title: 'Benefits Encoding', description: 'Manual benefits encoding and ledger', icon: 'document-text', status: 'active' },
    { id: 'l4', title: 'Reports Generation', description: 'Periodic compliance and census reports', icon: 'bar-chart', status: 'active' },
  ],
};

export type Module = {
  id: string;
  title: string;
  description: string;
  icon: string;
  status: 'active' | 'coming';
};
