import { logger } from '@/lib/logger'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import settingsStore, { PoseConfigItem } from '@/features/stores/settings'
import { MotionTagReference } from './MotionTagReference'

interface PoseFile {
  name: string
  path: string
}

export const PoseConfigSettings = () => {
  const { i18n } = useTranslation()
  const isJa = i18n.language === 'ja'
  const poseConfigs = settingsStore((s) => s.poseConfigs)
  const [poseFiles, setPoseFiles] = useState<PoseFile[]>([])
  const [newId, setNewId] = useState('')
  const [newJson, setNewJson] = useState('')
  const [newSeqId, setNewSeqId] = useState('')
  const [selectedSeqJsons, setSelectedSeqJsons] = useState<string[]>([])
  const [newSwitchDuration, setNewSwitchDuration] = useState(0.5)

  useEffect(() => {
    fetch('/api/get-pose-list')
      .then((res) => res.json())
      .then((files: PoseFile[]) => setPoseFiles(files))
      .catch((error) => {
        logger.error('Error fetching pose list:', error)
      })
  }, [])

  const handleDelete = (id: string) => {
    settingsStore.setState({
      poseConfigs: poseConfigs.filter((p) => p.id !== id),
    })
  }

  const handleMove = (id: string, direction: 'up' | 'down') => {
    const index = poseConfigs.findIndex((p) => p.id === id)
    if (index === -1) return
    if (direction === 'up' && index === 0) return
    if (direction === 'down' && index === poseConfigs.length - 1) return

    const newConfigs = [...poseConfigs]
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    ;[newConfigs[index], newConfigs[swapIndex]] = [
      newConfigs[swapIndex],
      newConfigs[index],
    ]
    settingsStore.setState({ poseConfigs: newConfigs })
  }

  const handleAddPose = () => {
    if (!newId.trim() || !newJson) return
    const id = newId.trim()
    if (poseConfigs.some((p) => p.id === id)) return
    const newConfig: PoseConfigItem = {
      id: newId.trim(),
      json: newJson,
    }
    settingsStore.setState({
      poseConfigs: [...poseConfigs, newConfig],
    })
    setNewId('')
    setNewJson('')
  }

  const handleAddSequence = () => {
    if (!newSeqId.trim() || selectedSeqJsons.length < 2) return
    const seqId = newSeqId.trim()
    if (poseConfigs.some((p) => p.id === seqId)) return
    const clampedDuration = Math.min(5, Math.max(0.1, newSwitchDuration))
    const newConfig: PoseConfigItem = {
      id: seqId,
      sequence: selectedSeqJsons,
      switchDuration: clampedDuration,
    }
    settingsStore.setState({
      poseConfigs: [...poseConfigs, newConfig],
    })
    setNewSeqId('')
    setSelectedSeqJsons([])
    setNewSwitchDuration(0.5)
  }

  const toggleSeqJson = (jsonPath: string) => {
    setSelectedSeqJsons((prev) =>
      prev.includes(jsonPath)
        ? prev.filter((p) => p !== jsonPath)
        : [...prev, jsonPath]
    )
  }

  return (
    <div className="my-6">
      <div className="text-xl font-bold mb-4">
        {isJa ? 'ポーズ設定' : 'Pose Settings'}
      </div>
      <div className="mb-4 text-sm">
        {isJa
          ? 'ポーズ調整モードで表示されるポーズの追加・削除・並べ替えができます。'
          : 'Add, remove, and reorder poses displayed in pose adjustment mode.'}
      </div>

      {/* 既存ポーズ一覧 */}
      {poseConfigs.length > 0 && (
        <div className="space-y-2 mb-6">
          {poseConfigs.map((config, index) => (
            <div
              key={config.id}
              className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{config.id}</div>
                <div className="text-xs text-gray-500 truncate">
                  {'json' in config
                    ? config.json
                    : `${isJa ? 'シーケンス' : 'Sequence'}: ${config.sequence.join(', ')} (${config.switchDuration}${isJa ? '秒' : 's'})`}
                </div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => handleMove(config.id, 'up')}
                  disabled={index === 0}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-30"
                >
                  ▲
                </button>
                <button
                  onClick={() => handleMove(config.id, 'down')}
                  disabled={index === poseConfigs.length - 1}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded disabled:opacity-30"
                >
                  ▼
                </button>
                <button
                  onClick={() => handleDelete(config.id)}
                  className="px-2 py-1 text-xs bg-red-100 hover:bg-red-200 text-red-600 rounded"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 通常ポーズ追加 */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="font-bold text-sm mb-2">
          {isJa ? '通常ポーズを追加' : 'Add Pose'}
        </div>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="block text-xs mb-1">ID</label>
            <input
              type="text"
              value={newId}
              onChange={(e) => setNewId(e.target.value)}
              placeholder={isJa ? '例: think' : 'e.g. think'}
              className="w-full px-3 py-2 bg-white rounded-lg text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs mb-1">
              {isJa ? 'JSONファイル' : 'JSON File'}
            </label>
            <select
              value={newJson}
              onChange={(e) => {
                setNewJson(e.target.value)
                if (e.target.value && !newId.trim()) {
                  const fileName = e.target.value.split('/').pop() ?? ''
                  setNewId(fileName.replace('.json', ''))
                }
              }}
              className="w-full px-3 py-2 bg-white rounded-lg text-sm"
            >
              <option value="">{isJa ? '選択してください' : 'Select'}</option>
              {poseFiles.map((f) => (
                <option key={f.path} value={f.path}>
                  {f.name}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleAddPose}
            disabled={
              !newId.trim() ||
              !newJson ||
              poseConfigs.some((p) => p.id === newId.trim())
            }
            className="px-4 py-2 bg-primary text-theme rounded-lg text-sm font-bold disabled:opacity-40"
          >
            {isJa ? '追加' : 'Add'}
          </button>
        </div>
      </div>

      {/* シーケンス追加 */}
      <div className="p-4 bg-gray-50 rounded-lg">
        <div className="font-bold text-sm mb-2">
          {isJa ? 'シーケンスポーズを追加' : 'Add Sequence Pose'}
        </div>
        <div className="mb-3">
          <label className="block text-xs mb-1">ID</label>
          <input
            type="text"
            value={newSeqId}
            onChange={(e) => setNewSeqId(e.target.value)}
            placeholder={isJa ? '例: wave' : 'e.g. wave'}
            className="w-full px-3 py-2 bg-white rounded-lg text-sm"
          />
        </div>
        <div className="mb-3">
          <label className="block text-xs mb-1">
            {isJa ? 'JSONファイル（2つ以上選択）' : 'JSON Files (select 2+)'}
          </label>
          <div className="flex flex-wrap gap-2">
            {poseFiles.map((f) => (
              <label
                key={f.path}
                className="flex items-center gap-1 px-2 py-1 bg-white rounded text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedSeqJsons.includes(f.path)}
                  onChange={() => toggleSeqJson(f.path)}
                  className="h-4 w-4"
                />
                {f.name}
              </label>
            ))}
          </div>
        </div>
        <div className="flex gap-2 items-end">
          <div>
            <label className="block text-xs mb-1">
              {isJa ? '遷移時間（秒）' : 'Transition (sec)'}
            </label>
            <input
              type="number"
              value={newSwitchDuration}
              onChange={(e) =>
                setNewSwitchDuration(parseFloat(e.target.value) || 0.5)
              }
              min="0.1"
              max="5"
              step="0.1"
              className="w-24 px-3 py-2 bg-white rounded-lg text-sm"
            />
          </div>
          <button
            onClick={handleAddSequence}
            disabled={!newSeqId.trim() || selectedSeqJsons.length < 2}
            className="px-4 py-2 bg-primary text-theme rounded-lg text-sm font-bold disabled:opacity-40"
          >
            {isJa ? '追加' : 'Add'}
          </button>
        </div>
      </div>

      {/* モーションタグ参照 */}
      {poseConfigs.length > 0 && (
        <MotionTagReference poseConfigs={poseConfigs} />
      )}
    </div>
  )
}
