import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  expectPersistedSetting,
  expectPersistedSlideSetting,
  gotoHome,
  openSettings,
  openSettingsTab,
  openToolsMenu,
  prepareApp,
} from './helpers/app'

const slideHtml = `
  <div class="marpit">
    <svg viewBox="0 0 1280 720"><foreignObject><section><h1>First E2E slide</h1></section></foreignObject></svg>
    <svg viewBox="0 0 1280 720"><foreignObject><section><h1>Second E2E slide</h1></section></foreignObject></svg>
  </div>
`

async function clickElementByTestId(page: Page, testId: string) {
  await page.getByTestId(testId).evaluate((element) => {
    ;(element as HTMLElement).click()
  })
}

test.beforeEach(async ({ page }) => {
  await prepareApp(page, {
    network: {
      blockExternal: true,
      mockUnhandledApi: true,
      apiMocks: {
        '/api/getSlideFolders': { json: ['demo'] },
        '/api/convertMarkdown': {
          json: {
            html: slideHtml,
            css: '',
          },
        },
        '/slides/demo/slides.md': {
          contentType: 'text/markdown; charset=utf-8',
          body: '# First E2E slide\n\n---\n\n# Second E2E slide\n',
        },
      },
    },
    settings: {
      slideMode: true, // start with slide mode enabled
      youtubeMode: false,
      gameCommentaryEnabled: false,
      selectAIService: 'openai',
      selectAIModel: 'gpt-4o',
      enableMultiModal: true,
    },
    slide: {
      selectedSlideDocs: 'demo',
    },
  })
})

test('slide controls are clickable with real mouse clicks and other UI remains interactive', async ({
  page,
}) => {
  await gotoHome(page)

  // Enable slide visibility via tools menu (slideVisible defaults to false)
  await openToolsMenu(page)
  await clickElementByTestId(page, 'slide-visibility-toggle-button')
  await expect(page.getByTestId('slide-mode-viewer')).toBeVisible()

  // Slide next/prev buttons are clickable (use element.click() to bypass
  // nextjs-portal which sits above everything in the stacking order)
  await page.getByTestId('slide-next-button').evaluate((element) => {
    ;(element as HTMLElement).click()
  })
  await expect(page.getByTestId('slide-controls')).toHaveAttribute(
    'data-current-slide',
    '1'
  )

  await page.getByTestId('slide-prev-button').evaluate((element) => {
    ;(element as HTMLElement).click()
  })
  await expect(page.getByTestId('slide-controls')).toHaveAttribute(
    'data-current-slide',
    '0'
  )

  // Slide play toggle works
  await page.getByTestId('slide-play-toggle-button').evaluate((element) => {
    ;(element as HTMLElement).click()
  })
  await expect(page.getByTestId('slide-controls')).toHaveAttribute(
    'data-playing',
    'true'
  )
  await page.getByTestId('slide-play-toggle-button').evaluate((element) => {
    ;(element as HTMLElement).click()
  })
  await expect(page.getByTestId('slide-controls')).toHaveAttribute(
    'data-playing',
    'false'
  )

  // Other UI remains clickable: settings button (programmatic click to
  // bypass nextjs-portal pointer-event interception)
  await clickElementByTestId(page, 'open-settings-button')
  await expect(page.getByTestId('settings-panel')).toBeVisible()

  await clickElementByTestId(page, 'close-settings-button')
  await expect(page.getByTestId('settings-panel')).toBeHidden()

  // Other UI remains clickable: tools menu toggle closes and reopens
  // (menu was opened earlier by openToolsMenu, so first click closes it)
  await clickElementByTestId(page, 'main-tools-toggle-button')
  await expect(page.getByTestId('main-tools-menu')).toBeHidden()
  await clickElementByTestId(page, 'main-tools-toggle-button')
  await expect(page.getByTestId('main-tools-menu')).toBeVisible()
})
