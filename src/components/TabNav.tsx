'use client';

interface TabNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'scope', label: 'Cloud Nodes' },
  { id: 'tox', label: 'TOX Reference' },
];

export default function TabNav({ activeTab, onTabChange }: TabNavProps) {
  return (
    <nav className="tab-nav">
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
