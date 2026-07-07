import React, { useEffect } from 'react'
import { Header, Main, Footer } from './shell/index'

type Props = {
  onClickClose: () => void
}

const Settings = (props: Props) => {
  const { onClickClose } = props

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClickClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClickClose])

  const handleBackdropClick = (
    event: React.MouseEvent<HTMLDivElement, MouseEvent>
  ) => {
    if (event.target === event.currentTarget) {
      onClickClose()
    }
  }

  return (
    <div
      className="theme-settings-backdrop absolute z-40 h-full w-full overflow-hidden"
      onClick={handleBackdropClick}
    >
      <div className="theme-settings-shell mx-auto flex h-full w-full max-w-[1280px] flex-col overflow-hidden border-x shadow-xl backdrop-blur-sm md:my-5 md:h-[calc(100%-2.5rem)] md:w-[calc(100%-3rem)] md:rounded-xl md:border">
        <Header {...props} />
        <Main />
        <Footer />
      </div>
    </div>
  )
}
export default Settings
