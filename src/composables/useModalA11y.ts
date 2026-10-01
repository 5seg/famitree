import { onMounted, onUnmounted, type Ref } from 'vue';

export function useModalA11y(isOpen: Ref<boolean> | (() => boolean), onClose: () => void) {
  const handleKeyDown = (e: KeyboardEvent) => {
    const open = typeof isOpen === 'function' ? isOpen() : isOpen.value;
    if (!open) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  onMounted(() => {
    window.addEventListener('keydown', handleKeyDown);
  });

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeyDown);
  });
}
