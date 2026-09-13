(()=>{"use strict";const e=document.getElementById("loginMount");if(!e)return;e.outerHTML=`
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
                <path id="loginWaveA" d="M0 14 C24 7 49 21 73 14 S121 7 145 14 S193 21 218 14 S266 7 290 14 S338 21 363 14 S411 7 435 14 S483 21 508 14 S555 7 580 14"></path>
                <path id="loginWaveB" d="M0 33 C30 24 44 42 74 33 S118 25 145 33 S190 42 219 33 S263 25 290 33 S335 42 364 33 S408 25 435 33 S480 42 509 33 S553 25 580 33"></path>
                <path id="loginWaveC" d="M0 54 C20 45 50 63 73 54 S123 45 145 54 S196 63 218 54 S268 45 290 54 S341 63 363 54 S413 45 435 54 S486 63 508 54 S558 45 580 54"></path>
                <path id="loginWaveD" d="M0 78 C26 68 48 87 73 78 S120 69 145 78 S193 87 218 78 S265 69 290 78 S338 87 363 78 S410 69 435 78 S483 87 508 78 S554 69 580 78"></path>
              </defs>
              <g class="login-wave-track login-wave-back"><use href="#loginWaveA"></use><use href="#loginWaveA" x="580"></use><use href="#loginWaveB"></use><use href="#loginWaveB" x="580"></use></g>
              <g class="login-wave-track login-wave-mid"><use href="#loginWaveC"></use><use href="#loginWaveC" x="580"></use></g>
              <g class="login-wave-track login-wave-front"><use href="#loginWaveD"></use><use href="#loginWaveD" x="580"></use></g>
            </svg>

            <svg class="login-ship" viewBox="0 0 240 135" preserveAspectRatio="xMinYMax meet">
              <defs><pattern id="shipRibs" width="7" height="30" patternUnits="userSpaceOnUse"><path d="M1 1v28" fill="none" stroke="#496682" stroke-width=".45"></path></pattern></defs>
              <g class="login-ship-moving">
                <path class="ship-hull-fill" d="M4 91 L197 86 Q217 85 236 92 L220 119 Q211 130 193 132 H43 Q19 129 10 110 Z"></path>
                <path class="ship-outline" d="M4 91 L197 86 Q217 85 236 92 L220 119 Q211 130 193 132 H43 Q19 129 10 110 Z M8 101 Q94 103 189 97 L230 94 M18 115 Q113 121 204 115 M38 132 H200"></path>
                <path class="ship-outline" d="M13 88 H208 M28 70 H75 V89 H28 Z M30 58 H70 V70 H30 Z M35 47 H65 V58 H35 Z M37 40 H63 V47 H37 Z M42 40 V34 H58 V40 M48 34 V23 M43 28 H54 M50 23 V20 M48 30 H60"></path>
                <path class="ship-fill" d="M77 66h43v22H77z M120 61h48v26h-48z M169 72h31v15h-31z M83 47h36v19H83z M123 43h43v18h-43z M169 54h29v18h-29z M91 34h25v13H91z"></path>
                <path class="ship-outline" d="M77 66h43v22H77z M120 61h48v26h-48z M169 72h31v15h-31z M83 47h36v19H83z M123 43h43v18h-43z M169 54h29v18h-29z M91 34h25v13H91z M20 88 H203 M31 70 H70 M34 58 H67"></path>
                <path class="ship-ribs" d="M78 67h41v20H78z M121 62h46v24h-46z M170 73h29v13h-29z M84 48h34v17H84z M124 44h41v16h-41z M170 55h27v16h-27z"></path>
                <path class="ship-outline thin" d="M89 48v18 M101 48v18 M113 48v18 M130 44v17 M142 44v17 M154 44v17 M92 34v13 M103 34v13 M89 67v20 M101 67v20 M113 67v20 M131 62v24 M143 62v24 M155 62v24 M179 55v17 M189 55v17 M179 73v13 M189 73v13 M32 63h4m5 0h4m5 0h4m5 0h4 M37 52h4m5 0h4m5 0h4 M40 43h3m4 0h3m4 0h3 M203 93l-8 13 M14 96l18 1"></path>
                <path class="ship-outline" d="M52 107h14l4 7H55z M181 102h8l3 5h-8z M19 120h200"></path>
              </g>
            </svg>

            <svg class="login-terminal" viewBox="0 0 300 255" preserveAspectRatio="xMaxYMax meet">
              <defs><pattern id="terminalRibs" width="6" height="28" patternUnits="userSpaceOnUse"><path d="M1 1v27" fill="none" stroke="#536d88" stroke-width=".5"></path></pattern></defs>
              <g class="terminal-fixed">
                <path class="terminal-outline" d="M1 239 H300 M8 245 H300 M12 231 H80 M83 231 H143 M179 231 H298"></path>
                <path class="terminal-fill" d="M25 218h52v20H25z M39 199h42v19H39z M78 222h60v16H78z M215 215h47v23h-47z M245 193h50v45h-50z M260 175h36v18h-36z"></path>
                <path class="terminal-outline" d="M25 218h52v20H25z M39 199h42v19H39z M78 222h60v16H78z M215 215h47v23h-47z M245 193h50v45h-50z M260 175h36v18h-36z M50 199v19 M65 199v19 M95 222v16 M112 222v16 M230 215v23 M248 215v23 M260 193v45 M276 193v45"></path>
                <path class="terminal-ribs" d="M26 219h50v18H26z M40 200h40v17H40z M79 223h58v14H79z M216 216h45v21h-45z M246 194h48v43h-48z M261 176h34v16h-34z"></path>
                <path class="terminal-outline" d="M189 21h11v7h-11z M190 28l-15 169 M199 28l21 169 M175 197h45v7h-45z M175 204l-5 34 M220 204l7 34 M170 238h57 M185 81h19 M189 28 L102 84 M199 28 L294 85 M102 84h198 M110 90h190 M102 84l-9 9 M112 84l-8 9 M125 84l-8 9 M138 84l-8 9 M151 84l-8 9 M164 84l-8 9 M177 84l-8 9 M190 84l-8 9 M203 84l-8 9 M216 84l-8 9 M229 84l-8 9 M242 84l-8 9 M255 84l-8 9 M268 84l-8 9 M281 84l-8 9"></path>
                <path class="terminal-outline" d="M175 197l45-82 M220 197l-45-82 M182 115h31 M178 159h38 M179 159l38 38 M215 159l-40 38 M176 96h42 M179 96l36 19 M215 96l-36 19 M115 84 L195 34 M181 85 L195 34 M199 34 L263 84 M213 85 L199 34 M216 197h14v41 M168 238v-18h13 M224 238v-23h13 M251 193v-13h8"></path>
                <path class="terminal-outline thin" d="M98 94h202 M114 78h80 M117 77l80-44 M209 42l76 43 M177 204h43 M171 229h56 M247 198h46 M248 207h46 M248 218h46 M262 180h33"></path>
                <path class="terminal-fill" d="M156 91h26v7h-26z"></path><path class="terminal-outline" d="M156 91h26v7h-26z M162 98v4 M176 98v4"></path>
              </g>
              <path id="loginCargoCables" class="terminal-cables" d="M169 99 L153 154 M169 99 L183 154"></path>
              <g id="loginSuspendedCargo"><path class="terminal-cargo-fill" d="M141 154h54v29h-54z"></path><path class="terminal-outline" d="M141 154h54v29h-54z M146 157v23 M152 157v23 M158 157v23 M164 157v23 M170 157v23 M176 157v23 M182 157v23 M188 157v23 M144 150h48 M153 150v4 M183 150v4"></path></g>
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
    </dialog>`;const a=document.querySelector('meta[name="gport-turnstile-site-key"]')?.content||"";document.getElementById("turnstileWidget").dataset.sitekey=a})();
