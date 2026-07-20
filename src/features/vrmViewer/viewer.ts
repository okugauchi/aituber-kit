import * as THREE from 'three'
import { Model } from './model'
import { loadVRMAnimation } from '@/lib/VRMAnimation/loadVRMAnimation'
import { buildUrl } from '@/utils/buildUrl'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { HTMLMesh } from 'three/examples/jsm/interactive/HTMLMesh.js'
import settingsStore from '@/features/stores/settings'
import homeStore from '@/features/stores/home'
import { reportViewerError } from '@/components/common/ErrorBoundary'

/**
 * three.jsを使った3Dビューワー
 *
 * setup()でcanvasを渡してから使う
 */
export class Viewer {
  public isReady: boolean
  public model?: Model
  public onModelLoadingChange?: (isLoading: boolean) => void

  private _renderer?: THREE.WebGLRenderer
  private _clock: THREE.Clock
  private _scene: THREE.Scene
  private _camera?: THREE.PerspectiveCamera
  private _cameraControls?: OrbitControls
  private _directionalLight?: THREE.DirectionalLight
  private _ambientLight?: THREE.AmbientLight
  private _loadVrmRequestId = 0
  private _sparkRenderer: any | null = null
  private _splatMesh: any | null = null
  /** Saved initial splat state for reset-to-initial-position */
  private _initialSplatState: {
    position: THREE.Vector3
    scale: THREE.Vector3
    quaternion: THREE.Quaternion
  } | null = null
  /** HDRI background texture loaded via RGBELoader */
  private _hdriTexture: THREE.Texture | null = null
  /** HTMLMesh instances for 3D UI rendering (html-in-canvas / hybrid mode) */
  private _ui3dMeshes: HTMLMesh[] = []
  /** Current ui3dMode to avoid redundant rebuilds */
  private _currentUi3dMode: string | null = null

  constructor() {
    this.isReady = false

    // scene
    const scene = new THREE.Scene()
    this._scene = scene

    // light
    const lightingIntensity = settingsStore.getState().lightingIntensity
    this._directionalLight = new THREE.DirectionalLight(
      0xffffff,
      1.8 * lightingIntensity
    )
    this._directionalLight.position.set(1.0, 1.0, 1.0).normalize()
    scene.add(this._directionalLight)

    this._ambientLight = new THREE.AmbientLight(
      0xffffff,
      1.2 * lightingIntensity
    )
    scene.add(this._ambientLight)

    // animate
    this._clock = new THREE.Clock()
    this._clock.start()
  }

  /** Get the VRM avatar's foot reference position (center between left/right feet on ground plane).
   *  Falls back to origin (0,0,0) if VRM foot bones are unavailable. */
  private _getFootReferencePosition(): THREE.Vector3 {
    if (this.model?.vrm?.humanoid) {
      const leftFoot = this.model.vrm.humanoid.getNormalizedBoneNode('leftFoot')
      const rightFoot =
        this.model.vrm.humanoid.getNormalizedBoneNode('rightFoot')
      if (leftFoot && rightFoot) {
        const leftPos = new THREE.Vector3()
        const rightPos = new THREE.Vector3()
        leftFoot.getWorldPosition(leftPos)
        rightFoot.getWorldPosition(rightPos)
        return new THREE.Vector3(
          (leftPos.x + rightPos.x) / 2,
          0, // feet are at ground level (y=0)
          (leftPos.z + rightPos.z) / 2
        )
      }
    }
    return new THREE.Vector3(0, 0, 0)
  }

  public loadVrm(url: string): Promise<void> {
    const requestId = ++this._loadVrmRequestId
    this.onModelLoadingChange?.(true)

    if (this.model?.vrm) {
      this.unloadVRM()
    }

    // gltf and vrm
    const model = new Model(this._camera || new THREE.Object3D())
    this.model = model
    return model
      .loadVRM(url)
      .then(async () => {
        if (this.model !== model || !model.vrm) {
          model.unLoadVrm()
          return
        }

        // Disable frustum culling
        model.vrm.scene.traverse((obj) => {
          obj.frustumCulled = false
        })

        model.vrm.scene.visible = false
        this._scene.add(model.vrm.scene)

        try {
          const vrma = await loadVRMAnimation(buildUrl('/idle_loop.vrma'))
          if (vrma) model.loadAnimation(vrma)
        } finally {
          model.vrm.scene.visible = true
        }

        // HACK: アニメーションの原点がずれているので再生後にカメラ位置を調整する
        requestAnimationFrame(() => {
          this.resetCamera()
        })
      })
      .catch((error) => {
        // 非同期のロード失敗はErrorBoundaryに届かないため、ここから直接通知する
        reportViewerError('vrm-viewer', 'Failed to load VRM:', error)
      })
      .finally(() => {
        if (requestId === this._loadVrmRequestId) {
          this.onModelLoadingChange?.(false)
        }
      })
  }

  public unloadVRM(): void {
    if (this.model?.vrm) {
      this._scene.remove(this.model.vrm.scene)
      this.model?.unLoadVrm()
    }
  }

  /**
   * Reactで管理しているCanvasを後から設定する
   */
  public setup(canvas: HTMLCanvasElement) {
    const parentElement = canvas.parentElement
    const width = parentElement?.clientWidth || canvas.width
    const height = parentElement?.clientHeight || canvas.height
    // renderer
    this._renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
    })
    this._renderer.setSize(width, height)
    this._renderer.setPixelRatio(window.devicePixelRatio)

    // camera
    this._camera = new THREE.PerspectiveCamera(20.0, width / height, 0.1, 20.0)
    this._camera.position.set(0, 1.3, 1.5)
    this._cameraControls?.target.set(0, 1.3, 0)
    this._cameraControls?.update()
    // camera controls
    this._cameraControls = new OrbitControls(
      this._camera,
      this._renderer.domElement
    )
    this._cameraControls.screenSpacePanning = true
    this._cameraControls.update()

    // Listen for position lock changes
    this._cameraControls.addEventListener('end', () => {
      if (!settingsStore.getState().fixedCharacterPosition) {
        this.saveCameraPosition()
      }
    })

    window.addEventListener('resize', () => {
      this.resize()
    })
    this.isReady = true
    this.update()

    // Restore saved position if available
    this.restoreCameraPosition()
  }

  /**
   * canvasの親要素を参照してサイズを変更する
   */
  public resize() {
    if (!this._renderer) return

    const parentElement = this._renderer.domElement.parentElement
    if (!parentElement) return

    this._renderer.setPixelRatio(window.devicePixelRatio)
    this._renderer.setSize(
      parentElement.clientWidth,
      parentElement.clientHeight
    )

    if (!this._camera) return
    this._camera.aspect = parentElement.clientWidth / parentElement.clientHeight
    this._camera.updateProjectionMatrix()
  }

  /**
   * VRMのheadノードを参照してカメラ位置を調整する
   */
  public resetCamera() {
    const { fixedCharacterPosition } = settingsStore.getState()
    // If position is fixed, restore saved position instead of auto-adjusting
    if (fixedCharacterPosition) {
      this.restoreCameraPosition()
      return
    }

    const headNode = this.model?.vrm?.humanoid.getNormalizedBoneNode('head')

    if (headNode) {
      const headWPos = headNode.getWorldPosition(new THREE.Vector3())
      this._camera?.position.set(
        this._camera.position.x,
        headWPos.y,
        this._camera.position.z
      )
      this._cameraControls?.target.set(headWPos.x, headWPos.y, headWPos.z)
      this._cameraControls?.update()
    }
  }

  /** Callback fired every frame with the VRM character's screen-space position
   *  (normalized -1..1 coordinates, or pixel coordinates). Used by CSS Anchor
   *  Positioning bridge in vrmViewer.tsx. */
  public onCharacterScreenPosition?:
    ((x: number, y: number) => void) | null

  public update = () => {
    requestAnimationFrame(this.update)
    const delta = this._clock.getDelta()
    // update vrm components
    if (this.model) {
      this.model.update(delta)
    }

    if (this._renderer && this._camera) {
      this._renderer.render(this._scene, this._camera)
    }

    // Fire screen-space position callback for CSS Anchor Positioning bridge
    if (this.onCharacterScreenPosition && this._camera && this.model?.vrm) {
      const headNode = this.model.vrm.humanoid.getNormalizedBoneNode('head')
      if (headNode) {
        const worldPos = new THREE.Vector3()
        headNode.getWorldPosition(worldPos)
        const screenPos = worldPos.clone().project(this._camera)
        // Normalized coordinates: -1..1, flip Y for CSS
        this.onCharacterScreenPosition(screenPos.x, 1 - screenPos.y)
      }
    }
  }

  /** Get the VRM character's head position projected to screen-space.
   *  Returns null if VRM or camera is not ready. Used externally for CSS
   *  Anchor Positioning. */
  public getCharacterScreenPosition(): { x: number; y: number } | null {
    if (!this._camera || !this.model?.vrm) return null
    const headNode = this.model.vrm.humanoid.getNormalizedBoneNode('head')
    if (!headNode) return null
    const worldPos = new THREE.Vector3()
    headNode.getWorldPosition(worldPos)
    const screenPos = worldPos.clone().project(this._camera)
    return { x: screenPos.x, y: 1 - screenPos.y }
  }

  /**
   * 現在のカメラ位置を設定に保存する
   */
  public saveCameraPosition() {
    if (!this._camera || !this._cameraControls) return

    const settings = settingsStore.getState()
    settingsStore.setState({
      characterPosition: {
        x: this._camera.position.x,
        y: this._camera.position.y,
        z: this._camera.position.z,
        scale: settings.characterPosition?.scale ?? 1,
      },
      characterRotation: {
        x: this._cameraControls.target.x,
        y: this._cameraControls.target.y,
        z: this._cameraControls.target.z,
      },
    })
  }

  /**
   * 保存されたカメラ位置を復元する
   */
  public restoreCameraPosition() {
    if (!this._camera || !this._cameraControls) return

    const { characterPosition, characterRotation, fixedCharacterPosition } =
      settingsStore.getState()

    if (
      fixedCharacterPosition &&
      (characterPosition.x !== 0 ||
        characterPosition.y !== 0 ||
        characterPosition.z !== 0)
    ) {
      this._camera.position.set(
        characterPosition.x,
        characterPosition.y,
        characterPosition.z
      )
      this._cameraControls.target.set(
        characterRotation.x,
        characterRotation.y,
        characterRotation.z
      )
      this._cameraControls.update()
    }
  }

  /**
   * カメラ位置を固定する
   */
  public fixCameraPosition() {
    this.saveCameraPosition()
    settingsStore.setState({ fixedCharacterPosition: true })
    if (this._cameraControls) {
      this._cameraControls.enabled = false
    }
  }

  /**
   * カメラ位置の固定を解除する
   */
  public unfixCameraPosition() {
    settingsStore.setState({ fixedCharacterPosition: false })
    if (this._cameraControls) {
      this._cameraControls.enabled = true
    }
  }

  /**
   * カメラ位置をリセットする
   */
  public resetCameraPosition() {
    settingsStore.setState({
      fixedCharacterPosition: false,
      characterPosition: { x: 0, y: 0, z: 0, scale: 1 },
      characterRotation: { x: 0, y: 0, z: 0 },
    })
    if (this._cameraControls) {
      this._cameraControls.enabled = true
    }
    this.resetCamera()
  }

  /**
   * ライトの強度を更新する
   */
  public updateLightingIntensity(intensity: number) {
    if (this._directionalLight) {
      this._directionalLight.intensity = 1.8 * intensity
    }
    if (this._ambientLight) {
      this._ambientLight.intensity = 1.2 * intensity
    }
  }

  // 3D Gaussian Splatting (Spark) integration
  public async loadSplatScene(url: string, opacity?: number): Promise<void> {
    const renderer = this._renderer
    if (!renderer) {
      const msg = 'Renderer not initialized — call setup() first'
      homeStore.setState({
        gaussianSplatError: msg,
        gaussianSplatLoading: false,
      })
      return
    }
    try {
      homeStore.setState({
        gaussianSplatLoading: true,
        gaussianSplatProgress: 0,
        gaussianSplatError: null,
      })
      const { SparkRenderer, SplatMesh } = await import('@sparkjsdev/spark')
      this.unloadSplatScene()

      this._sparkRenderer = new SparkRenderer({ renderer })
      this._scene.add(this._sparkRenderer)

      const mesh = new SplatMesh({
        url,
        onProgress: (event: ProgressEvent) => {
          if (event.total > 0) {
            const pct = Math.min(
              99,
              Math.round((event.loaded / event.total) * 100)
            )
            homeStore.setState({ gaussianSplatProgress: pct })
          }
        },
        onLoad: () => {
          homeStore.setState({
            gaussianSplatLoading: false,
            gaussianSplatProgress: 100,
          })
          // Place splat scene grounded at VRM avatar's feet reference position
          if (this._camera) {
            const bbox = mesh.getBoundingBox()
            const bboxSize = new THREE.Vector3()
            bbox.getSize(bboxSize)
            const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z)
            // Use VRM foot reference position (feet center on ground plane)
            const footRef = this._getFootReferencePosition()
            const fx = footRef.x
            const fz = footRef.z
            if (maxDim > 0) {
              // Use store scale (default 1.0 = real-world capture scale)
              const scale = homeStore.getState().gaussianSplatScale ?? 1.0
              mesh.scale.set(scale, scale, scale)
              // Apply rotation offset for axis correction (e.g., House.sog needs roll 180°)
              mesh.quaternion.set(0, 0, 0, 1)
              const rotOffset = homeStore.getState()
                .gaussianSplatRotationOffset ?? [0, 0, 0]
              if (
                rotOffset[0] !== 0 ||
                rotOffset[1] !== 0 ||
                rotOffset[2] !== 0
              ) {
                const qRoll = new THREE.Quaternion().setFromAxisAngle(
                  new THREE.Vector3(0, 0, 1),
                  rotOffset[0]
                )
                const qPitch = new THREE.Quaternion().setFromAxisAngle(
                  new THREE.Vector3(1, 0, 0),
                  rotOffset[1]
                )
                const qYaw = new THREE.Quaternion().setFromAxisAngle(
                  new THREE.Vector3(0, 1, 0),
                  rotOffset[2]
                )
                mesh.quaternion.multiply(qRoll)
                mesh.quaternion.multiply(qPitch)
                mesh.quaternion.multiply(qYaw)
              }
              // Ground-align: bottom of bounding box at y=0
              const bboxMin = new THREE.Vector3()
              bboxMin.copy(bbox.min)
              const bboxCenter = new THREE.Vector3()
              bbox.getCenter(bboxCenter)
              mesh.position.set(
                fx - bboxCenter.x * scale,
                -bboxMin.y * scale, // bottom of bbox → y=0
                fz - bboxCenter.z * scale
              )
              // Save initial state for reset
              this._initialSplatState = {
                position: mesh.position.clone(),
                scale: mesh.scale.clone(),
                quaternion: mesh.quaternion.clone(),
              }
            }
          }
          // Smooth fade-in: start at 0, animate to target opacity
          mesh.opacity = 0
          const target = opacity ?? 1.0
          const startTime = performance.now()
          const duration = 600 // ms
          const fade = () => {
            const elapsed = performance.now() - startTime
            const t = Math.min(1, elapsed / duration)
            // Ease-out cubic
            const ease = 1 - Math.pow(1 - t, 3)
            mesh.opacity = ease * target
            if (t < 1) requestAnimationFrame(fade)
          }
          requestAnimationFrame(fade)
        },
      })
      mesh.opacity = 0 // Start invisible, fade in on load
      this._splatMesh = mesh
      this._scene.add(mesh)
    } catch (error) {
      homeStore.setState({ gaussianSplatLoading: false })
      const msg =
        error instanceof Error
          ? error.message
          : 'Unknown error loading 3DGS scene'
      homeStore.setState({ gaussianSplatError: msg })
      reportViewerError('3dgs-viewer', 'Failed to load 3DGS scene:', error)
    }
  }

  public setSplatOpacity(opacity: number): void {
    if (this._splatMesh) {
      this._splatMesh.opacity = opacity
    }
  }

  /** Set uniform scale on the splat mesh (1.0 = real-world capture scale). */
  public setSplatScale(scale: number): void {
    if (this._splatMesh) {
      this._splatMesh.scale.set(scale, scale, scale)
    }
  }

  /** Rotate the HDRI background horizontally using scene.backgroundRotation.
   *  Three.js applies this as a mat3 rotation to the cube-map direction
   *  in the background shader, so it works regardless of how the texture
   *  was converted internally.
   *  @param degrees  — angle in degrees, -180 to +180. 0 = default. */
  public setSplatHdriRotation(degrees: number): void {
    // Y-axis rotation for horizontal panorama rotation
    this._scene.backgroundRotation.set(0, (degrees * Math.PI) / 180, 0)
  }

  /** Move the splat mesh independently of the VRM camera.
   *  Step size is proportional to current scale so movement feels consistent. */
  public moveSplat(dx: number, dy: number, dz: number): void {
    if (this._splatMesh) {
      const step = this._splatMesh.scale.x * 0.05
      this._splatMesh.position.x += dx * step
      this._splatMesh.position.y += dy * step
      this._splatMesh.position.z += dz * step
    }
  }

  /** Zoom the splat mesh (scale) independently of the VRM camera */
  public zoomSplat(factor: number): void {
    if (this._splatMesh) {
      const s = this._splatMesh.scale.x * factor
      this._splatMesh.scale.set(s, s, s)
    }
  }

  /**
   * Rotate the splat mesh around its local axes independently of the VRM camera.
   * @param roll  — rotation around local Z axis (tilt left/right), in radians
   * @param pitch — rotation around local X axis (tilt forward/backward), in radians
   * @param yaw   — rotation around local Y axis (turn left/right), in radians
   */
  public rotateSplat(roll: number, pitch: number, yaw: number): void {
    if (this._splatMesh) {
      // Use quaternion multiplication for proper Euler composition
      const q = new THREE.Quaternion()
      const qRoll = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        roll
      )
      const qPitch = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        pitch
      )
      const qYaw = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        yaw
      )
      // Apply in Z-X-Y order (roll, pitch, yaw) relative to current orientation
      q.multiply(qRoll)
      q.multiply(qPitch)
      q.multiply(qYaw)
      this._splatMesh.quaternion.multiply(q)
    }
  }

  /** Fit splat scene centered in viewport (VRM camera target). Resets rotation. */
  public fitSplatToViewport(): void {
    if (this._splatMesh && this._camera) {
      const bbox = this._splatMesh.getBoundingBox()
      const bboxSize = new THREE.Vector3()
      bbox.getSize(bboxSize)
      const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z)

      if (maxDim > 0) {
        const target = this._cameraControls?.target
        const tx = target?.x ?? 0
        const ty = target?.y ?? 1.3
        const tz = target?.z ?? 0

        const fov = this._camera.fov * (Math.PI / 180)
        const camDist = this._camera.position.distanceTo(
          target || new THREE.Vector3(tx, ty, tz)
        )
        const visibleHeight = 2 * camDist * Math.tan(fov / 2)
        const visibleWidth = visibleHeight * this._camera.aspect
        const visibleMax = Math.max(visibleWidth, visibleHeight)
        const scale = (visibleMax / maxDim) * 0.9

        this._splatMesh.scale.set(scale, scale, scale)
        this._splatMesh.quaternion.set(0, 0, 0, 1)
        const center = new THREE.Vector3()
        bbox.getCenter(center)
        this._splatMesh.position.set(
          tx - center.x * scale,
          ty - center.y * scale,
          tz - center.z * scale
        )
      }
    }
  }

  /** Reset splat to its initial position (grounded at VRM avatar's feet reference).
   *  Uses the saved initial state if available, otherwise recomputes from foot reference. */
  public resetSplatToInitialPosition(): void {
    if (!this._splatMesh) return

    // If we have a saved initial state, use it directly for exact restoration
    if (this._initialSplatState) {
      this._splatMesh.position.copy(this._initialSplatState.position)
      this._splatMesh.scale.copy(this._initialSplatState.scale)
      this._splatMesh.quaternion.copy(this._initialSplatState.quaternion)
      return
    }

    // Fallback: recompute from foot reference (same logic as onLoad)
    if (this._camera) {
      const bbox = this._splatMesh.getBoundingBox()
      const bboxSize = new THREE.Vector3()
      bbox.getSize(bboxSize)
      const maxDim = Math.max(bboxSize.x, bboxSize.y, bboxSize.z)

      if (maxDim > 0) {
        const footRef = this._getFootReferencePosition()
        const fx = footRef.x
        const fz = footRef.z

        const fov = this._camera.fov * (Math.PI / 180)
        const camDist = this._camera.position.distanceTo(
          this._cameraControls?.target || new THREE.Vector3(fx, 1.3, fz)
        )
        const visibleHeight = 2 * camDist * Math.tan(fov / 2)
        const visibleWidth = visibleHeight * this._camera.aspect
        const scale = (visibleWidth / maxDim) * 0.9

        this._splatMesh.scale.set(scale, scale, scale)
        this._splatMesh.quaternion.set(0, 0, 0, 1)
        const bboxMin = new THREE.Vector3()
        bboxMin.copy(bbox.min)
        const bboxCenter = new THREE.Vector3()
        bbox.getCenter(bboxCenter)
        this._splatMesh.position.set(
          fx - bboxCenter.x * scale,
          -bboxMin.y * scale, // bottom of bbox → y=0
          fz - bboxCenter.z * scale
        )
      }
    }
  }

  /** Alias kept for backward compatibility */
  public resetSplatToGround(): void {
    this.resetSplatToInitialPosition()
  }

  /** Alias kept for backward compatibility — delegates to fitSplatToViewport */
  public resetSplatPosition(): void {
    this.fitSplatToViewport()
  }

  /** Load an equirectangular image as the scene background for immersive 3DGS backdrop.
   *  Uses RGBELoader for .hdr/.exr, TextureLoader for .jpg/.png/.jpeg.
   *  Pass a URL to the file. */
  public async loadSplatHdri(url: string): Promise<void> {
    homeStore.setState({
      gaussianSplatHdriLoading: true,
      gaussianSplatHdriError: null,
    })
    try {
      const ext = url.toLowerCase().split('?')[0].split('#')[0]
      const isHdr = ext.endsWith('.hdr') || ext.endsWith('.exr')

      let texture: THREE.Texture
      if (isHdr) {
        const { RGBELoader } =
          await import('three/examples/jsm/loaders/RGBELoader.js')
        const loader = new RGBELoader()
        texture = await loader.loadAsync(url)
      } else {
        const { TextureLoader } = await import('three')
        const loader = new TextureLoader()
        texture = await loader.loadAsync(url)
      }
      texture.mapping = THREE.EquirectangularReflectionMapping
      // Dispose previous HDRI if present
      this.unloadSplatHdri()
      this._hdriTexture = texture
      this._scene.background = texture
      this._scene.environment = texture
      // Apply stored rotation to the background
      const initRot = homeStore.getState().gaussianSplatHdriRotation ?? 0
      this.setSplatHdriRotation(initRot)
      homeStore.setState({ gaussianSplatHdriLoading: false })
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Unknown error loading HDRI'
      homeStore.setState({
        gaussianSplatHdriLoading: false,
        gaussianSplatHdriError: msg,
      })
      reportViewerError('3dgs-viewer', 'Failed to load HDRI:', error)
    }
  }

  /** Remove the HDRI background texture and restore the original scene background. */
  public unloadSplatHdri(): void {
    if (this._hdriTexture) {
      this._hdriTexture.dispose()
      this._hdriTexture = null
    }
    this._scene.background = null
    this._scene.environment = null
    homeStore.setState({
      gaussianSplatHdriUrl: '',
      gaussianSplatHdriError: null,
    })
  }

  public unloadSplatScene(): void {
    if (this._splatMesh) {
      this._scene.remove(this._splatMesh)
      this._splatMesh = null
    }
    if (this._sparkRenderer) {
      this._scene.remove(this._sparkRenderer)
      this._sparkRenderer = null
    }
    this.unloadSplatHdri()
    homeStore.setState({
      gaussianSplatLoading: false,
      gaussianSplatError: null,
    })
  }

  // ─── HTML-in-Canvas / 3D UI Integration ───

  /**
   * Create an HTMLMesh from a DOM element and add it to the scene.
   * The mesh renders the element as a canvas texture in the 3D scene.
   * Returns the created mesh, or null if renderer is not ready.
   */
  public addUi3dMesh(domElement: HTMLElement, options?: {
    position?: THREE.Vector3
    scale?: number
    rotation?: THREE.Euler
  }): HTMLMesh | null {
    if (!this._renderer) return null
    const mesh = new HTMLMesh(domElement)
    if (options?.position) mesh.position.copy(options.position)
    if (options?.scale) mesh.scale.set(options.scale, options.scale, options.scale)
    if (options?.rotation) mesh.rotation.copy(options.rotation)
    this._scene.add(mesh)
    this._ui3dMeshes.push(mesh)
    return mesh
  }

  /** Remove a specific HTMLMesh instance from the scene. */
  public removeUi3dMesh(mesh: HTMLMesh): void {
    const idx = this._ui3dMeshes.indexOf(mesh)
    if (idx >= 0) {
      this._ui3dMeshes.splice(idx, 1)
    }
    this._scene.remove(mesh)
    mesh.dispose()
  }

  /** Remove all HTMLMesh instances (called on mode switch or teardown). */
  public clearAllUi3dMeshes(): void {
    for (const mesh of this._ui3dMeshes) {
      this._scene.remove(mesh)
      mesh.dispose()
    }
    this._ui3dMeshes = []
    this._currentUi3dMode = null
  }

  /**
   * Build or rebuild 3D UI meshes based on the current ui3dMode.
   * Called from vrmViewer.tsx when mode changes.
   * @param mode  — 'css-overlay' | 'html-in-canvas' | 'hybrid'
   * @param elements — map of element id → { dom, position, scale, rotation }
   */
  public syncUi3dMode(
    mode: 'css-overlay' | 'html-in-canvas' | 'hybrid',
    elements: Record<string, {
      dom: HTMLElement
      position: THREE.Vector3
      scale?: number
      rotation?: THREE.Euler
    }>
  ): void {
    // If mode didn't change and meshes already exist, skip
    if (mode === this._currentUi3dMode && this._ui3dMeshes.length > 0) return

    this.clearAllUi3dMeshes()

    if (mode === 'css-overlay') {
      this._currentUi3dMode = mode
      return // No 3D UI meshes in CSS-overlay mode
    }

    // For html-in-canvas or hybrid, create meshes for each element
    for (const [id, cfg] of Object.entries(elements)) {
      const mesh = this.addUi3dMesh(cfg.dom, {
        position: cfg.position,
        scale: cfg.scale,
        rotation: cfg.rotation,
      })
      if (mesh) {
        // Store element id on the mesh for future reference
        ;(mesh as any).__ui3dId = id
      }
    }

    this._currentUi3dMode = mode
  }
}
