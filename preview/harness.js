const listeners = [];
window.chrome = {
  storage: {
    local: { get: async (defaults) => defaults },
    onChanged: { addListener: (fn) => listeners.push(fn) },
  },
  runtime: { onMessage: { addListener: () => {} } },
};
function updatePreference(key, value) {
  listeners.forEach((fn) => fn({ [key]: { newValue: value } }, "local"));
}
