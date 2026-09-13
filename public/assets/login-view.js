(() => {
  'use strict';

  const mount = document.getElementById('loginMount');
  if (!mount) return;

  mount.outerHTML = `
    <dialog id="loginDialog" aria-labelledby="loginTitle">
      <div class="login-screen">
        <section id="gportLoginStage" class="login-stage" aria-labelledby="loginHeroTitle">
          <div class="login-watermark" aria-hidden="true">G</div>
          <div class="login-stage-content">
            <img class="login-logo" src="logo-gport.png" alt="GPORT Comércio Exterior">
            <h1 id="loginHeroTitle">Gestão interna que mantém<br>a operação em movimento.</h1>
            <p class="login-description">Acesse processos, acompanhe prazos e organize<br> as rotinas da equipe GPORT em um só lugar.</p>

            <div class="login-journey" aria-label="Fluxo da operação: origem, operação e destino">
              <svg class="login-journey-line" viewBox="0 0 350 22" role="presentation" aria-hidden="true">
                <path id="loginJourneyPath" d="M8 11 C69 8 90 15 138 11 S225 8 276 11 S323 12 342 11"></path>
                <g class="login-journey-halos">
                  <circle cx="8" cy="11" r="9"></circle><circle cx="175" cy="11" r="9"></circle><circle cx="342" cy="11" r="9"></circle>
                </g>
                <g class="login-journey-points">
                  <circle cx="8" cy="11" r="4"></circle><circle cx="175" cy="11" r="4"></circle><circle cx="342" cy="11" r="4"></circle>
                </g>
                <circle id="loginJourneyTraveller" r="2.5" cx="8" cy="11"></circle>
              </svg>
              <div class="login-journey-labels" aria-hidden="true"><span>Origem</span><span>Operação</span><span>Destino</span></div>
            </div>
            <ul class="login-areas" aria-label="Áreas do sistema"><li>Processos</li><li>Prazos</li><li>VGM</li><li>Liberação</li></ul>
          </div>

          <div class="login-port-scene" aria-hidden="true">
            <svg class="login-sea" viewBox="0 0 580 100" preserveAspectRatio="none">
              <defs>
                <path id="loginWaveA" d="M0 11 C17 10 30 13 48 12 C70 10 86 14 107 13 C128 11 141 10 158 12 C181 15 194 11 212 11 C238 12 247 15 268 13 C292 10 310 11 328 12 C350 14 369 10 392 11 C419 13 429 14 450 12 C474 10 492 13 513 12 C537 10 558 13 580 11"></path>
                <path id="loginWaveB" d="M0 22 C24 19 35 25 59 23 C82 19 104 22 119 24 C142 26 162 20 187 21 C217 23 228 27 253 23 C274 20 298 21 314 24 C337 26 355 21 382 22 C405 24 419 26 442 23 C470 20 487 22 510 24 C535 26 557 20 580 22"></path>
                <path id="loginWaveC" d="M0 36 C22 32 41 39 64 37 C89 34 105 33 126 37 C151 41 172 35 195 34 C218 34 235 40 258 38 C281 35 300 32 322 36 C349 41 366 39 390 35 C411 32 434 35 456 38 C482 41 501 35 525 34 C545 34 563 38 580 36"></path>
                <path id="loginWaveD" d="M0 51 C21 46 42 55 66 53 C91 50 112 46 137 51 C163 56 182 55 209 50 C236 45 255 49 277 53 C300 57 327 52 352 49 C377 46 395 50 419 54 C444 58 470 52 493 49 C522 46 549 53 580 51"></path>
                <path id="loginWaveE" d="M0 69 C25 63 49 75 75 72 C102 69 119 63 149 67 C177 72 193 77 223 73 C248 69 267 64 291 67 C319 72 339 76 367 71 C397 66 412 64 437 69 C463 75 483 75 508 70 C536 65 556 65 580 69"></path>
                <path id="loginWaveF" d="M0 86 C36 78 58 92 89 90 C120 88 139 79 170 82 C202 86 221 95 254 91 C289 86 300 79 331 82 C362 86 384 94 414 91 C449 87 468 80 499 82 C527 84 555 91 580 86"></path>
              </defs>
              <g class="login-wave-bob"><g class="login-wave-track login-wave-back"><use href="#loginWaveA"></use><use href="#loginWaveA" x="580"></use><use href="#loginWaveB"></use><use href="#loginWaveB" x="580"></use></g></g>
              <g class="login-wave-bob login-wave-bob-mid"><g class="login-wave-track login-wave-mid"><use href="#loginWaveC"></use><use href="#loginWaveC" x="580"></use><use href="#loginWaveD"></use><use href="#loginWaveD" x="580"></use></g></g>
              <g class="login-wave-bob login-wave-bob-front"><g class="login-wave-track login-wave-front"><use href="#loginWaveE"></use><use href="#loginWaveE" x="580"></use><use href="#loginWaveF"></use><use href="#loginWaveF" x="580"></use></g></g>
            </svg>

            <svg class="login-ship" viewBox="0 0 300 165" preserveAspectRatio="xMinYMax meet">
              <defs>
                <g id="loginShipBox">
                  <path class="ship-container-top" d="M0 5 6 1 42 1 36 5Z"></path><path class="ship-container-front" d="M0 5h36v20H0z"></path><path class="ship-container-side" d="m36 5 6-4v20l-6 4Z"></path>
                  <path class="ship-primary" d="M0 5 6 1h36v20l-6 4H0V5h36l6-4M36 5v20"></path>
                  <path class="ship-detail" d="M3 7v16 M9 7v16 M15 7v16 M21 7v16 M27 7v16 M33 7v16 M38 5v17 M1 24h34 M1 6h34"></path>
                  <path class="ship-distant" d="M1 5v3 M35 5v3 M1 22v3 M35 22v3"></path>
                </g>
              </defs>
              <g class="login-ship-moving">
                <path class="ship-hull-fill" d="M7 109 Q77 109 176 105 L263 99 Q282 98 295 103 L277 138 Q271 149 251 152 L62 152 Q31 151 20 139 L8 121Z"></path>
                <path class="ship-deck-fill" d="M10 101 238 99 263 96 277 99 269 105 11 110Z"></path>
                <path class="ship-primary" d="M7 109 Q77 109 176 105 L263 99 Q282 98 295 103 L277 138 Q271 149 251 152 L62 152 Q31 151 20 139 L8 121Z M10 101 238 99 263 96 277 99 269 105 11 110 M12 117 Q99 121 198 114 L284 106 M23 136 Q86 141 176 139 L270 136"></path>
                <path class="ship-detail" d="M22 124 Q126 130 225 119 M35 145 Q121 148 239 146 M14 104h248 M18 99h218 M36 108l4 11 M274 106l-8 27 M53 116h9m5 0h8m5 0h8m5 0h8m5 0h8m5 0h8m5 0h8m5 0h8m5 0h8 M50 129h5m9 1h5m9 0h5m9 0h5m9 0h5m9 0h5m9 0h5"></path>
                <path class="ship-superstructure" d="M22 68h51l8 13v24H20V80Z M27 55h42l4 13H23Z M33 44h31l4 11H29Z M39 38h23v6H37Z"></path>
                <path class="ship-primary" d="M20 105V80l2-12h51l8 13v24 M22 68h51 M23 55h46l4 13 M29 44h39l-4 11H27 M37 38h25v6H34 M18 81h65 M16 101h67"></path>
                <path class="ship-detail" d="M29 80h43 M25 91h55 M31 69v36 M74 81v24 M38 55v13 M57 55v13 M43 44v11 M26 75h50 M22 101h62 M31 38v-3h38v3"></path>
                <path class="ship-window" d="M33 47h7v4h-7z M44 47h7v4h-7z M55 47h7v4h-7z M30 58h7v5h-7z M42 58h7v5h-7z M54 58h7v5h-7z M65 58h5v5h-5z M26 71h6v5h-6z M37 71h6v5h-6z M48 71h6v5h-6z M59 71h6v5h-6z"></path>
                <path class="ship-primary" d="M49 38V23 M45 27h8 M49 23v-5 M58 38V28 M55 31h7 M41 37v-8 M42 30h-4 M22 84v17 M77 85v18 M20 82h63 M21 97h62"></path>
                <path class="ship-detail" d="M51 23h7 M38 30h8 M46 17h6 M16 94h11 M75 94h10 M20 86h63 M18 90h65 M30 101v5 M42 101v5 M55 101v5 M68 101v5"></path>
                <use href="#loginShipBox" x="84" y="79"></use><use href="#loginShipBox" x="125" y="78"></use><use href="#loginShipBox" x="166" y="76"></use><use href="#loginShipBox" x="207" y="75"></use>
                <use href="#loginShipBox" x="87" y="54"></use><use href="#loginShipBox" x="128" y="53"></use><use href="#loginShipBox" x="169" y="51"></use><use href="#loginShipBox" x="210" y="50"></use>
                <use href="#loginShipBox" x="93" y="29"></use><use href="#loginShipBox" x="134" y="28"></use><use href="#loginShipBox" x="175" y="26"></use>
                <path class="ship-primary" d="M80 105h177 M78 77h-4v27 M250 50h5v48 M14 101v-6 M21 101v-6 M28 101v-6 M266 98v-9 M274 99v-9"></path>
                <path class="ship-detail" d="M84 104v4 M125 103v4 M166 102v4 M207 100v4 M84 77h164 M89 52h157 M96 27h119 M32 118l9 17 M191 117h15 M219 115h12 M255 108l-7 14"></path>
              </g>
            </svg>

            <svg class="login-terminal" viewBox="0 0 300 255" preserveAspectRatio="xMaxYMax meet">
              <defs>
                <g id="loginTerminalBox">
                  <path class="terminal-top" d="M0 4 5 1 41 1 36 4Z"></path><path class="terminal-fill" d="M0 4h36v17H0z"></path><path class="terminal-side" d="m36 4 5-3v17l-5 3Z"></path>
                  <path class="terminal-primary" d="M0 4 5 1h36v17l-5 3H0V4h36l5-3M36 4v17"></path>
                  <path class="terminal-detail" d="M3 6v13 M9 6v13 M15 6v13 M21 6v13 M27 6v13 M33 6v13 M2 20h32 M38 4v15"></path>
                </g>
              </defs>
              <g class="terminal-fixed">
                <path class="terminal-distant" d="M5 218h60 M10 213v-19h41v19 M16 194v-12h34v12 M15 182h35 M64 223v-15h40v15 M250 217v-45h36v45 M260 172v-13h32v13 M264 159v-9h25v9 M16 182l24-39 19 39 M35 143v-11 M43 154l27-13"></path>
                <path class="terminal-fill" d="M0 235h300v14H0z"></path><path class="terminal-top" d="M0 232h300v4H0z"></path>
                <path class="terminal-primary" d="M0 232h300 M0 236h300 M0 249h300 M10 242h290 M165 232v-8h11v8 M229 232v-8h11v8"></path>
                <path class="terminal-detail" d="M8 236v13 M42 236v13 M76 236v13 M110 236v13 M144 236v13 M178 236v13 M212 236v13 M246 236v13 M280 236v13 M13 229h13 M86 229h15 M252 229h16 M21 222v10 M27 222v10 M56 222v10 M125 222v10 M269 222v10"></path>
                <use href="#loginTerminalBox" x="23" y="211"></use><use href="#loginTerminalBox" x="61" y="211"></use><use href="#loginTerminalBox" x="36" y="190"></use>
                <use href="#loginTerminalBox" x="92" y="211"></use><use href="#loginTerminalBox" x="240" y="211"></use><use href="#loginTerminalBox" x="262" y="190"></use><use href="#loginTerminalBox" x="250" y="169"></use>
                <path class="terminal-fill" d="M179 24h13l-11 200h-15Z M199 24h13l20 200h-16Z M169 113h56v9h-56Z M164 220h72v6h-72Z"></path>
                <path class="terminal-primary" d="M179 24h33 M184 17h24v7h-24z M189 12h14v5h-14z M179 24 166 224 M192 24 181 224 M199 24 216 224 M212 24 232 224 M166 224h66 M164 220h72v6h-72z M169 113h56v9h-56z M170 157h58 M168 190h62"></path>
                <path class="terminal-detail" d="M179 24 199 53 183 79 213 113 M212 24 187 56 217 80 169 113 M172 122 224 157 169 190 232 224 M225 122 170 157 230 190 166 224 M185 80h27 M176 157h47 M172 190h56 M176 211h55 M174 224l-4 8 M228 224l4 8 M177 227h56"></path>
                <path class="terminal-fill" d="M62 86h238v9H62z"></path><path class="terminal-top" d="M62 84h238v3H62z"></path>
                <path class="terminal-primary" d="M62 84h238 M62 95h238 M62 84 185 30 M212 30 300 84 M62 84l-9 11 M300 84v11 M82 84l7-10 M101 84l8-18 M126 84l10-30 M154 84l10-43 M183 84l7-53 M216 84l-8-50 M243 84l-19-38 M270 84l-33-29 M296 84l-48-21"></path>
                <path class="terminal-detail" d="M65 87 82 95 99 87 116 95 133 87 150 95 167 87 184 95 201 87 218 95 235 87 252 95 269 87 286 95 M75 84v11 M103 84v11 M131 84v11 M159 84v11 M187 84v11 M215 84v11 M243 84v11 M271 84v11 M193 26v57 M201 26v57 M198 34 100 84 M203 34 271 84 M68 95h229"></path>
                <path class="terminal-primary" d="M169 122h58 M171 158h57 M167 191h64 M172 122l53 36 M224 122l-53 36 M170 158l60 33 M228 158l-61 33 M178 99h43 M182 99v12 M217 99v12 M174 123v7 M220 123v7 M175 172h50 M168 204h64 M178 225v7 M226 225v7"></path>
                <path class="terminal-detail" d="M169 122h56 M171 157h57 M170 191h59 M166 203h67 M171 207h61 M176 106h47 M178 100l3 12 M215 100l-2 12 M165 221v11 M237 221v11 M179 224l-4 8 M229 224l4 8 M184 227h35 M78 81h51 M98 77h49 M230 76h56"></path>
                <path class="terminal-fill" d="M151 89h35v8h-35z M158 97h21v5h-21z"></path>
                <path class="terminal-primary" d="M151 89h35v8h-35z M158 97h21v5h-21z M153 92h31 M158 102v3 M179 102v3 M156 89v-5 M181 89v-5"></path>
                <path class="terminal-detail" d="M155 88h27 M163 90v6 M174 90v6 M154 97h30 M145 84v-7 M190 84v-7 M146 77h43"></path>
              </g>
              <path id="loginCargoCables" class="terminal-cables" d="M169 99 L153 148 M169 99 L183 148"></path>
              <g id="loginSuspendedCargo">
                <path class="terminal-top" d="M141 156 147 152h48l-6 4Z"></path><path class="terminal-cargo-fill" d="M141 156h48v29h-48z"></path><path class="terminal-side" d="m189 156 6-4v29l-6 4Z"></path>
                <path class="terminal-primary" d="M141 156 147 152h48v29l-6 4h-48v-29h48l6-4 M189 156v29 M144 148h49v4h-49z M153 148v6 M183 148v6 M142 151v5 M194 151v5"></path>
                <path class="terminal-detail" d="M145 159v23 M151 159v23 M157 159v23 M163 159v23 M169 159v23 M175 159v23 M181 159v23 M186 159v23 M191 156v25 M143 183h44 M143 158h44 M151 154v3 M183 154v3"></path>
              </g>
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
    </dialog>`;

  const siteKey = document.querySelector('meta[name="gport-turnstile-site-key"]')?.content || '';
  document.getElementById('turnstileWidget').dataset.sitekey = siteKey;
})();
