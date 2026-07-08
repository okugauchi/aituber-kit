import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SlideState {
  isPlaying: boolean
  currentSlide: number
  selectedSlideDocs: string
}

const slideStore = create<SlideState>()(
  persist(
    (set, get) => ({
      isPlaying: false,
      currentSlide: 0,
      selectedSlideDocs: '',
    }),
    {
      name: 'aitube-kit-slide',
      partialize: (state) => ({ selectedSlideDocs: state.selectedSlideDocs }),
    }
  )
)

/** 指定したスライド番号へ移動する */
export const goToSlide = (index: number) => {
  slideStore.setState({
    currentSlide: index,
  })
}

export default slideStore
