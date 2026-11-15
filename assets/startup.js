/* Shared startup boundary: render before waiting for session/network work. */
(function () {
  let pending = false;
  let failed = false;
  let attempt = 0;
  function showFailure() {
    failed = true;
    pending = false;
    let root = document.getElementById("panel-root");
    if (!root) {
      root = document.createElement("div");
      root.id = "panel-root";
      document.body.replaceChildren(root);
    }
    root.innerHTML = '<main class="center-page"><section class="card login-card" role="alert"><h1>Não foi possível carregar a página</h1><p class="subtitle">A conexão ou a sessão não respondeu. Tente novamente; suas inscrições não foram alteradas.</p><div class="btn-group"><button class="btn btn-primary" id="startupRetry">Tentar novamente</button><button class="btn btn-outline" id="startupLogin">Entrar novamente</button></div></section></main>';
    root.querySelector("#startupRetry").onclick = () => window.location.reload();
    root.querySelector("#startupLogin").onclick = () => {
      window.location.href = new URL("login.html", window.location.href).href;
    };
  }
  window.withPageTimeout = function (operation, milliseconds = 12000) {
    let timer;
    return Promise.race([
      Promise.resolve(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("A conexão demorou para responder. Tente novamente.")), milliseconds);
      }),
    ]).finally(() => clearTimeout(timer));
  };
  window.startPage = async function (load) {
    const current = ++attempt;
    pending = true;
    failed = false;
    const root = document.getElementById("panel-root");
    if (root) root.innerHTML = '<main class="center-page"><section class="card login-card" role="status"><h1>Carregando…</h1><p class="subtitle">Horizonte Roleplay — REC Mapper</p></section></main>';
    // Cover hanging startup even when the provider never rejects its promise.
    const timer = setTimeout(() => { if (pending && attempt === current) showFailure(); }, 16000);
    try {
      await load();
    } catch (error) {
      console.warn("Page startup failed", error);
      if (attempt === current) showFailure();
    } finally {
      clearTimeout(timer);
      if (attempt === current) pending = false;
    }
  };
  window.addEventListener("error", () => {
    const root = document.getElementById("panel-root");
    if (pending || (root && !root.textContent.trim())) showFailure();
  });
  window.addEventListener("unhandledrejection", event => {
    const root = document.getElementById("panel-root");
    if (pending || (root && !root.textContent.trim())) { event.preventDefault(); showFailure(); }
  });
  window.addEventListener("DOMContentLoaded", () => {
    const root = document.getElementById("panel-root");
    if (!failed && !pending && root && !root.textContent.trim()) showFailure();
  });
})();