import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { VideoDisplay } from '@/components/common/VideoDisplay'
import settingsStore from '@/features/stores/settings'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

const renderVideoDisplay = (
  props: Partial<React.ComponentProps<typeof VideoDisplay>> = {}
) => {
  const videoRef = React.createRef<HTMLVideoElement>()
  return render(<VideoDisplay videoRef={videoRef} {...props} />)
}

describe('VideoDisplay controls', () => {
  beforeEach(() => {
    settingsStore.setState({
      hideVideoDisplay: false,
      useVideoAsBackground: false,
    })
  })

  it('uses eye icons for display visibility', () => {
    renderVideoDisplay()

    const hideButton = screen.getByLabelText('HideVideoDisplay')
    expect(hideButton.querySelector('pixiv-icon')).toHaveAttribute(
      'name',
      '24/Show'
    )

    fireEvent.click(hideButton)

    const showButton = screen.getByLabelText('ShowVideoDisplay')
    expect(showButton.querySelector('pixiv-icon')).toHaveAttribute(
      'name',
      '24/Hide'
    )
  })

  it('uses close button for the provided stop handler', () => {
    const onClose = jest.fn()
    renderVideoDisplay({ onClose })

    fireEvent.click(screen.getByLabelText('Close'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
