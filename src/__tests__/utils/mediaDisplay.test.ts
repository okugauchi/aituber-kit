import { fitDimensionsWithinBounds } from '@/utils/mediaDisplay'

describe('fitDimensionsWithinBounds', () => {
  it('fits wide media to the maximum width', () => {
    expect(fitDimensionsWithinBounds(2000, 1000, 512, 384)).toEqual({
      width: 512,
      height: 256,
    })
  })

  it('fits tall media to the maximum height', () => {
    expect(fitDimensionsWithinBounds(900, 1600, 512, 384)).toEqual({
      width: 216,
      height: 384,
    })
  })

  it('returns bounds when input dimensions are invalid', () => {
    expect(fitDimensionsWithinBounds(0, 0, 512, 384)).toEqual({
      width: 512,
      height: 384,
    })
  })
})
