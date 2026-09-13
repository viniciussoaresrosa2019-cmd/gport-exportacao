(()=>{"use strict";const e=document.getElementById("loginMount");if(!e)return;e.outerHTML=`
    <dialog id="loginDialog" aria-labelledby="loginTitle">
      <div class="animated-login-root">
        <section id="gportLoginStage" class="animated-login-stage" aria-labelledby="loginHeroTitle">
          <div class="login-hero-copy">
            <img class="login-brand" src="logo-gport.png" alt="GPORT Comércio Exterior">
            <h1 id="loginHeroTitle">Gestão interna que mantém<br>a operação em movimento.</h1>
            <p>Acesse processos, acompanhe prazos e organize<br class="login-copy-break"> as rotinas da equipe GPORT em um só lugar.</p>

            <div class="login-route" aria-label="Fluxo da operação: origem, operação e destino">
              <svg class="login-route-art" viewBox="70 450 625 65" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <radialGradient id="glow"><stop stop-color="#e4f1ff" stop-opacity=".9"></stop><stop offset="1" stop-color="#93bde7" stop-opacity="0"></stop></radialGradient>
                  <filter id="routeGlow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="4"></feGaussianBlur></filter>
                </defs>
                <path id="route" d="M96 476 L669 478"></path>
                <g class="login-route-points">
                  <g transform="translate(96 476)"><circle class="route-halo" r="16"></circle><circle r="8"></circle></g>
                  <g transform="translate(382 480)"><circle class="route-halo" r="16"></circle><circle r="8"></circle></g>
                  <g transform="translate(669 478)"><circle class="route-halo" r="16"></circle><circle r="8"></circle></g>
                </g>
                <g id="traveller" opacity="0"><circle r="14" fill="url(#glow)"></circle><circle r="3" fill="#f1f7ff"></circle></g>
              </svg>
              <div class="login-route-labels" aria-hidden="true"><span>Origem</span><span>Operação</span><span>Destino</span></div>
            </div>

            <ul class="login-features" aria-label="Áreas do sistema">
              <li>Processos</li><li>Prazos</li><li>VGM</li><li>Liberação</li>
            </ul>
          </div>

          <svg class="login-harbor-art" viewBox="0 0 955 941" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="harborFade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#52799c" stop-opacity=".68"></stop><stop offset="1" stop-color="#183653" stop-opacity=".35"></stop></linearGradient>
            </defs>
            <g class="terminal-lines" fill="none" stroke="url(#harborFade)" stroke-width="1.25">
              <path d="M616 779H944M632 742h53v37m74-32h56v32m70-61h39v61"></path>
              <path d="M792 442v337M798 443l80 92M795 443l-74 100M718 543h174M737 543v236M875 535v244"></path>
              <path d="M795 443l-38 219M795 443l38 219M757 662h76M758 662l-25 53M832 662l27 53"></path>
              <path d="M716 579h177M729 579v83M879 579v83M746 605h115M742 632h122"></path>
              <path d="M650 716h65v63M660 716v-26h44v26M842 716h47v63M849 716v-31h34v31"></path>
              <path d="M620 757h74M759 747h104M886 739h49"></path>
              <path d="M912 535h34v244M912 535l34 31M912 566h34M919 584h20M919 600h20"></path>
              <path d="M742 543l53-100 65 100M748 543l47-73 55 73"></path>
            </g>
            <g class="water-lines" fill="none" stroke="#173b5d" stroke-width="1.1">
              <path d="M0 793c56-19 104 18 160 0s104 18 160 0 104 18 160 0 104 18 160 0 104 18 160 0 104 18 155 0"></path>
              <path d="M0 813c56-19 104 18 160 0s104 18 160 0 104 18 160 0 104 18 160 0 104 18 160 0 104 18 155 0"></path>
              <path d="M0 835c56-19 104 18 160 0s104 18 160 0 104 18 160 0 104 18 160 0 104 18 160 0 104 18 155 0"></path>
              <path d="M0 859c56-19 104 18 160 0s104 18 160 0 104 18 160 0 104 18 160 0 104 18 160 0 104 18 155 0"></path>
              <path d="M0 885c56-19 104 18 160 0s104 18 160 0 104 18 160 0 104 18 160 0 104 18 160 0 104 18 155 0"></path>
            </g>
            <g id="ship"><image href="login-animation/ship.png?v=20260911.2" x="39" y="608" width="386" height="209"></image></g>
            <path id="cable" d="M687 562 L687 610 M690 562 L690 610" fill="none" stroke="#38516a" stroke-width="1.1"></path>
            <g id="cargo"><image href="login-animation/cargo.png?v=20260911.2" x="621" y="596" width="132" height="121"></image></g>
          </svg>

          <div class="login-animation-controls"><button type="button" id="pause" aria-pressed="false">Pausar animação</button></div>
        </section>

        <section class="login-access-layer" aria-labelledby="loginTitle">
          <div class="login-card">
            <h2 id="loginTitle">Acesse sua conta</h2>
            <form id="loginForm" class="login-form">
              <div class="login-field">
                <label for="loginUsername">Usuário</label>
                <div class="login-control">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"></path></svg>
                  <input id="loginUsername" name="username" autocomplete="username" required minlength="3" maxlength="80" pattern="[A-Za-z0-9._-]{3,80}" title="Use de 3 a 80 caracteres: letras, números, ponto, hífen ou sublinhado." aria-describedby="loginError" autofocus>
                </div>
              </div>

              <div class="login-field">
                <label for="loginPassword">Senha</label>
                <div class="login-control login-password-control">
                  <svg class="login-leading-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12v10H6V10Zm6 4v2"></path></svg>
                  <input id="loginPassword" name="password" type="password" autocomplete="current-password" required maxlength="200" aria-describedby="loginError" data-visibility-ready="true">
                  <button id="loginPasswordToggle" class="login-password-toggle" type="button" aria-label="Mostrar senha" aria-pressed="false">
                    <svg class="eye-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg>
                    <svg class="eye-closed" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M3 12s3.4-6 9-6c2 0 3.8.8 5.2 1.8M21 12s-3.4 6-9 6c-2 0-3.8-.8-5.2-1.8"></path></svg>
                  </button>
                </div>
              </div>

              <button class="login-submit" type="submit">Entrar</button>
              <div class="login-security" id="loginSecurityText">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 5 6v5c0 4.7 2.8 8 7 10 4.2-2 7-5.3 7-10V6l-7-3Zm-3 9 2 2 4-4"></path></svg>
                <span>Acesso seguro e protegido</span>
              </div>
              <div class="login-turnstile-frame"><div id="turnstileWidget" data-sitekey="" aria-labelledby="loginSecurityText" hidden></div></div>
              <p id="loginError" class="form-error" role="alert" aria-live="assertive" hidden></p>
            </form>
          </div>
        </section>
      </div>
    </dialog>`;const a=document.querySelector('meta[name="gport-turnstile-site-key"]')?.content||"";document.getElementById("turnstileWidget").dataset.sitekey=a})();
