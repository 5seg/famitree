<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import Header from './components/Header.vue';
import FamilyStatusBar from './components/FamilyStatusBar.vue';
import InteractiveTreeCanvas from './components/InteractiveTreeCanvas.vue';
import ActionArea from './components/ActionArea.vue';
import AlbumModal from './components/AlbumModal.vue';
import WateringModal from './components/WateringModal.vue';
import AddContentModal from './components/AddContentModal.vue';
import ArtifactLightboxModal from './components/ArtifactLightboxModal.vue';
import NudgeModal from './components/NudgeModal.vue';
import MemberDetailModal from './components/MemberDetailModal.vue';
import DemoControlPanel from './components/DemoControlPanel.vue';
import InfoModal from './components/InfoModal.vue';
import JoinScreen from './components/JoinScreen.vue';
import { disablePush } from './push';
import { startSession, track, endSession } from './track';
import { fetchState, waterTree, sendNudge, removeMember, setMemberAdmin, leaveFamily, clearToken, type AppState } from './api';
import { authed, describeError } from './session';
import type { TreeState, FamilyMember, TreeArtifact } from './types';

// State (サーバーの AppState をそのまま反映する)
const isDev = import.meta.env.DEV;
const loaded = ref(false);
const familyName = ref('');
const inviteCode = ref('');
const members = ref<FamilyMember[]>([]);
const artifacts = ref<TreeArtifact[]>([]);
const album = ref<TreeArtifact[]>([]);
const treeState = ref<TreeState>('growing');
const treeLevel = ref<number>(1);
const expPercent = ref<number>(0);
const streak = ref<number>(0);
// 「全員そろった日」の連続。streak（だれかが押した日）と並べて出す
const fullStreak = ref<number>(0);
// 自分の行（復旧コードの発行状態と、管理者かどうか）
const me = ref<AppState['me'] | null>(null);
const hasRecoveryKey = ref(false);

// 操作ログの開始（このタブのセッション）。検証の計測にのみ使う
startSession();

const applyState = (s: AppState) => {
  const first = !loaded.value;
  familyName.value = s.family.name;
  inviteCode.value = s.family.inviteCode;
  members.value = s.members;
  artifacts.value = s.artifacts;
  // フロントと API は別々に配信するので、アルバムを返さない旧 API でも落とさない
  album.value = s.album ?? [];
  treeState.value = s.family.treeState;
  treeLevel.value = s.family.level;
  expPercent.value = s.family.exp;
  streak.value = s.family.streak;
  // 旧 API は fullStreak を返さないので、無くても落とさない
  fullStreak.value = s.family.fullStreak ?? 0;
  // 旧 API は me を返さないので、無くても落とさない
  me.value = s.me ?? null;
  hasRecoveryKey.value = s.family.hasRecoveryKey ?? false;
  loaded.value = true;
  if (first) {
    track('state_loaded', `${s.family.treeState} streak=${s.family.streak} members=${s.members.length}`);
    hintRecovery();
  }
};

// Modals state
const isWateringModalOpen = ref(false);
const isWateringAnimation = ref(false);
const isAddModalOpen = ref(false);
const isNudgeModalOpen = ref(false);
const isInfoModalOpen = ref(false);
const isAlbumModalOpen = ref(false);
const selectedArtifact = ref<TreeArtifact | null>(null);
const selectedMember = ref<FamilyMember | null>(null);
const toastMessage = ref<string | null>(null);
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const showToast = (msg: string) => {
  clearTimeout(toastTimer);
  toastMessage.value = msg;
  toastTimer = setTimeout(() => {
    toastMessage.value = null;
  }, 2800);
};

// 復旧コード未発行のまま端末を失くすと戻れないので、一度だけ案内する
const hintRecovery = () => {
  if (me.value?.hasRecovery !== false) return;
  if (localStorage.getItem('famitree-recovery-hint')) return;
  localStorage.setItem('famitree-recovery-hint', '1');
  setTimeout(() => showToast('🔑 ⓘ から「復旧コード」を発行しておくと安心です'), 1200);
};

const load = async () => {
  if (!authed.value) return;
  try {
    applyState(await fetchState());
  } catch (e) {
    showToast(describeError(e));
  }
};

const onVisible = () => {
  if (document.visibilityState === 'visible') load();
  else endSession('hidden');
};

onMounted(() => {
  load();
  document.addEventListener('visibilitychange', onVisible);
});
onUnmounted(() => document.removeEventListener('visibilitychange', onVisible));

// どのモーダルを開いたかだけを記録する（迷いの指標）
watch(
  [isWateringModalOpen, isAddModalOpen, isNudgeModalOpen, isInfoModalOpen, isAlbumModalOpen],
  ([w, a, n, i, al]) => {
    if (w) track('modal_open', 'watering');
    if (a) track('modal_open', 'add_content');
    if (n) track('modal_open', 'nudge');
    if (i) track('modal_open', 'info');
    if (al) track('modal_open', 'album');
  }
);
watch(selectedArtifact, (v) => v && track('modal_open', 'artifact'));
watch(selectedMember, (v) => v && track('modal_open', 'member'));

const onJoined = () => {
  authed.value = true;
  loaded.value = false;
  load();
};

const currentUser = computed(() => members.value.find((m) => m.isCurrentUser));

const hasWateredToday = computed(() => currentUser.value?.wateredToday ?? false);

// 家族全員が今日の水やりを済ませたか（鳥の巣に鳥が来る条件）
const allWatered = computed(
  () => members.value.length > 0 && members.value.every((m) => m.wateredToday)
);

const isAdmin = computed(() => currentUser.value?.isAdmin ?? false);

// Handle Watering Action
const handleWaterTree = async () => {
  if (hasWateredToday.value) return;
  track('water_press');
  try {
    applyState(await waterTree());
  } catch (e) {
    track('water_error');
    showToast(describeError(e));
    return;
  }
  track('water_ok', treeState.value);

  isWateringAnimation.value = true;
  setTimeout(() => {
    isWateringAnimation.value = false;
  }, 1200);
  isWateringModalOpen.value = true;
};

// AddContentModal がAPI呼び出しまで行い、返ってきた状態を受け取る
const handleSaved = (s: AppState, type: TreeArtifact['type']) => {
  track('artifact_saved', type);
  applyState(s);
  showToast(
    type === 'photo'
      ? '📸 写真を木にぶら下げました！'
      : '🪵 言葉を木のプレートに刻みました！'
  );
};

const handleSendHeart = async (m: FamilyMember) => {
  try {
    const { sent } = await sendNudge([m.id], 'heart');
    track('nudge_sent', sent ? 'heart' : 'already');
    showToast(
      sent
        ? `❤️ ${m.name}さんに温かい見守りエールを送りました`
        : '今日はもうエールを送っています'
    );
  } catch (e) {
    showToast(describeError(e));
  }
};

// Demo Controls handlers (開発時のみ。ローカル状態だけを書き換える)
const handleToggleUserWatered = () => {
  members.value = members.value.map((m) =>
    m.isCurrentUser ? { ...m, wateredToday: !m.wateredToday } : m
  );
};

const handleResetStreak = () => {
  streak.value = 1;
  fullStreak.value = 1;
  showToast('連続日数を1日にリセットしました');
};

const handleLevelUp = () => {
  treeLevel.value += 1;
  expPercent.value = 75;
  showToast('ツリーレベルが上がりました！✨');
};

// 家族管理 (管理者のみ)
const handleRemoveMember = async (m: FamilyMember) => {
  if (!window.confirm(`${m.name}さんを家族から外しますか？写真などの記録は残ります。`)) return;
  try {
    applyState(await removeMember(m.id));
    selectedMember.value = null;
    showToast(`${m.name}さんを家族から外しました`);
  } catch (e) {
    showToast(describeError(e));
  }
};

const handleToggleAdmin = async (m: FamilyMember) => {
  try {
    const s = await setMemberAdmin(m.id, !m.isAdmin);
    applyState(s);
    selectedMember.value = s.members.find((x) => x.id === m.id) ?? null;
    showToast(m.isAdmin ? `${m.name}さんを管理者から外しました` : `${m.name}さんを管理者にしました`);
  } catch (e) {
    showToast(describeError(e));
  }
};

const handleLeaveFamily = async () => {
  if (!window.confirm('この家族から抜けますか？')) return;
  try {
    await leaveFamily();
  } catch (e) {
    showToast(describeError(e));
    return;
  }
  await disablePush();
  clearToken();
  authed.value = false;
  loaded.value = false;
  selectedMember.value = null;
};

// 切り替えは今の家族に残るだけなので leaveFamily は呼ばない（招待コードで戻れる）
const handleSwitchFamily = async () => {
  if (
    !window.confirm(
      `${familyName.value}の木から離れて、別の家族を選びますか？\n今の家族と記録はそのまま残ります。招待コードで戻れます。`
    )
  )
    return;
  track('family_switch');
  await disablePush();
  clearToken();
  authed.value = false;
  loaded.value = false;
  selectedArtifact.value = null;
  selectedMember.value = null;
  isWateringModalOpen.value = false;
  isAddModalOpen.value = false;
  isNudgeModalOpen.value = false;
  isInfoModalOpen.value = false;
  isAlbumModalOpen.value = false;
};

const unwateredMembers = computed(() =>
  members.value.filter((m) => !m.wateredToday && !m.isCurrentUser)
);
</script>

<template>
  <div class="min-h-screen bg-[#ece9df] flex items-center justify-center p-0 sm:p-4 md:p-6 text-stone-800 antialiased selection:bg-emerald-200">
    <!-- Mobile-first Phone Frame (max-w-md centered on desktop) -->
    <div class="w-full sm:max-w-md bg-stone-50 min-h-screen sm:min-h-[780px] sm:max-h-[920px] sm:rounded-3xl sm:border-[8px] sm:border-stone-800 shadow-2xl flex flex-col justify-between relative overflow-hidden">
      <!-- Top Speaker & Camera notch simulation on desktop -->
      <div class="hidden sm:flex justify-center pt-2 pb-1 bg-stone-50 z-30">
        <div class="w-20 h-4 bg-stone-800 rounded-full flex items-center justify-center">
          <div class="w-2.5 h-2.5 rounded-full bg-stone-900 border border-stone-700 mr-2" />
          <div class="w-8 h-1 rounded-full bg-stone-700" />
        </div>
      </div>

      <JoinScreen v-if="!authed" @joined="onJoined" />

      <div v-else-if="!loaded" class="flex-1 flex items-center justify-center text-xs text-stone-500">
        🌱 木を育てています…
      </div>

      <!-- Scrollable Main Mobile View -->
      <div v-else class="flex-1 flex flex-col justify-between overflow-y-auto overflow-x-hidden relative">
        <!-- Header -->
        <Header
          :streak="streak"
          :full-streak="fullStreak"
          :tree-level="treeLevel"
          :exp-percent="expPercent"
          :family-name="familyName"
          :member-count="members.length"
          @open-info="isInfoModalOpen = true"
          @switch-family="handleSwitchFamily"
          @leave-family="handleLeaveFamily"
        />

        <!-- Ambient Family Status Bar -->
        <FamilyStatusBar
          :members="members"
          @select-member="(m) => (selectedMember = m)"
        />

        <!-- Centerpiece: Interactive Tree Canvas -->
        <InteractiveTreeCanvas
          :tree-state="treeState"
          :tree-level="treeLevel"
          :all-watered="allWatered"
          :artifacts="artifacts"
          :is-watering-animation="isWateringAnimation"
          @select-artifact="(art) => (selectedArtifact = art)"
        />

        <!-- Primary & Secondary Action Area -->
        <ActionArea
          :has-watered-today="hasWateredToday"
          :album-count="album.length"
          @water-tree="handleWaterTree"
          @open-add-modal="isAddModalOpen = true"
          @open-nudge-modal="isNudgeModalOpen = true"
          @open-album="isAlbumModalOpen = true"
        />
      </div>

      <!-- Floating Toast Notification -->
      <div
        v-if="toastMessage"
        class="absolute top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-stone-800/95 text-white text-xs font-semibold rounded-full shadow-lg backdrop-blur-md flex items-center gap-1.5 animate-bounce"
      >
        <span>{{ toastMessage }}</span>
      </div>
    </div>

    <!-- Modals -->
    <WateringModal
      :is-open="isWateringModalOpen"
      :streak="streak"
      @close="isWateringModalOpen = false"
    />

    <AddContentModal
      :is-open="isAddModalOpen"
      :tree-level="treeLevel"
      :current-user="currentUser"
      @close="isAddModalOpen = false"
      @saved="handleSaved"
    />

    <ArtifactLightboxModal
      :artifact="selectedArtifact"
      @close="selectedArtifact = null"
    />

    <NudgeModal
      :is-open="isNudgeModalOpen"
      :unwatered-members="unwateredMembers"
      @close="isNudgeModalOpen = false"
    />

    <AlbumModal
      :is-open="isAlbumModalOpen"
      :items="album"
      @select="selectedArtifact = $event"
      @close="isAlbumModalOpen = false"
    />

    <MemberDetailModal
      :member="selectedMember"
      :viewer-is-admin="isAdmin"
      @close="selectedMember = null"
      @send-heart="handleSendHeart"
      @remove-member="handleRemoveMember"
      @toggle-admin="handleToggleAdmin"
      @leave-family="handleLeaveFamily"
    />

    <InfoModal
      :is-open="isInfoModalOpen"
      :family-name="familyName"
      :invite-code="inviteCode"
      :has-recovery="me?.hasRecovery ?? false"
      :has-recovery-key="hasRecoveryKey"
      :is-admin="isAdmin"
      @toast="showToast"
      @close="isInfoModalOpen = false"
    />

    <!-- Demonstration / Judge Control Panel -->
    <DemoControlPanel
      v-if="isDev && authed && loaded"
      :tree-state="treeState"
      :user-watered="hasWateredToday"
      :streak="streak"
      @update-tree-state="(st) => (treeState = st)"
      @toggle-user-watered="handleToggleUserWatered"
      @reset-streak="handleResetStreak"
      @level-up="handleLevelUp"
    />
  </div>
</template>
