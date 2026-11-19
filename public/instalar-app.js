(() => {
  let pendingPrompt;
  let installed = false;
  const display = matchMedia('(display-mode: standalone)');
  const button = () => document.getElementById('install-app');
  function update() {
    if (button()) button().hidden = installed || display.matches || navigator.standalone === true;
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    pendingPrompt = event;
    update();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    pendingPrompt = null;
    document.getElementById('install-help')?.close();
    update();
  });
  display.addEventListener?.('change', update);
  document.addEventListener('DOMContentLoaded', () => {
    update();
    const help = document.getElementById('install-help');
    button().addEventListener('click', async () => {
      if (pendingPrompt) {
        const prompt = pendingPrompt;
        pendingPrompt = null;
        try {
          await prompt.prompt();
          await prompt.userChoice;
          return;
        } catch { /* Show the browser menu instructions below. */ }
      }
      help.showModal();
    });
  });
})();