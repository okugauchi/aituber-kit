import settingsStore from '@/features/stores/settings'
import { EMOTIONS } from '@/features/messages/messages'

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')

const emotionPattern = new RegExp(
  `\\\\[(${EMOTIONS.map(escapeRegExp).join('|')})\\\\]`,
  'gi'
)

export const AssistantText = ({ message }: { message: string }) => {
  const characterName = settingsStore((s) => s.characterName)
  const showCharacterName = settingsStore((s) => s.showCharacterName)
  const assistantTextStyle = settingsStore((s) => s.assistantTextStyle)
  const showPresetQuestions = settingsStore((s) => s.showPresetQuestions)
  const presetQuestions = settingsStore((s) => s.presetQuestions)
  const uiDropShadowEnabled = settingsStore((s) => s.uiDropShadowEnabled)

  // Check if preset questions should be shown AND there are actual questions
  const shouldShowPresetQuestions =
    showPresetQuestions && presetQuestions.length > 0
  const sanitizedMessage = message
    .replace(emotionPattern, '')
    .replace(/\\[motion:[^\\]]*\\]/gi, '')

  if (assistantTextStyle === 'borderless') {
    return (
      <div
        data-ui3d-id="assistantText"
        className={`aurora-scrim pointer-events-none absolute bottom-0 left-0 z-10 w-full px-4 pt-16 ${shouldShowPresetQuestions ? 'pb-[150px] sm:pb-[182px]' : 'pb-[86px] sm:pb-[104px]'}`}
      >
        <div className="animate-aurora-bubble-in mx-auto flex w-full max-w-[90vw] flex-col items-center gap-1.5">
          {showCharacterName && (
            <span className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/65">
              {characterName}
            </span>
          )}
          <p className="text-center text-base font-medium leading-[1.7] text-white [text-shadow:0_2px_12px_rgba(0,0,0,0.6)] sm:text-lg">
            {sanitizedMessage}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      data-ui3d-id="assistantText"
      className={`absolute bottom-0 left-1/2 z-10 flex w-full max-w-[90vw] -translate-x-1/2 justify-center px-3 ${shouldShowPresetQuestions ? 'mb-[150px] sm:mb-[182px]' : 'mb-[86px] sm:mb-[104px]'}`}
      // CSS Anchor Positioning: when the #character-anchor element exists
      // (created by vrmViewer.tsx), the bubble follows the VRM character's
      // screen position. Falls back to standard positioning otherwise.
      style={
        {
          // Use anchor() if supported (Baseline 2026: Chrome 125+, Firefox 132+, Safari 18.2+)
          // The anchor element #character-anchor tracks the VRM head position
          // in viewport-percent coordinates every frame.
          position: 'fixed' as const,
          left: 'anchor(--character left)' as unknown as '50%',
          bottom: 'anchor(--character top)' as unknown as undefined,
          transform: 'translateX(-50%)' as unknown as undefined,
        } as React.CSSProperties & {
          left?: string
          bottom?: string
          transform?: string
        }
      }
    >
      <div
        className={`${uiDropShadowEnabled ? 'ui-shadow' : ''} animate-aurora-bubble-in aurora-glass-bubble flex w-full flex-col items-start gap-1.5 rounded-[20px] px-[22px] pb-4 pt-3.5`}
      >
        {showCharacterName && (
          <span className="rounded-full bg-primary px-2.5 py-[3px] text-[11px] font-bold tracking-[0.06em] text-white">
            {characterName}
          </span>
        )}
        <div className="text-base font-medium leading-[1.75] text-[var(--aurora-text-strong)]">
          {sanitizedMessage}
        </div>
      </div>
    </div>
  )
}
