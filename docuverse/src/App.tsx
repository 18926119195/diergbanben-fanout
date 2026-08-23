import { CvsScene } from './canvas/CvsScene'
import { HUD } from './ui/HUD'
import { KeyboardNav } from './ui/KeyboardNav'
import { WorkbenchPalette } from './ui/WorkbenchPalette'
import { OverviewLinkBoard } from './ui/OverviewLinkBoard'
import { LinkFocusControls } from './ui/LinkFocusControls'
import { ConstructionLensControls } from './ui/ConstructionLensControls'
import { ViewPathTimeline } from './ui/ViewPathTimeline'
import { EmphasisStarMap } from './ui/EmphasisStarMap'
import { ReasoningPilotPanel } from './ui/ReasoningPilotPanel'
import { ReasoningFloorDock } from './ui/ReasoningFloorDock'
import { FanoutHud } from './ui/FanoutHud'
import './App.css'

/**
 * Fanout fork: primary UX = 扇出推理（检索 Top-K 后自动并行推理，无需手选一段）。
 * 旧「出处对照」单选流程不再挂载。
 */
export default function App() {
  return (
    <div className="app-root">
      <KeyboardNav />
      <main className="stage">
        <CvsScene />
      </main>
      <HUD />
      <FanoutHud />
      <ReasoningPilotPanel />
      <ReasoningFloorDock />
      <EmphasisStarMap />
      <WorkbenchPalette />
      <OverviewLinkBoard />
      <LinkFocusControls />
      <ConstructionLensControls />
      <ViewPathTimeline />
      <footer className="patent-bar">
        扑克圈底层 · 四层递送箭头 · 无需手选段落
      </footer>
    </div>
  )
}
