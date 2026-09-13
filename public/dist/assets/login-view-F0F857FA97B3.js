(()=>{"use strict";const a=document.getElementById("loginMount");if(!a)return;a.outerHTML=`
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

          <svg class="login-harbor-art" viewBox="0 0 955 941" preserveAspectRatio="xMinYMax meet" aria-hidden="true">
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
            <g class="water-detail" fill="none" stroke="#42688a" stroke-width=".8">
              <path d="M-35 799 C12 783 42 809 83 797 S151 790 191 803 S257 784 297 796 S369 810 409 796 S473 788 520 803 S595 783 642 797 S718 807 767 795 S844 787 895 803 S969 785 1026 795 S1114 807 1175 796"></path>
              <path d="M-41 814 C11 801 44 825 92 813 S165 801 212 817 S283 803 331 812 S404 825 455 814 S532 803 584 819 S661 801 714 814 S792 828 841 813 S921 803 977 818 S1059 802 1112 816 S1174 804 1220 814"></path>
              <path d="M-28 830 C35 814 58 846 118 831 S192 816 244 832 S317 846 374 830 S454 819 512 834 S588 815 648 829 S728 845 785 829 S861 817 919 835 S994 816 1054 830 S1124 843 1190 828"></path>
              <path d="M-38 848 C17 833 47 863 105 847 S184 835 240 850 S319 835 376 848 S451 862 508 849 S584 834 644 850 S721 835 781 847 S856 862 915 849 S996 834 1051 850 S1134 836 1192 847"></path>
              <path d="M-39 870 C19 854 61 882 119 868 S193 856 249 872 S324 856 378 870 S456 883 515 869 S592 854 650 872 S730 858 790 869 S865 881 926 869 S1002 856 1058 871 S1132 856 1190 871"></path>
              <path d="M-26 894 C29 881 63 908 120 894 S193 879 251 897 S324 880 380 894 S454 908 512 896 S590 880 649 895 S724 881 786 896 S861 907 921 895 S995 879 1057 896 S1129 882 1196 895"></path>
              <path d="M-35 923 C31 906 62 937 125 922 S197 909 254 924 S332 910 390 923 S468 938 524 924 S601 909 663 926 S741 910 801 922 S881 937 941 924 S1022 909 1081 927 S1150 908 1210 924"></path>
            </g>
            <g id="ship"><image href="login-animation/ship.png?v=20260911.2" x="39" y="608" width="386" height="209"></image></g>
            <g id="craneAssembly">
              <image class="crane-illustration" href="login-animation/crane-detail-v3.png?v=20260912.1" x="427" y="420" width="650" height="367" preserveAspectRatio="xMidYMid meet"></image>
            <path id="cable" d="M687 562 L687 610 M690 562 L690 610" fill="none" stroke="#38516a" stroke-width="1.1"></path>
            <g id="cargo"><image href="login-animation/cargo.png?v=20260911.2" x="621" y="596" width="132" height="121"></image></g>
            </g>
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
    </dialog>`;const e=document.querySelector('meta[name="gport-turnstile-site-key"]')?.content||"";document.getElementById("turnstileWidget").dataset.sitekey=e})();
