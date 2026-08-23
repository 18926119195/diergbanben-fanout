export type {
  AChunkSource,
  ActionKind,
  ActionRecord,
  AdjustKind,
  DialogueClosure,
  DirectionRecord,
  FanoutPath,
  FigFace,
  InstructionBundle,
  IntrinsicCoordinate,
  LinkType,
  LlmCallResult,
  LockBox,
  PlaceFaces,
  PlaceKind,
  ReasonEdge,
  RelationKind,
  TextFace,
} from './types'
export {
  classifyIntervalRelation,
  facesToReadout,
  formatRLabel,
  makeComboKey,
  makeFigKey,
  makeIntrinsicKey,
  makeSlotKey,
  stableShortHash,
} from './intrinsicKey'
export {
  fullSlotMember,
  spanToPct,
} from './ocrSlot'
export type { SlotMemberRef } from './ocrSlot'
export { textToProbe, cosine } from './lexicalProbe'
export { buildInferBundle, bundleToPrompt } from './bundle'
export { callLlmWithBundle, llmConfigStatus } from './llmClient'
export { useReasoning } from './closureStore'
export { useFanout } from './fanoutStore'
export type { FanoutPhase } from './fanoutStore'
export {
  runFanout,
  prepareLetterDesk,
  executeLetterDesk,
  reproposeLetterDesk,
  setLetterUnitDecision,
  rebuildLetterDeskWithLock,
} from './fanoutRunner'
export type {
  FanoutDraftReport,
  FanoutRunOptions,
  FanoutRunResult,
  LetterDeskSession,
} from './fanoutRunner'
export { composeFanoutUnits } from './fanoutCompose'
export type { FanoutInferUnit, FanoutUnitKind } from './fanoutCompose'
export {
  buildPathMarker,
  proposeLetterRows,
  strategyLabel,
} from './letterDesk'
export type {
  DeferredUnitArchive,
  LetterDeskSnapshot,
  LetterRunStrategy,
  LetterUnitDecision,
  LetterUnitRow,
} from './letterDesk'
export {
  buildFingerprint,
  recommendToolClasses,
  findReusablePath,
  collectRefluxMarkers,
} from './toolArchive'
export type { ToolClass, ToolRecommend, ReuseHit } from './toolArchive'
export {
  emptyCurrentObject,
  lockSlotsObject,
  filterKeysByObject,
} from './currentObject'
export type { CurrentObject, ObjectScopeKind } from './currentObject'
export { resolveLineage } from './lineage'
export type { LineageNode } from './lineage'
export {
  executeCompose,
  executeInfer,
  executeInferOps,
  executeRetrieve,
  executeReuse,
  memberKeysSignature,
} from './toolGateway'
export {
  aabbIoU,
  buildBookIndex,
  isFigLayoutLabel,
  patchAtomTextInBookIndex,
  rebuildPagesInBookIndex,
  reembedBookIndex,
  resolveCircleToR,
  resolveVqToCandidates,
} from './pipelineA'
export type { BookIndex, CircleCandidate, CircleResolveResult } from './pipelineA'
export { clearBookIndex, loadBookIndex, saveBookIndex } from './bookIndexStore'
export {
  defaultDualModelConfig,
  dualModelStatus,
  loadDualModelConfig,
  LOCKED_LLM,
  ocrEndpointReady,
  saveDualModelConfig,
} from './modelRuntimeConfig'
export type { DualModelConfig, ModelSlotConfig } from './modelRuntimeConfig'
export { useIndexGate } from './indexGate'
export type { IndexPhase } from './indexGate'
export {
  atomSearchText,
  hybridRank,
  isRetrievableAtom,
  refineDraftHits,
  scoreGapAllowsAutoLock,
  tokenizeQuery,
} from './hybridRetrieve'
export {
  defaultComposePolicy,
  parseComposeStrategy,
} from './composePolicy'
export type { ComposePolicy, CrossComposeMode } from './composePolicy'
export { FANOUT_ROLE_NOTE } from './fanoutRoles'
export type { FanoutRole } from './fanoutRoles'
export { buildIdentityRows } from './identityFocus'
export type { IdentityKind, IdentityRow } from './identityFocus'
export {
  buildHarnessContext,
  acceptPathInContext,
  rejectPathInContext,
  registerInferPaths,
  extractFormalOps,
} from './harnessContext'
export {
  compileHarnessProjection,
  compilerBlocksToAbBlocks,
  augmentQuestionWithMarkers,
} from './harnessCompiler'
export {
  buildMotionPlans,
  probeScope,
  motionActionToLetterDecision,
} from './motionBrain'
export {
  emptyWorkingSet,
  cloneWorkingSet,
  DEFAULT_ACCEPT_OPTIONS,
} from './harnessTypes'
export type {
  HarnessContext,
  MotionPlan,
  MotionAction,
  WorkingSetState,
  AcceptPathOptions,
  PathMemoryEntry,
  ForbidPatternEntry,
} from './harnessTypes'
export {
  markExpanded,
  markCollapsed,
  keysNeedingOpen,
  applyFaultIn,
  applyCollapse,
} from './workingSet'
export { recordReject, isForbidden, forbidItemsFromPatterns } from './forbidPatterns'
export { loadHarnessPersisted, saveHarnessPersisted } from './harnessPersistence'
export { buildMotionPlansForDesk } from './fanoutRunner'
export { applyMotionPlansToLetterRows } from './letterDesk'
export {
  structureChunkBlocks,
  externalBlocksToPageChunks,
} from './structureChunk'
export type { ExternalLayoutBlock, StructureChunkOptions } from './structureChunk'
export {
  expandQueryForRetrieval,
  shouldExpandQuery,
} from './queryExpand'
export type { QueryExpandResult } from './queryExpand'
export {
  refineCandidateBoxes,
  refineCandidateBoxesAsync,
  resolveInkBoxes,
  normalizeInkText,
} from './inkHighlight'
export type { InkRefineResult } from './inkHighlight'
export {
  collectPageSlotRows,
  exportPageSlotDataset,
} from './slotDatasetExport'
export type { SlotLabelRow } from './slotDatasetExport'
