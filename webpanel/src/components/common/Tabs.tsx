import { ReactNode, useState } from 'react'

type Tab = {
  id: string
  label: string
  content: ReactNode
  count?: number
  action?: ReactNode
}

type TabsProps = {
  tabs: Tab[]
  defaultTab?: string
}

export function Tabs({ tabs, defaultTab }: TabsProps) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id)

  const currentTab = tabs.find(t => t.id === activeTab)

  return (
    <div className="tabs">
      <div className="tabs-header">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="tab-count">{tab.count}</span>
            )}
          </button>
        ))}
        {currentTab?.action && (
          <div className="tab-action">{currentTab.action}</div>
        )}
      </div>
      <div className="tabs-content">
        {currentTab?.content}
      </div>
    </div>
  )
}
