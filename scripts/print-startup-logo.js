const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

if (process.env.AITUBERKIT_NO_LOGO === '1') {
  process.exit(0)
}

const root = path.resolve(__dirname, '..')

const readPackageVersion = () => {
  const packageJsonPath = path.join(root, 'package.json')
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  return `v${packageJson.version}`
}

const readUiVersion = () => {
  const settingsPath = path.join(root, 'src/components/settings/index.tsx')
  const settingsSource = fs.readFileSync(settingsPath, 'utf8')
  const match = settingsSource.match(/ver\.\s*([0-9]+\.[0-9]+\.[0-9]+)/)
  return match ? `v${match[1]}` : null
}

const readGitVersion = () => {
  try {
    return execFileSync('git', ['describe', '--tags', '--abbrev=0'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return null
  }
}

const getVersion = () => readGitVersion() || readUiVersion() || readPackageVersion()

const main = async () => {
  const { render } = await import('oh-my-logo')
  const logo = await render('AITuberKit', {
    palette: 'ocean',
    font: 'ANSI Shadow',
    direction: 'horizontal',
  })

  console.log('')
  console.log(logo.trimEnd())
  console.log(`\nAITuberKit ${getVersion()}\n`)
}

main().catch((error) => {
  console.error('[startup-logo] failed to render logo')
  console.error(error)
  process.exit(1)
})
