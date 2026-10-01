<script setup lang="ts">
import { ref, computed } from 'vue';
import Header from './components/Header.vue';
import FamilyStatusBar from './components/FamilyStatusBar.vue';
import InteractiveTreeCanvas from './components/InteractiveTreeCanvas.vue';
import ActionArea from './components/ActionArea.vue';
import WateringModal from './components/WateringModal.vue';
import AddContentModal from './components/AddContentModal.vue';
import ArtifactLightboxModal from './components/ArtifactLightboxModal.vue';
import NudgeModal from './components/NudgeModal.vue';
import MemberDetailModal from './components/MemberDetailModal.vue';
import DemoControlPanel from './components/DemoControlPanel.vue';
import InfoModal from './components/InfoModal.vue';
import { initialFamilyMembers, initialArtifacts } from './mockData';
import type { TreeState, FamilyMember, TreeArtifact } from './types';

// State
const members = ref<FamilyMember[]>(initialFamilyMembers);
const artifacts = ref<TreeArtifact[]>(initialArtifacts);
const treeState = ref<TreeState>('growing');
const treeLevel = ref<number>(3);
const expPercent = ref<number>(65);

// Modals state
const isWateringModalOpen = ref(false);
const isWateringAnimation = ref(false);
const isAddModalOpen = ref(false);
const isNudgeModalOpen = ref(false);
const isInfoModalOpen = ref(false);
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

const currentUser = computed(
  () => members.value.find((m) => m.isCurrentUser) || members.value[0]
);

const hasWateredToday = computed(() => currentUser.value.wateredToday);

const streak = computed(() => currentUser.value.streak);

// Handle Watering Action
const handleWaterTree = () => {
  if (hasWateredToday.value) return;

  isWateringAnimation.value = true;
  setTimeout(() => {
    isWateringAnimation.value = false;
  }, 1200);

  members.value = members.value.map((m) =>
    m.isCurrentUser
      ? { ...m, wateredToday: true, streak: m.streak + 1 }
      : m
  );

  const newExp = expPercent.value + 30;
  if (newExp >= 100) {
    treeLevel.value += 1;
    expPercent.value = newExp % 100;
  } else {
    expPercent.value = newExp;
  }

  treeState.value = 'thriving';
  isWateringModalOpen.value = true;
};

// Handle Adding New Artifact
const handleAddArtifact = (
  newArt: Omit<TreeArtifact, 'id' | 'date' | 'coords'>
) => {
  const randomX = Math.floor(Math.random() * 50) + 25;
  const randomY = Math.floor(Math.random() * 35) + 35;
  const randomRotate = Math.floor(Math.random() * 12) - 6;

  const item: TreeArtifact = {
    ...newArt,
    id: `art-${Date.now()}`,
    date: 'たった今',
    coords: { x: randomX, y: randomY, rotate: randomRotate },
  };

  artifacts.value = [item, ...artifacts.value];
  showToast(
    newArt.type === 'photo'
      ? '📸 写真を木にぶら下げました！'
      : '🪵 言葉を木のプレートに刻みました！'
  );
};

// Demo Controls handlers
const handleToggleUserWatered = () => {
  members.value = members.value.map((m) =>
    m.isCurrentUser ? { ...m, wateredToday: !m.wateredToday } : m
  );
};

const handleResetStreak = () => {
  members.value = members.value.map((m) =>
    m.isCurrentUser ? { ...m, streak: 1 } : m
  );
  showToast('連続日数を1日にリセットしました');
};

const handleLevelUp = () => {
  treeLevel.value += 1;
  expPercent.value = 75;
  showToast('ツリーレベルが上がりました！✨');
};

const unwateredMembers = computed(() =>
  members.value.filter((m) => !m.wateredToday)
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

      <!-- Scrollable Main Mobile View -->
      <div class="flex-1 flex flex-col justify-between overflow-y-auto overflow-x-hidden relative">
        <!-- Header -->
        <Header
          :streak="streak"
          :tree-level="treeLevel"
          :exp-percent="expPercent"
          @open-info="isInfoModalOpen = true"
          @switch-family="showToast('🏡 ひだまりファミリーを選択中')"
        />

        <!-- Ambient Family Status Bar -->
        <FamilyStatusBar
          :members="members"
          @select-member="(m) => (selectedMember = m)"
        />

        <!-- Centerpiece: Interactive Tree Canvas -->
        <InteractiveTreeCanvas
          :tree-state="treeState"
          :artifacts="artifacts"
          :is-watering-animation="isWateringAnimation"
          @select-artifact="(art) => (selectedArtifact = art)"
        />

        <!-- Primary & Secondary Action Area -->
        <ActionArea
          :has-watered-today="hasWateredToday"
          @water-tree="handleWaterTree"
          @open-add-modal="isAddModalOpen = true"
          @open-nudge-modal="isNudgeModalOpen = true"
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
      @add-artifact="handleAddArtifact"
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

    <MemberDetailModal
      :member="selectedMember"
      @close="selectedMember = null"
      @send-heart="(name) => showToast(`❤️ ${name}さんに温かい見守りエールを送りました`)"
    />

    <InfoModal
      :is-open="isInfoModalOpen"
      @close="isInfoModalOpen = false"
    />

    <!-- Demonstration / Judge Control Panel -->
    <DemoControlPanel
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
