<template>
  <button class="reader-back-button" type="button">
    <span aria-hidden="true">←</span>
    <span><slot>返回目录</slot></span>
  </button>
</template>

<style scoped>
.reader-back-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: .6em;
  min-height: 40px;
  padding: 6px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-family: var(--serif-sc);
  font-size: 14px;
  line-height: 1.8;
  cursor: pointer;
}
.reader-back-button:hover:not(:disabled) { color: var(--ink); }
.reader-back-button:disabled { opacity: .45; cursor: not-allowed; }
.reader-back-button:focus-visible { outline: 1px solid var(--reader-brand, var(--ink)); outline-offset: 4px; }
</style>
