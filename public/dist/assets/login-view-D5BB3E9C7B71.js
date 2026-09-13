(()=>{"use strict";const i=document.getElementById("loginMount");if(!i)return;i.outerHTML=`
    <dialog id="loginDialog" aria-labelledby="loginTitle">
      <div class="login-screen">
        <section id="gportLoginStage" class="login-stage" aria-labelledby="loginHeroTitle">
          <div class="login-stage-content">
            <div class="login-brand"><strong>GPORT</strong><span>COMÉRCIO EXTERIOR</span></div>
            <h1 id="loginHeroTitle">Gestão interna que mantém<br>a operação em movimento.</h1>
            <p class="login-description">Acesse processos, acompanhe prazos e organize<br> as rotinas da equipe GPORT em um só lugar.</p>

            <div class="login-journey" aria-label="Fluxo da operação: origem, operação e destino">
              <div class="login-journey-labels"><span>Origem</span><span>Operação</span><span>Destino</span></div>
            </div>
            <ul class="login-areas" aria-label="Áreas do sistema"><li>Processos</li><li>Prazos</li><li>VGM</li><li>Liberação</li></ul>
          </div>
          <div id="loginTerminalScene" class="login-terminal-scene" aria-hidden="true">
            <svg id="loginTerminalArt" viewBox="0 0 1536 1024" focusable="false">
              <defs>
                <clipPath id="loginTerminalTrolleyClip"><path d="M541 318 L557 307 L581 313 L581 308 L648 318 L650 344 L639 347 L638 360 L598 360 L596 349 L543 341 Z"/></clipPath>
                <clipPath id="loginTerminalLoadClip"><path d="M493 581 L493 494 L497 487 L498 476 L504 469 L510 472 L510 482 L524 476 L525 466 L532 463 L537 468 L537 477 L554 472 L554 454 L560 450 L560 445 L566 440 L573 444 L578 444 L580 439 L586 440 L588 452 L610 454 L612 443 L618 442 L623 448 L628 442 L635 445 L641 455 L644 470 L684 479 L689 473 L697 475 L699 496 L704 502 L704 581 Z"/></clipPath>
              </defs>
              <image href="login-terminal-base.png" width="1536" height="1024"/>
              <g id="loginTerminalTrolley"><image href="login-terminal-source.png" width="1536" height="1024" clip-path="url(#loginTerminalTrolleyClip)"/></g>
              <g id="loginTerminalCables" fill="none" stroke-linecap="round"><path class="login-terminal-cable-shadow"/><path class="login-terminal-cable-line"/></g>
              <g id="loginTerminalLoad"><image href="login-terminal-source.png" width="1536" height="1024" clip-path="url(#loginTerminalLoadClip)"/></g>
            </svg>
          </div>
        </section>

        <section class="login-access" aria-labelledby="loginTitle">
          <div class="login-card">
            <h2 id="loginTitle">Acesse sua conta</h2>
            <form id="loginForm" class="login-form">
              <div class="login-field">
                <label for="loginUsername">Usuário</label>
                <div class="login-input-wrap">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"></path></svg>
                  <input id="loginUsername" name="username" autocomplete="username" required minlength="3" maxlength="80" pattern="[A-Za-z0-9._-]{3,80}" title="Use de 3 a 80 caracteres: letras, números, ponto, hífen ou sublinhado." aria-describedby="loginError" autofocus>
                </div>
              </div>
              <div class="login-field">
                <label for="loginPassword">Senha</label>
                <div class="login-input-wrap login-password-wrap">
                  <svg class="login-leading-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12v10H6V10Zm6 4v2"></path></svg>
                  <input id="loginPassword" name="password" type="password" autocomplete="current-password" required maxlength="200" aria-describedby="loginError" data-visibility-ready="true">
                  <button id="loginPasswordToggle" class="login-password-toggle" type="button" aria-label="Mostrar senha" aria-pressed="false"><svg class="eye-open" viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path><circle cx="12" cy="12" r="2.5"></circle></svg><svg class="eye-closed" viewBox="0 0 24 24" aria-hidden="true"><path d="m4 4 16 16M3 12s3.4-6 9-6c2 0 3.8.8 5.2 1.8M21 12s-3.4 6-9 6c-2 0-3.8-.8-5.2-1.8"></path></svg></button>
                </div>
              </div>
              <button class="login-submit" type="submit">Entrar</button>
              <div class="login-security" id="loginSecurityText"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5 5 5.8v5.4c0 4.8 2.9 8.2 7 10.3 4.1-2.1 7-5.5 7-10.3V5.8L12 2.5Zm-3 9.8 2.1 2.1 4.1-4.2"></path></svg><span>Acesso seguro e protegido</span></div>
              <div class="login-turnstile-frame"><div id="turnstileWidget" data-sitekey="" aria-labelledby="loginSecurityText" hidden></div></div>
              <p id="loginError" class="form-error" role="alert" aria-live="assertive" hidden></p>
            </form>
          </div>
        </section>
      </div>
    </dialog>`;const e=document.querySelector('meta[name="gport-turnstile-site-key"]')?.content||"";document.getElementById("turnstileWidget").dataset.sitekey=e})();
