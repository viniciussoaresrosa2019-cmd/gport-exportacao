(() => {
  'use strict';
  const mount = document.getElementById('loginMount');
  if (!mount) return;
  mount.outerHTML = `
    <dialog id="loginDialog" aria-labelledby="loginTitle">
      <div class="animated-login-root">
        <div id="gportLoginStage" class="animated-login-stage" role="img" aria-label="Gestão interna que mantém a operação em movimento. Acesse processos, acompanhe prazos e organize as rotinas da equipe GPORT em um só lugar.">
          <img class="original" src="login-animation/login-reference.png?v=20260911.1" alt="Gestão interna que mantém a operação em movimento. Origem, Operação, Destino. Processos, Prazos, VGM e Liberação.">
          <svg class="scene" viewBox="0 0 1672 941" aria-hidden="true">
            <image id="plate" href="login-animation/background.png?v=20260911.1" width="1672" height="941"></image>
            <g id="ship"><image href="login-animation/ship.png?v=20260911.1" x="39" y="608" width="386" height="209"></image></g>
            <path id="cable" d="M687 562 L687 610 M690 562 L690 610" fill="none" stroke="#304353" stroke-width=".9"></path>
            <g id="cargo"><image href="login-animation/cargo.png?v=20260911.1" x="621" y="596" width="132" height="121"></image></g>
            <defs>
              <path id="route" d="M96 476 L669 478"></path>
              <radialGradient id="glow"><stop stop-color="#abcff2" stop-opacity=".52"></stop><stop offset="1" stop-color="#abcff2" stop-opacity="0"></stop></radialGradient>
            </defs>
            <g id="traveller" opacity="0"><circle r="10" fill="url(#glow)"></circle><circle r="2.5" fill="#dcecff"></circle></g>
          </svg>
        </div>
        <section class="login-access-layer" aria-labelledby="loginTitle">
          <svg class="mobile-access-art" viewBox="1020 145 580 650" aria-hidden="true"><image href="login-animation/login-reference.png?v=20260911.1" width="1672" height="941"></image></svg>
          <form id="loginForm" class="login-form-overlay">
            <h1 id="loginTitle" class="visually-hidden">Acesse sua conta</h1>
            <label class="visually-hidden" for="loginUsername">Usuário</label>
            <input id="loginUsername" class="login-credential login-username" name="username" autocomplete="username" required minlength="3" maxlength="80" pattern="[A-Za-z0-9._-]{3,80}" title="Use de 3 a 80 caracteres: letras, números, ponto, hífen ou sublinhado." aria-describedby="loginError" autofocus>
            <div class="login-password-control">
              <label class="visually-hidden" for="loginPassword">Senha</label>
              <input id="loginPassword" class="login-credential" name="password" type="password" autocomplete="current-password" required maxlength="200" aria-describedby="loginError" data-visibility-ready="true">
              <button id="loginPasswordToggle" class="login-password-toggle" type="button" aria-label="Mostrar senha" aria-pressed="false"></button>
            </div>
            <button class="login-submit-overlay" type="submit" aria-label="Entrar"></button>
            <p id="loginSecurityText" class="visually-hidden">Acesso seguro e protegido</p>
            <div id="turnstileWidget" data-sitekey="" aria-labelledby="loginSecurityText" hidden></div>
            <p id="loginError" class="form-error" role="alert" aria-live="assertive" hidden></p>
          </form>
        </section>
        <div class="login-animation-controls"><button type="button" id="pause" aria-pressed="false">Pausar animação</button></div>
      </div>
    </dialog>`;
  const siteKey = document.querySelector('meta[name="gport-turnstile-site-key"]')?.content || '';
  document.getElementById('turnstileWidget').dataset.sitekey = siteKey;
})();
