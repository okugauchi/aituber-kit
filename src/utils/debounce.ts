export const debounce = <TArgs extends unknown[]>(
  func: (...args: TArgs) => unknown,
  wait: number
): ((...args: TArgs) => void) => {
  let timeout: NodeJS.Timeout | null = null

  return (...args: TArgs) => {
    if (timeout) {
      clearTimeout(timeout)
    }

    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}
