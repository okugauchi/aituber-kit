import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import menuStore from '@/features/stores/menu'

import Description from '../description'
import Based from '../based'
import Character from '../character'
import AI from '../ai'
import Voice from '../voice'
import YouTube from '../youtube'
import Slide from '../slide'
import Other from '../other'
import SpeechInput from '../speechInput'
import Images from '../images'
import MemorySettings from '../memorySettings'
import PresenceSettings from '../presenceSettings'
import IdleSettings from '../idleSettings'
import GameCommentarySettings from '../gameCommentarySettings'
import KioskSettings from '../kioskSettings'
import QuickStart from '../quickStart'
import {
  TabGroup,
  TabKey,
  getTabGroups,
  tabIconMapping,
  tabsWithRedundantPanelTitle,
} from './tabConfig'
import { clearSearchHighlights, highlightSearchTerms } from './searchHighlight'

export const Main = () => {
  const { t } = useTranslation()
  const activeTab = menuStore((state) => state.activeSettingsTab)
  const searchQuery = menuStore((state) => state.settingsSearchQuery)
  const [activeMobileGroup, setActiveMobileGroup] = useState('start')
  const contentScrollRef = useRef<HTMLElement>(null)
  const settingsPanelRef = useRef<HTMLDivElement>(null)

  const setActiveTab = (tab: TabKey) => {
    menuStore.setState({ activeSettingsTab: tab })
  }

  const setActiveGroup = (group: TabGroup) => {
    setActiveMobileGroup(group.key)
    const defaultTab = group.tabs[0]?.key
    if (defaultTab) {
      setActiveTab(defaultTab)
    }
  }

  const groups = useMemo(() => getTabGroups(t), [t])
  const tabs = groups.flatMap((group) => group.tabs)
  const normalizedSearchQuery = searchQuery.trim().toLowerCase()
  const visibleGroups = useMemo(() => {
    if (!normalizedSearchQuery) return groups
    const searchTerms = normalizedSearchQuery.split(/\s+/).filter(Boolean)

    return groups
      .map((group) => ({
        ...group,
        tabs: group.tabs.filter((tab) => {
          const searchText = [tab.label, ...(tab.keywords ?? [])]
            .join(' ')
            .toLowerCase()

          return searchTerms.every((term) => searchText.includes(term))
        }),
      }))
      .filter((group) => group.tabs.length > 0)
  }, [groups, normalizedSearchQuery])
  const activeTabGroup =
    groups.find((group) => group.tabs.some((tab) => tab.key === activeTab))
      ?.key ?? activeMobileGroup
  const selectedMobileGroup = normalizedSearchQuery
    ? activeMobileGroup
    : activeTabGroup

  const visibleMobileTabs = normalizedSearchQuery
    ? visibleGroups.flatMap((group) => group.tabs)
    : (visibleGroups.find((group) => group.key === selectedMobileGroup)?.tabs ??
      visibleGroups[0]?.tabs ??
      [])

  const renderTabContent = () => {
    switch (activeTab) {
      case 'quickStart':
        return <QuickStart />
      case 'description':
        return <Description />
      case 'based':
        return <Based />
      case 'character':
        return <Character />
      case 'ai':
        return <AI />
      case 'voice':
        return <Voice />
      case 'youtube':
        return <YouTube />
      case 'slide':
        return <Slide />
      case 'images':
        return <Images />
      case 'memory':
        return <MemorySettings />
      case 'presence':
        return <PresenceSettings />
      case 'idle':
        return <IdleSettings />
      case 'gameCommentary':
        return <GameCommentarySettings />
      case 'kiosk':
        return <KioskSettings />
      case 'other':
        return <Other />
      case 'speechInput':
        return <SpeechInput />
    }
  }

  const currentTab = tabs.find((tab) => tab.key === activeTab)

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0, left: 0 })
  }, [activeTab])

  useEffect(() => {
    const settingsPanel = settingsPanelRef.current
    if (!settingsPanel) return

    clearSearchHighlights(settingsPanel)

    const searchTerms = searchQuery.trim().split(/\s+/).filter(Boolean)
    if (searchTerms.length === 0) return

    highlightSearchTerms(settingsPanel, searchTerms)

    return () => {
      clearSearchHighlights(settingsPanel)
    }
  }, [activeTab, searchQuery])

  return (
    <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[auto_1fr] text-text1 md:grid-cols-[260px_1fr] md:grid-rows-1">
      <aside className="theme-surface-popover hidden min-h-0 overflow-y-auto border-r border-primary/20 p-3 md:block">
        <nav aria-label="Settings navigation" className="space-y-4">
          {visibleGroups.map((group) => (
            <section key={group.key}>
              <div className="mb-1 px-2 text-xs font-bold text-text-primary/80">
                {group.label}
              </div>
              <ul className="space-y-1">
                {group.tabs.map((tab) => (
                  <li key={tab.key}>
                    <SettingsTabButton
                      active={activeTab === tab.key}
                      label={tab.label}
                      tabKey={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      </aside>

      <div className="theme-surface-popover min-w-0 border-b border-primary/20 py-2 md:hidden">
        <div className="scroll-hidden flex gap-2 overflow-x-auto px-3 pb-2">
          {visibleGroups.map((group) => (
            <button
              key={group.key}
              className={`h-9 shrink-0 rounded-lg border px-4 text-sm font-bold shadow-sm ${
                selectedMobileGroup === group.key
                  ? 'border-primary bg-primary text-theme'
                  : 'theme-surface-control text-text1 hover:border-primary/50'
              }`}
              onClick={() => setActiveGroup(group)}
              data-testid={`settings-group-${group.key}`}
            >
              {group.label}
            </button>
          ))}
        </div>
        <div className="scroll-hidden flex gap-2 overflow-x-auto border-t border-primary/10 px-3 pt-2">
          {visibleMobileTabs.map((tab) => (
            <SettingsTabButton
              key={tab.key}
              active={activeTab === tab.key}
              compact
              label={tab.label}
              tabKey={tab.key}
              onClick={() => setActiveTab(tab.key)}
            />
          ))}
        </div>
      </div>

      <section
        ref={contentScrollRef}
        className="min-h-0 min-w-0 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5"
      >
        <div className="mx-auto max-w-5xl">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {currentTab && (
                  <div
                    className="h-7 w-7 shrink-0 icon-mask-default"
                    style={{
                      maskImage: `url(${tabIconMapping[currentTab.key]})`,
                      maskSize: 'contain',
                      maskRepeat: 'no-repeat',
                      maskPosition: 'center',
                    }}
                  />
                )}
                <div className="text-2xl font-bold">{currentTab?.label}</div>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-primary/80">
                {t('SettingsIntroDescription')}
              </p>
            </div>
          </div>
          <div
            ref={settingsPanelRef}
            className="theme-surface-elevated rounded-xl border p-4 sm:p-6"
            data-testid="settings-panel"
          >
            <div
              className={
                tabsWithRedundantPanelTitle.has(activeTab)
                  ? 'settings-panel-content settings-panel-content--hide-title'
                  : 'settings-panel-content'
              }
            >
              {renderTabContent()}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

const SettingsTabButton = ({
  active,
  compact = false,
  label,
  onClick,
  tabKey,
}: {
  active: boolean
  compact?: boolean
  label: string
  onClick: () => void
  tabKey: TabKey
}) => {
  return (
    <button
      className={`flex items-center rounded-lg border text-left font-medium transition ${
        compact
          ? 'h-10 shrink-0 px-3 text-sm shadow-sm'
          : 'min-h-[38px] w-full px-3 py-2 text-sm'
      } ${
        active
          ? 'border-primary bg-primary text-theme'
          : 'border-transparent bg-transparent text-text1 hover:border-primary/30 hover:bg-primary/5'
      }`}
      onClick={onClick}
      data-testid={`settings-tab-${tabKey}`}
    >
      <div
        className={`mr-2 h-5 w-5 shrink-0 ${
          active ? 'icon-mask-active' : 'icon-mask-default'
        }`}
        style={{
          maskImage: `url(${tabIconMapping[tabKey]})`,
          maskSize: 'contain',
          maskRepeat: 'no-repeat',
          maskPosition: 'center',
        }}
      />
      <span className="truncate">{label}</span>
    </button>
  )
}
